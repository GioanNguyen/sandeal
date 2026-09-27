/**
 * "Deal hôm nay" và lưu trữ theo ngày (/deal-hom-nay/27-09-2026): những lần giảm giá THẬT xảy ra trong ngày đó,
 * tính lại từ lịch sử giá (giá mới thấp hơn giá trước ≥5% và thấp hơn giá thường ngày 30 ngày ≥10%).
 */
import { and, gte, inArray, lt } from "drizzle-orm";
import { pricePoints, products, type Product } from "@/db/schema";
import { isUnavailable, platformLatest } from "./availability";
import { db, ensureMigrated } from "./db";
import { DAY, loadHistory, usualBefore, vnDayKey, vnDayStart } from "./pricehist";

export const ARCHIVE_DAYS = 60;

export interface DayDrop {
  product: Product;
  /** Giá sau khi giảm trong ngày (thấp nhất trong ngày) */
  price: number;
  /** Giá ngay trước lần giảm */
  before: number;
  usual: number;
  at: Date;
  gone: boolean;
}

/** "27-09-2026" <-> mốc 00:00 giờ VN */
export const daySlug = (t: number) => {
  const k = vnDayKey(t);
  return `${k.slice(8, 10)}-${k.slice(5, 7)}-${k.slice(0, 4)}`;
};
export function parseDay(slug: string): number | null {
  const m = slug.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) - 7 * 3_600_000;
  return daySlug(t) === slug ? t : null;
}

/** Mọi lần giảm thật trong [from, to), gom theo ngày (khoá "2026-09-27"), mỗi món mỗi ngày giữ mức thấp nhất */
export async function dropsBetween(from: number, to: number): Promise<Map<string, DayDrop[]>> {
  await ensureMigrated();
  const idRows = await db
    .selectDistinct({ id: pricePoints.productId })
    .from(pricePoints)
    .where(and(gte(pricePoints.capturedAt, new Date(from)), lt(pricePoints.capturedAt, new Date(to))));
  const out = new Map<string, DayDrop[]>();
  if (!idRows.length) return out;
  const ids = idRows.map((r) => r.id);
  const [hist, prods, latest] = await Promise.all([
    loadHistory(ids, new Date(from - 31 * DAY), new Date(to)),
    Promise.all(Array.from({ length: Math.ceil(ids.length / 2000) }, (_, i) => db.select().from(products).where(inArray(products.id, ids.slice(i * 2000, (i + 1) * 2000))))).then((r) => r.flat() as Product[]),
    platformLatest(),
  ]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = byId.get(id);
    const pts = hist.get(id) ?? [];
    if (!p) continue;
    const best = new Map<string, DayDrop>();
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.at < from || pt.at >= to) continue;
      const before = pts[i - 1].price;
      if (pt.price > before * 0.95) continue;
      const usual = usualBefore(pts, vnDayStart(pt.at), 7);
      if (usual == null || pt.price > usual * 0.9) continue;
      const key = vnDayKey(pt.at);
      const cur = best.get(key);
      if (!cur || pt.price < cur.price) best.set(key, { product: p, price: pt.price, before, usual, at: new Date(pt.at), gone: isUnavailable(p, latest) });
    }
    for (const [k, d] of best) (out.get(k) ?? out.set(k, []).get(k)!).push(d);
  }
  for (const list of out.values()) list.sort((a, b) => a.price / a.usual - b.price / b.usual);
  return out;
}

/** Deal của một ngày (ngày hôm nay thì tính đến hiện tại) */
export async function dayDrops(dayStart: number, now = Date.now()) {
  const map = await dropsBetween(dayStart, Math.min(dayStart + DAY, now));
  return map.get(vnDayKey(dayStart)) ?? [];
}

/** Các ngày gần đây có ít nhất `min` deal (mới nhất trước) */
export async function recentDays(days = 14, min = 3, now = Date.now()) {
  const today = vnDayStart(now);
  const map = await dropsBetween(today - days * DAY, today);
  return [...map]
    .filter(([, v]) => v.length >= min)
    .map(([k, v]) => ({ key: k, slug: `${k.slice(8, 10)}-${k.slice(5, 7)}-${k.slice(0, 4)}`, count: v.length }))
    .sort((a, b) => b.key.localeCompare(a.key));
}
