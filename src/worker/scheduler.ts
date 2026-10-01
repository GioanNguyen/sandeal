import cron from "node-cron";
import { pollTelegram, runDigests, runSaleReminders } from "./digest";
import { postGoldenHour } from "./social";
import { runSync } from "./sync";
import { runSaleStartAlerts, runWeeklySummary } from "./alerts";
import { runImageIndex } from "./image-index";
import { runReviewAi } from "@/lib/reviews/ai";

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

  // Bản tin theo sở thích + nhắc sale: kiểm tra mỗi giờ (mỗi người tối đa 1 lần/ngày, 1 lần/đợt sale)
  cron.schedule(
    "7 * * * *",
    async () => {
      try {
        const d = await runDigests();
        const r = await runSaleReminders();
        if (d || r) console.log(`[notify] bản tin: ${d}, nhắc sale: ${r}`);
      } catch (err) {
        console.error("[notify] lỗi:", err);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );

  // Nhắc từng món khi sale bắt đầu (0h15 trở đi, sau lần đồng bộ giá lúc 0h) + mail tóm tắt cuối tuần: kiểm tra mỗi 15 phút
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const a = await runSaleStartAlerts();
        const w = await runWeeklySummary();
        if (a || w) console.log(`[notify] nhắc sale từng món: ${a} người, tóm tắt tuần: ${w} người`);
      } catch (err) {
        console.error("[notify] lỗi nhắc sale/tóm tắt tuần:", err);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );

  // Đăng deal hot lên mạng xã hội vào giờ vàng (mặc định 11h và 20h)
  const hours = (process.env.SOCIAL_HOURS || "11,20").replace(/\s/g, "");
  cron.schedule(
    `0 ${hours} * * *`,
    async () => {
      try {
        const n = await postGoldenHour();
        if (n) console.log(`[social] đã đăng ${n} bài`);
      } catch (err) {
        console.error("[social] lỗi:", err);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );

  // Tìm bằng ảnh: nhận diện ảnh các món mới/đổi ảnh mỗi 20 phút; lần đầu chạy sau khi web khởi động 1 phút
  cron.schedule("*/20 * * * *", () => void runImageIndex(), { timezone: "Asia/Ho_Chi_Minh" });
  setTimeout(() => void runImageIndex(), 60_000).unref?.();

  // Tóm tắt đánh giá bằng AI (chỉ khi có ANTHROPIC_API_KEY): mỗi giờ, cho các món vừa có thêm đủ đánh giá mới
  cron.schedule(
    "37 * * * *",
    async () => {
      try {
        const n = await runReviewAi();
        if (n) console.log(`[reviews] đã tóm tắt AI ${n} món`);
      } catch (err) {
        console.error("[reviews] lỗi tóm tắt AI:", (err as Error).message);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );

  // Liên kết Telegram cá nhân: đọc tin nhắn gửi tới bot mỗi 20 giây
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setInterval(() => void pollTelegram().catch(() => 0), 20_000);
  }
}
