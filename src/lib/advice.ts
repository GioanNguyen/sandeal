/**
 * "Nên mua ngay hay chờ?" – kết luận dựa trên lịch sử giá thật và lịch sale.
 * Chỉ dùng số liệu đã theo dõi; không đủ dữ liệu thì nói rõ là chưa đủ.
 */
import { salesBetween, upcomingSales, type SaleEvent } from "./sales";
import { timeWeightedMedian } from "./score";

export type AdviceVerdict = "buy" | "consider" | "wait" | "new";

export interface SaleMark {
  name: string;
  short: string; // "9.9", "10.10", "BF"
  start: Date;
  end: Date;
  /** Giá thấp nhất ghi nhận trong ngày sale (null nếu không có dữ liệu ngày đó) */
  low: number | null;
}

export interface Advice {
  verdict: AdviceVerdict;
  title: string;
  reasons: string[];
  usual: number;
  low: number;
  high: number;
  lowAt: Date | null;
  /** % thời gian trong lịch sử mà giá cao hơn giá hiện tại (0–100) */
  cheaperThanPct: number;
  /** % rẻ hơn giá thường ngày (âm = đắt hơn) */
  belowUsualPct: number;
  trackedDays: number;
  sales: SaleMark[];
  nextSale: (SaleEvent & { days: number; pastLow: number | null }) | null;
}

type Pt = { price: number; capturedAt: Date };
const DAY = 86_400_000;
const r = Math.round;
const vndShort = (n: number) => n.toLocaleString("vi-VN") + " ₫";
const shortName = (e: SaleEvent) => (e.name.match(/\d+\.\d+/)?.[0] ?? (e.name.includes("Black Friday") ? "Black Friday" : e.name));

/** Giá thấp nhất có hiệu lực trong khoảng [a, b] (giá trước khoảng vẫn tính nếu chưa đổi) */
function lowIn(hist: Pt[], a: Date, b: Date): number | null {
  let lo: number | null = null;
  for (let i = 0; i < hist.length; i++) {
    const s = hist[i].capturedAt.getTime(), e = hist[i + 1]?.capturedAt.getTime() ?? Infinity;
    if (e > a.getTime() && s <= b.getTime()) lo = lo == null ? hist[i].price : Math.min(lo, hist[i].price);
  }
  return lo;
}

/** Tỷ lệ thời gian (theo thời lượng) mà giá cao hơn giá hiện tại */
function shareHigher(hist: Pt[], price: number, now: Date) {
  let hi = 0, total = 0;
  hist.forEach((p, i) => {
    const w = Math.max(1, (hist[i + 1]?.capturedAt.getTime() ?? now.getTime()) - p.capturedAt.getTime());
    total += w;
    if (p.price > price) hi += w;
  });
  return total ? (hi / total) * 100 : 0;
}

export function buyAdvice(history: Pt[], price: number, now = new Date()): Advice {
  const hist = [...history].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const trackedDays = hist.length ? (now.getTime() - hist[0].capturedAt.getTime()) / DAY : 0;
  const all = [...hist.map((h) => h.price), price];
  const low = Math.min(...all), high = Math.max(...all);
  const lowPt = [...hist].reverse().find((h) => h.price === low) ?? null;
  const usual = hist.length ? timeWeightedMedian(hist, now) : price;
  const belowUsualPct = usual ? ((usual - price) / usual) * 100 : 0;
  const cheaperThanPct = shareHigher(hist, price, now);

  const from = hist[0]?.capturedAt ?? now;
  const sales: SaleMark[] = salesBetween(from, now).map((e) => ({ name: e.name, short: shortName(e), start: e.start, end: e.end, low: lowIn(hist, e.start, e.end) }));
  const pastSaleLows = sales.map((s) => s.low).filter((x): x is number => x != null);
  const pastSaleLow = pastSaleLows.length ? Math.min(...pastSaleLows) : null;

  const up = upcomingSales(now, 6).find((e) => e.kind !== "payday" && e.start > now);
  const days = up ? Math.ceil((up.start.getTime() - now.getTime()) / DAY) : Infinity;
  const nextSale = up && days <= 21 ? { ...up, days, pastLow: pastSaleLow } : null;

  const base = { usual, low, high, lowAt: lowPt?.capturedAt ?? null, cheaperThanPct, belowUsualPct, trackedDays, sales, nextSale };

  if (trackedDays < 7) {
    return {
      ...base,
      verdict: "new",
      title: "Chưa đủ dữ liệu để kết luận",
      reasons: [`Mới theo dõi ${Math.max(1, Math.floor(trackedDays))} ngày – cần khoảng 7 ngày để biết giá thường ngày.`, "Bấm ♡ hoặc đặt cảnh báo để được báo khi giá giảm."],
    };
  }

  const reasons: string[] = [];
  const atLow = price <= low * 1.02;
  // Sale lớn sắp tới & trước đây món này từng xuống thấp hơn hiện tại ≥5% trong ngày sale
  const saleCheaper = nextSale && nextSale.pastLow != null && nextSale.pastLow <= price * 0.95;

  if (belowUsualPct >= 3) reasons.push(`Rẻ hơn giá thường ngày ${r(belowUsualPct)}% (${vndShort(usual)}).`);
  else if (belowUsualPct <= -3) reasons.push(`Đang cao hơn giá thường ngày ${r(-belowUsualPct)}% (${vndShort(usual)}).`);
  else reasons.push(`Ngang giá thường ngày (${vndShort(usual)}).`);
  reasons.push(
    atLow
      ? `Đang ở mức thấp nhất trong ${Math.floor(trackedDays)} ngày theo dõi.`
      : `Rẻ hơn ${r(cheaperThanPct)}% thời gian trong ${Math.floor(trackedDays)} ngày qua · thấp nhất từng có ${vndShort(low)}.`,
  );

  let verdict: AdviceVerdict;
  let title: string;
  if (saleCheaper) {
    verdict = atLow || belowUsualPct >= 15 ? "consider" : "wait";
    title = verdict === "wait" ? `Nên chờ ${nextSale!.name.replace(/ – .*/, "")}` : "Giá tốt, nhưng sale lớn sắp tới";
    reasons.push(`${nextSale!.name.replace(/ – .*/, "")} còn ${nextSale!.days} ngày – dịp sale trước món này từng xuống ${vndShort(nextSale!.pastLow!)}.`);
  } else if (atLow || belowUsualPct >= 10) {
    verdict = "buy";
    title = "Giá tốt, nên mua ngay";
    if (nextSale) reasons.push(`${nextSale.name.replace(/ – .*/, "")} còn ${nextSale.days} ngày, nhưng các đợt sale trước chưa rẻ hơn mức này.`);
  } else if (belowUsualPct > -3) {
    verdict = "consider";
    title = "Giá ổn, chưa phải tốt nhất";
    reasons.push("Không vội: đặt cảnh báo để được báo khi giá về gần mức thấp nhất.");
  } else {
    verdict = "wait";
    title = "Chưa nên mua lúc này";
    reasons.push("Giá đang cao hơn bình thường – thường sẽ về lại mức cũ.");
  }
  return { ...base, verdict, title, reasons };
}
