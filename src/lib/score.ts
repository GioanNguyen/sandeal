/**
 * Điểm deal 0–100: ưu tiên mức giảm so với giá thật 30 ngày,
 * không tin hoàn toàn "giá gốc" do shop tự khai.
 */
export interface ScoreInput {
  price: number;
  discountPct: number; // % giảm sàn hiển thị (0–100)
  rating?: number | null;
  sold?: number | null;
  history: { price: number; capturedAt: Date }[]; // lịch sử giá, mọi thứ tự
  now?: Date;
}

export interface ScoreResult {
  score: number;
  realDropPct: number;
  inflatedBeforeSale: boolean;
}

const DAY = 86_400_000;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function computeDealScore(input: ScoreInput): ScoreResult {
  const now = input.now ?? new Date();
  const hist = input.history
    .filter((p) => now.getTime() - p.capturedAt.getTime() <= 30 * DAY)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const listed = clamp(input.discountPct / 100, 0, 1);
  const spanDays = hist.length ? (now.getTime() - hist[0].capturedAt.getTime()) / DAY : 0;

  let realDrop: number;
  if (spanDays >= 7) {
    const med = median(hist.map((p) => p.price));
    realDrop = med > 0 ? clamp((med - input.price) / med, 0, 0.6) : 0;
  } else {
    // Chưa đủ lịch sử: tạm tin một nửa mức giảm sàn khai
    realDrop = clamp(listed * 0.5, 0, 0.6);
  }

  // Phát hiện nâng giá ảo: giá tăng >15% trong 14 ngày trước khi giảm
  const recent = hist.filter((p) => now.getTime() - p.capturedAt.getTime() <= 14 * DAY);
  // Giá "giảm" chỉ quay về mức trước khi bị đẩy lên => không phải deal thật
  let inflated = false;
  if (recent.length >= 2) {
    const prices = recent.map((p) => p.price);
    const peak = Math.max(...prices);
    const peakIdx = prices.indexOf(peak);
    if (peakIdx > 0) {
      const baseline = Math.min(...prices.slice(0, peakIdx));
      inflated = peak > baseline * 1.15 && input.price >= baseline * 0.95;
    }
  }

  const ratingPart = input.rating ? clamp(input.rating / 5, 0, 1) : 0.6;
  const soldPart = clamp(Math.log10((input.sold ?? 0) + 1) / 4, 0, 1);

  let score = 100 * (0.5 * (realDrop / 0.6) + 0.2 * listed + 0.15 * ratingPart + 0.15 * soldPart);
  if (inflated) score -= 20;

  return {
    score: Math.round(clamp(score, 0, 100) * 10) / 10,
    realDropPct: Math.round(realDrop * 1000) / 10,
    inflatedBeforeSale: inflated,
  };
}
