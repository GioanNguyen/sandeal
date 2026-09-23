import cron from "node-cron";
import { runSync } from "./sync";

const g = globalThis as unknown as { __sanDealCron?: boolean };

export function startScheduler({ runNow = false } = {}) {
  if (g.__sanDealCron) return;
  g.__sanDealCron = true;
  const schedule = process.env.SYNC_CRON || "0 */2 * * *";
  let running = false;
  const tick = async () => {
    if (running) return; // không chạy chồng
    running = true;
    try {
      await runSync();
    } finally {
      running = false;
    }
  };
  console.log(`[worker] lịch đồng bộ: ${schedule} (Asia/Ho_Chi_Minh)`);
  cron.schedule(schedule, tick, { timezone: "Asia/Ho_Chi_Minh" });
  if (runNow) void tick();
}
