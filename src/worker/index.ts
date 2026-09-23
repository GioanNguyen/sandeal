import cron from "node-cron";
import { runSync } from "./sync";

const schedule = process.env.SYNC_CRON || "0 */2 * * *";
let running = false;

async function tick() {
  if (running) return; // không chạy chồng
  running = true;
  try {
    await runSync();
  } finally {
    running = false;
  }
}

console.log(`[worker] lịch đồng bộ: ${schedule}`);
cron.schedule(schedule, tick, { timezone: "Asia/Ho_Chi_Minh" });
tick();
