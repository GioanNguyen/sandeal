/** Chạy khi server Next.js khởi động: migrate DB và (tuỳ chọn) chạy lịch đồng bộ ngay trong tiến trình web. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureMigrated, dbKind } = await import("@/lib/db");
  await ensureMigrated();
  // Với PGlite (dev) chỉ một tiến trình được mở DB, nên worker chạy chung với web.
  const inWeb = process.env.RUN_WORKER_IN_WEB ? process.env.RUN_WORKER_IN_WEB === "1" : dbKind() === "pglite";
  if (inWeb) {
    const { startScheduler } = await import("@/worker/scheduler");
    startScheduler({ runNow: process.env.SYNC_ON_START === "1" });
  }
}
