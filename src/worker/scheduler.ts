import cron from "node-cron";
import { pollTelegram, runDigests, runSaleReminders } from "./digest";
import { postGoldenHour } from "./social";
import { runSync } from "./sync";
import { runSaleStartAlerts, runWeeklySummary } from "./alerts";
import { imageIndexing, runImageIndex } from "./image-index";
import { postReel, prepareReels, reelHours, reelsEnabled } from "./reels";
import { runReviewAi } from "@/lib/reviews/ai";
import { shareDueGuides } from "./guides";
import { ensureGuidePipeline, guideAiEnabled } from "./guide-ai";
import { pruneVitals } from "@/lib/vitals";

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

  // Reels Facebook: dựng sẵn video vào giờ vắng (mặc định 5h20), đăng vào giờ vàng (mặc định 12h05, 21h05).
  // Không dựng khi đang nhận diện ảnh sản phẩm (2 việc cùng tốn RAM): chờ tối đa 30 phút.
  if (reelsEnabled()) {
    const waitIdle = async () => {
      for (let i = 0; i < 60 && imageIndexing(); i++) await new Promise((r) => setTimeout(r, 30_000));
    };
    const prepHour = Math.min(23, Math.max(0, Number(process.env.REELS_PREPARE_HOUR ?? 5) || 0));
    cron.schedule(
      `20 ${prepHour} * * *`,
      async () => {
        try {
          await waitIdle();
          const n = await prepareReels();
          if (n) console.log(`[reels] đã dựng sẵn ${n} video`);
        } catch (err) {
          console.error("[reels] lỗi dựng sẵn:", (err as Error).message);
        }
      },
      { timezone: "Asia/Ho_Chi_Minh" },
    );
    const hours = reelHours();
    if (hours.length) {
      cron.schedule(
        `5 ${hours.join(",")} * * *`,
        async () => {
          try {
            await waitIdle();
            const r = await postReel();
            console.log(r.ok ? `[reels] đã đăng Reel món ${r.productId} (video ${r.videoId})` : `[reels] không đăng được: ${r.error}`);
          } catch (err) {
            console.error("[reels] lỗi đăng:", (err as Error).message);
          }
        },
        { timezone: "Asia/Ho_Chi_Minh" },
      );
    }
  }

  // Bài hướng dẫn theo lịch: tự hiện trên site lúc 8h ngày đăng; đăng link lên Trang Facebook từ 8h12 (thử lại mỗi giờ nếu lỗi)
  cron.schedule(
    "12 8-21 * * *",
    async () => {
      try {
        await shareDueGuides();
      } catch (err) {
        console.error("[guides] lỗi đăng bài:", (err as Error).message);
      }
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );

  // Bài hướng dẫn do AI soạn (khi có ANTHROPIC_API_KEY): thứ Hai 9h15, nếu 3 tuần tới thiếu bài thì soạn 1 bài nháp
  // và email quản trị viên để duyệt
  if (guideAiEnabled()) {
    cron.schedule(
      "15 9 * * 1",
      async () => {
        try {
          const r = await ensureGuidePipeline();
          if (r.drafted || r.approved) console.log(`[guide-ai] soạn ${r.drafted} bài nháp, tự duyệt ${r.approved} bài`);
        } catch (err) {
          console.error("[guide-ai] lỗi:", (err as Error).message);
        }
      },
      { timezone: "Asia/Ho_Chi_Minh" },
    );
  }

  // Số đo tốc độ trang: xoá bản ghi quá 60 ngày, mỗi đêm 3h40
  cron.schedule("40 3 * * *", () => void pruneVitals().catch((err) => console.error("[vitals] lỗi dọn dữ liệu:", (err as Error).message)), { timezone: "Asia/Ho_Chi_Minh" });

  // Liên kết Telegram cá nhân: đọc tin nhắn gửi tới bot mỗi 20 giây
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setInterval(() => void pollTelegram().catch(() => 0), 20_000);
  }
}
