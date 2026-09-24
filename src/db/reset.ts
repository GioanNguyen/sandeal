/**
 * npm run db:reset – dùng khi cơ sở dữ liệu PGlite (dev) bị hỏng.
 * Cất thư mục dữ liệu cũ sang .data/pglite-hong-<thời gian> (không xoá, phòng khi cần lấy lại), rồi tạo dữ liệu mẫu mới.
 */
import fs from "node:fs";
import path from "node:path";

async function main() {
  if ((process.env.DATABASE_URL ?? "").startsWith("postgres")) {
    console.error("[db] DATABASE_URL đang trỏ tới Postgres thật – lệnh này chỉ dành cho PGlite khi phát triển.");
    process.exit(1);
  }
  const dir = path.resolve(process.env.PGLITE_DIR ?? ".data/pglite");
  const lock = `${dir}.lock`;
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8").trim());
    let alive = false;
    try {
      if (pid) process.kill(pid, 0), (alive = true);
    } catch (err) {
      alive = (err as NodeJS.ErrnoException).code === "EPERM";
    }
    if (alive) {
      console.error(`[db] "npm run dev" (pid ${pid}) đang chạy – hãy tắt nó (Ctrl+C) rồi chạy lại "npm run db:reset".`);
      process.exit(1);
    }
    fs.unlinkSync(lock);
  }
  if (fs.existsSync(dir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backup = `${dir}-hong-${stamp}`;
    fs.renameSync(dir, backup);
    console.log(`[db] Đã cất dữ liệu cũ sang ${path.relative(process.cwd(), backup)} (xoá thư mục này khi không cần nữa).`);
  }
  const { seed } = await import("@/worker/seed");
  const { closeDb } = await import("@/lib/db");
  await seed();
  await closeDb();
  console.log('[db] Đã tạo lại dữ liệu mẫu. Chạy "npm run dev" để mở web.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
