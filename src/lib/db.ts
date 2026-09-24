import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "@/db/schema";

/**
 * DATABASE_URL = postgres://...  -> Postgres thật (production, docker)
 * DATABASE_URL trống              -> PGlite: Postgres nhúng, lưu tại PGLITE_DIR (mặc định ./.data/pglite)
 * DATABASE_URL = memory://        -> PGlite trong RAM (dùng cho test)
 */
export type DB = NodePgDatabase<typeof schema>;

type Holder = { db?: DB; migrated?: Promise<void>; kind?: "pg" | "pglite"; lite?: PGlite; dir?: string };
const g = globalThis as unknown as { __sanDeal?: Holder };
const holder: Holder = (g.__sanDeal ??= {});

function create(): DB {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    holder.kind = "pg";
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    return drizzlePg(pool, { schema });
  }
  holder.kind = "pglite";
  const dir = url.startsWith("memory://") ? undefined : path.resolve(process.env.PGLITE_DIR ?? ".data/pglite");
  if (dir) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    claimLock(dir);
  }
  const client = new PGlite(dir);
  holder.lite = client;
  holder.dir = dir;
  client.waitReady.catch((err) => {
    if (dir) console.error(brokenMessage(dir), "\n", err);
  });
  closeOnExit(client);
  return drizzleLite(client, { schema }) as unknown as DB;
}

/**
 * PGlite chỉ cho MỘT tiến trình mở thư mục dữ liệu. Hai tiến trình cùng ghi (vd. chạy `npm run seed`
 * khi `npm run dev` đang bật) sẽ làm hỏng dữ liệu. Ghi pid vào file khoá và từ chối nếu tiến trình khác đang giữ.
 */
function claimLock(dir: string) {
  const lock = `${dir}.lock`;
  try {
    const pid = Number(fs.readFileSync(lock, "utf8").trim());
    // Chỉ chặn ở các script (seed/sync/worker); bên trong Next.js (dev/build nhiều worker) thì không chặn.
    const inNext = Boolean(process.env.NEXT_RUNTIME || process.env.NEXT_PHASE);
    if (!inNext && pid && pid !== process.pid && alive(pid)) {
      throw new Error(
        `[db] Cơ sở dữ liệu ${dir} đang được tiến trình khác (pid ${pid}) sử dụng – thường là "npm run dev".\n` +
          `     Hãy tắt tiến trình đó (Ctrl+C) rồi chạy lại lệnh này. Hai tiến trình cùng mở PGlite sẽ làm hỏng dữ liệu.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.writeFileSync(lock, String(process.pid));
  process.once("exit", () => {
    try {
      if (fs.readFileSync(lock, "utf8").trim() === String(process.pid)) fs.unlinkSync(lock);
    } catch {}
  });
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Đóng PGlite gọn gàng khi Ctrl+C / tắt server để dữ liệu được ghi xuống đĩa trọn vẹn. */
function closeOnExit(client: PGlite) {
  let closing = false;
  const handler = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(0), 3000);
    client
      .close()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        process.kill(process.pid, signal);
      });
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, handler);
}

/** Đóng DB trước khi script tự thoát (seed/sync). */
export async function closeDb() {
  if (holder.lite && !holder.lite.closed) await holder.lite.close().catch(() => {});
}

function brokenMessage(dir: string) {
  return (
    `\n[db] Không mở được cơ sở dữ liệu PGlite tại ${dir} – dữ liệu có thể đã bị hỏng\n` +
    `     (thường do tắt ngang lúc đang ghi, hoặc hai tiến trình cùng mở một lúc).\n` +
    `     Cách sửa: chạy "npm run db:reset" (cất thư mục hỏng sang .data/pglite-hong-*, tạo lại dữ liệu mẫu) rồi "npm run dev".\n`
  );
}

/** Mở DB khi dùng lần đầu (không mở ngay lúc import) */
function real(): DB {
  return (holder.db ??= create());
}

/**
 * Mở DB "lười": chỉ import module thì chưa mở. Quan trọng với PGlite khi `next dev`: Next nạp module trang
 * trong các tiến trình phụ ngắn hạn (kiểm tra route động). Nếu mở DB ngay lúc import, các tiến trình đó
 * cùng mở thư mục dữ liệu với server chính -> dễ hỏng dữ liệu.
 */
export const db: DB = new Proxy({} as DB, {
  get(_t, key) {
    const target = real() as unknown as Record<PropertyKey, unknown>;
    const v = target[key];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  },
});
export const dbKind = () => {
  real();
  return holder.kind;
};

/** Chạy migration (idempotent). Gọi khi khởi động web/worker/script. */
export function ensureMigrated(): Promise<void> {
  holder.migrated ??= (async () => {
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    const conn = real();
    if (holder.kind === "pg") await migratePg(conn, { migrationsFolder });
    else {
      try {
        await migrateLite(conn as never, { migrationsFolder });
      } catch (err) {
        if (holder.dir) console.error(brokenMessage(holder.dir));
        throw err;
      }
    }
  })();
  return holder.migrated;
}

export { schema };
