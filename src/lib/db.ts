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

type Holder = { db?: DB; migrated?: Promise<void>; kind?: "pg" | "pglite" };
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
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  return drizzleLite(client, { schema }) as unknown as DB;
}

export const db: DB = (holder.db ??= create());
export const dbKind = () => holder.kind;

/** Chạy migration (idempotent). Gọi khi khởi động web/worker/script. */
export function ensureMigrated(): Promise<void> {
  holder.migrated ??= (async () => {
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    if (holder.kind === "pg") await migratePg(db, { migrationsFolder });
    else await migrateLite(db as never, { migrationsFolder });
  })();
  return holder.migrated;
}

export { schema };
