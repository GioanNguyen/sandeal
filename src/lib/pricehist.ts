/** Công cụ chung đọc lịch sử giá (dùng cho trang shop, so sánh, báo cáo tuần, deal theo ngày) */
import { and, inArray, lt } from "drizzle-orm";
import { pricePoints } from "@/db/schema";
import { db } from "./db";

export const DAY = 86_400_000;
const VN = 7 * 3_600_000;
export type Pt = { price: number; at: number };

/** Lịch sử giá theo sản phẩm (tăng dần theo thời gian); `since` để giới hạn, vẫn giữ 1 điểm ngay trước mốc */
export async function loadHistory(ids: number[], since?: Date, until?: Date): Promise<Map<number, Pt[]>> {
  const out = new Map<number, Pt[]>();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 2000) {
    const chunk = ids.slice(i, i + 2000);
    const rows = await db
      .select({ productId: pricePoints.productId, price: pricePoints.price, capturedAt: pricePoints.capturedAt })
      .from(pricePoints)
      .where(and(inArray(pricePoints.productId, chunk), until ? lt(pricePoints.capturedAt, until) : undefined))
      .orderBy(pricePoints.capturedAt);
    for (const r of rows) (out.get(r.productId) ?? out.set(r.productId, []).get(r.productId)!).push({ price: r.price, at: r.capturedAt.getTime() });
  }
  if (since) {
    const s = since.getTime();
    for (const [k, pts] of out) {
      const idx = pts.findIndex((p) => p.at >= s);
      out.set(k, idx <= 0 ? (idx === -1 ? pts.slice(-1) : pts) : pts.slice(idx - 1));
    }
  }
  return out;
}

/** Giá có hiệu lực tại thời điểm t (giá gần nhất trước hoặc bằng t) */
export function priceAt(pts: Pt[], t: number): number | undefined {
  let v: number | undefined;
  for (const p of pts) {
    if (p.at > t) break;
    v = p.price;
  }
  return v;
}

export const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** Giá cuối mỗi ngày trong [from, to) */
export function dailyPrices(pts: Pt[], from: number, to: number) {
  const out: number[] = [];
  for (let t = from + DAY - 1; t < to; t += DAY) {
    const v = priceAt(pts, t);
    if (v != null) out.push(v);
  }
  return out;
}

/** Giá thường ngày trước mốc t: trung vị giá cuối ngày 30 ngày trước đó (cần ít nhất `minDays` ngày dữ liệu) */
export function usualBefore(pts: Pt[], t: number, minDays = 7) {
  const d = dailyPrices(pts, t - 30 * DAY, t);
  return d.length >= minDays ? median(d) : null;
}

/** 00:00 ngày theo giờ VN chứa thời điểm t */
export const vnDayStart = (t: number) => Math.floor((t + VN) / DAY) * DAY - VN;
/** "2026-09-27" theo giờ VN */
export const vnDayKey = (t: number) => new Date(t + VN).toISOString().slice(0, 10);
/** "27/09/2026" */
export const vnDateLabel = (t: number) => {
  const s = vnDayKey(t);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};
