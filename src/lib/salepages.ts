/**
 * Trang từng đợt sale (/sale/[slug]): trước sale thì đếm ngược + món đang tăng giá (nên chờ),
 * trong/sau sale thì tổng kết món nào giảm thật, món nào "tăng giá trước rồi giảm" – tính từ lịch sử giá.
 */
import { inArray } from "drizzle-orm";
import { pricePoints, products, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { salesBetween, type SaleEvent } from "./sales";
import { slugify } from "./slug";

const DAY = 86_400_000;

export function saleSlug(e: SaleEvent) {
  const [y, m, d] = e.key.split("-").map(Number);
  return e.kind === "special" ? `${slugify(e.name)}-${y}` : `${d}-${m}-${y}`;
}
export const saleTitle = (e: SaleEvent) => e.name.replace(/ – .*/, "");

/** Các đợt sale lớn có trang riêng: 3 đợt vừa qua + 4 đợt sắp tới */
export function salePages(now = new Date()) {
  const all = salesBetween(new Date(now.getTime() - 150 * DAY), new Date(now.getTime() + 150 * DAY));
  const past = all.filter((e) => e.end < now).slice(-3);
  const next = all.filter((e) => e.end >= now).slice(0, 4);
  return [...past, ...next].map((e) => ({ event: e, slug: saleSlug(e), state: (e.end < now ? "past" : e.start <= now ? "live" : "upcoming") as "past" | "live" | "upcoming" }));
}

export function saleBySlug(slug: string, now = new Date()) {
  return salePages(now).find((p) => p.slug === slug) ?? null;
}

type Pt = { price: number; at: number };
function priceAt(points: Pt[], t: number) {
  let v: number | undefined;
  for (const p of points) {
    if (p.at > t) break;
    v = p.price;
  }
  return v;
}
/** Giá mỗi ngày (cuối ngày) trong [from, to) */
function dailyPrices(points: Pt[], from: number, to: number) {
  const out: number[] = [];
  for (let t = from + DAY - 1; t < to; t += DAY) {
    const v = priceAt(points, t);
    if (v != null) out.push(v);
  }
  return out;
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

export interface SaleRow {
  product: Product;
  /** Giá thường ngày trước sale (trung vị 30→14 ngày trước) */
  base: number;
  /** Giá cao nhất 14 ngày ngay trước sale */
  peakBefore: number;
  /** Giá thấp nhất trong ngày sale (hoặc giá hiện tại nếu sale chưa tới) */
  low: number;
}

async function history(ids: number[]) {
  const pts = await db
    .select({ productId: pricePoints.productId, price: pricePoints.price, capturedAt: pricePoints.capturedAt })
    .from(pricePoints)
    .where(inArray(pricePoints.productId, ids))
    .orderBy(pricePoints.capturedAt);
  const m = new Map<number, Pt[]>();
  for (const p of pts) (m.get(p.productId) ?? m.set(p.productId, []).get(p.productId)!).push({ price: p.price, at: p.capturedAt.getTime() });
  return m;
}

/** Tổng kết một đợt sale đã/đang diễn ra */
export async function saleReport(e: SaleEvent, now = new Date()) {
  await ensureMigrated();
  const start = e.start.getTime();
  const end = Math.min(e.end.getTime(), now.getTime());
  const all = (await db.select().from(products)) as Product[];
  const hist = await history(all.map((p) => p.id));
  const rows: SaleRow[] = [];
  for (const p of all) {
    const pts = hist.get(p.id) ?? [];
    if (!pts.length || pts[0].at > start - 14 * DAY) continue; // cần có giá từ ít nhất 14 ngày trước sale
    const baseDays = dailyPrices(pts, start - 30 * DAY, start - 14 * DAY);
    const beforeDays = dailyPrices(pts, start - 14 * DAY, start);
    if (baseDays.length < 5 || !beforeDays.length) continue;
    const during = pts.filter((x) => x.at >= start && x.at <= end).map((x) => x.price);
    const atStart = priceAt(pts, start);
    const low = Math.min(...during, ...(atStart != null ? [atStart] : []));
    if (!Number.isFinite(low)) continue;
    rows.push({ product: p, base: median(baseDays), peakBefore: Math.max(...beforeDays), low });
  }
  const real = rows.filter((r) => r.low <= r.base * 0.95).sort((a, b) => a.low / a.base - b.low / b.base);
  const fake = rows.filter((r) => r.peakBefore >= r.base * 1.08 && r.low > r.base * 0.95).sort((a, b) => b.peakBefore / b.base - a.peakBefore / a.base);
  const same = rows.length - real.length - fake.length;
  return { total: rows.length, real, fake, same };
}

/** Trước sale: món đang tăng giá so với 30 ngày trước (nên chờ, hoặc cẩn thận "tăng trước giảm sau") */
export async function risingBeforeSale(now = new Date(), limit = 10) {
  await ensureMigrated();
  const t = now.getTime();
  const all = (await db.select().from(products)) as Product[];
  const hist = await history(all.map((p) => p.id));
  const out: SaleRow[] = [];
  for (const p of all) {
    const pts = hist.get(p.id) ?? [];
    if (!pts.length || pts[0].at > t - 20 * DAY) continue;
    const baseDays = dailyPrices(pts, t - 40 * DAY, t - 10 * DAY);
    if (baseDays.length < 10) continue;
    const base = median(baseDays);
    const changedRecently = pts.some((x) => x.at >= t - 14 * DAY);
    if (changedRecently && p.price >= base * 1.08) out.push({ product: p, base, peakBefore: p.price, low: p.price });
  }
  return out.sort((a, b) => b.low / b.base - a.low / a.base).slice(0, limit);
}
