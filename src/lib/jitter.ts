/**
 * Giờ đăng lệch ngẫu nhiên vài phút mỗi lần (bài deal, Reels, bài hướng dẫn) để Trang không đăng đúng một phút
 * mỗi ngày như máy. Lịch vẫn chạy đúng giờ gốc, sau đó chờ thêm 0…POST_JITTER_MIN phút rồi mới đăng.
 *
 * .env: POST_JITTER_MIN (mặc định 20, tối đa 45, 0 = tắt)
 */
export const DEFAULT_JITTER_MIN = 20;
const MAX_JITTER_MIN = 45;

export function postJitterMin(): number {
  const raw = process.env.POST_JITTER_MIN;
  const n = raw === undefined || raw.trim() === "" ? DEFAULT_JITTER_MIN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_JITTER_MIN, Math.floor(n));
}

/** Số mili giây chờ: ngẫu nhiên từ 0 tới `maxMin` phút, làm tròn tới giây */
export function jitterMs(maxMin = postJitterMin(), rand: () => number = Math.random): number {
  if (maxMin <= 0) return 0;
  const r = Math.min(Math.max(rand(), 0), 0.999_999);
  return Math.floor(r * maxMin * 60) * 1000;
}

/** Chờ một khoảng ngẫu nhiên rồi chạy việc đăng; ghi log giờ sẽ đăng */
export async function afterJitter<T>(label: string, fn: () => Promise<T>, wait = jitterMs()): Promise<T> {
  if (wait > 0) {
    const at = new Date(Date.now() + wait).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
    console.log(`[${label}] lệch giờ ngẫu nhiên: đăng lúc ${at}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  return fn();
}
