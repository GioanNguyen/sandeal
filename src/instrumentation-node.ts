import { dbKind, ensureMigrated } from "@/lib/db";
import { startScheduler } from "@/worker/scheduler";

/** Migrate DB và (tuỳ chọn) chạy lịch đồng bộ ngay trong tiến trình web. */
export async function startup() {
  await ensureMigrated();
  // Với PGlite (dev) chỉ một tiến trình được mở DB, nên worker chạy chung với web.
  const inWeb = process.env.RUN_WORKER_IN_WEB ? process.env.RUN_WORKER_IN_WEB === "1" : dbKind() === "pglite";
  if (inWeb) startScheduler({ runNow: process.env.SYNC_ON_START === "1" });
}
