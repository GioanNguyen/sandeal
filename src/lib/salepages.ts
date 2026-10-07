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
export async function saleReport(e: SaleEvent, now = new Date(), onlyIds?: number[]) {
  await ensureMigrated();
  const start = e.start.getTime();
  const end = Math.min(e.end.getTime(), now.getTime());
  const all = (await (onlyIds ? db.select().from(products).where(inArray(products.id, onlyIds.length ? onlyIds : [-1])) : db.select().from(products))) as Product[];
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

// ---------------- "Ai nâng giá trước sale?" (/nang-gia/[slug]) ----------------

const PLATFORM_LABEL: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop" };

/** Ngưỡng "nâng giá": giá cao nhất 14 ngày trước sale cao hơn giá thường ngày từ 8% */
export const RAISE_PCT = 0.08;
/** Số món tối thiểu của 1 shop / danh mục để tính tỉ lệ (tránh kết luận từ 1–2 món) */
export const GROUP_MIN = 3;

export interface RaiseRow {
  product: Product;
  /** Giá thường ngày: trung vị giá mỗi ngày 30→14 ngày trước mốc */
  base: number;
  /** Giá cao nhất trong 14 ngày trước mốc */
  peak: number;
  raised: boolean;
  /** Đợt sale đã qua: giá thấp nhất trong ngày sale */
  saleLow: number | null;
}

/** Phân loại 1 món theo lịch sử giá; null khi không đủ dữ liệu (cần giá từ ≥ 20 ngày trước mốc) */
export function classifyRaise(pts: Pt[], ref: number, saleEnd: number | null): Omit<RaiseRow, "product"> | null {
  if (!pts.length || pts[0].at > ref - 20 * DAY) return null;
  const baseDays = dailyPrices(pts, ref - 30 * DAY, ref - 14 * DAY);
  const before = dailyPrices(pts, ref - 14 * DAY, ref);
  if (baseDays.length < 5 || !before.length) return null;
  const base = median(baseDays);
  const peak = Math.max(...before);
  let saleLow: number | null = null;
  if (saleEnd != null) {
    const during = pts.filter((x) => x.at >= ref && x.at <= saleEnd).map((x) => x.price);
    const atStart = priceAt(pts, ref);
    const all = [...during, ...(atStart != null ? [atStart] : [])];
    saleLow = all.length ? Math.min(...all) : null;
  }
  return { base, peak, raised: peak >= base * (1 + RAISE_PCT), saleLow };
}

export interface GroupRate {
  key: string;
  label: string;
  platform?: string;
  total: number;
  raised: number;
  rate: number;
}

/** Tỉ lệ món nâng giá theo nhóm (shop / danh mục), chỉ nhóm có ≥ GROUP_MIN món */
export function groupRates(rows: RaiseRow[], keyOf: (p: Product) => { key: string; label: string; platform?: string } | null, min = GROUP_MIN): GroupRate[] {
  const m = new Map<string, GroupRate>();
  for (const r of rows) {
    const k = keyOf(r.product);
    if (!k) continue;
    const g = m.get(k.key) ?? m.set(k.key, { ...k, total: 0, raised: 0, rate: 0 }).get(k.key)!;
    g.total++;
    if (r.raised) g.raised++;
  }
  return [...m.values()]
    .filter((g) => g.total >= min)
    .map((g) => ({ ...g, rate: g.raised / g.total }))
    .sort((a, b) => b.rate - a.rate || b.raised - a.raised || b.total - a.total);
}

/**
 * Thống kê nâng giá trước 1 đợt sale. Sale chưa tới: mốc là hôm nay (14 ngày qua); đã/đang diễn ra: mốc là giờ mở sale.
 */
export async function raiseReport(e: SaleEvent, now = new Date()) {
  await ensureMigrated();
  const ref = Math.min(now.getTime(), e.start.getTime());
  const past = e.start.getTime() <= now.getTime();
  const all = (await db.select().from(products)) as Product[];
  const hist = await history(all.map((p) => p.id));
  const rows: RaiseRow[] = [];
  for (const p of all) {
    const c = classifyRaise(hist.get(p.id) ?? [], ref, past ? Math.min(e.end.getTime(), now.getTime()) : null);
    if (c) rows.push({ product: p, ...c });
  }
  const raised = rows.filter((r) => r.raised).sort((a, b) => b.peak / b.base - a.peak / a.base);
  return {
    ref: new Date(ref),
    past,
    total: rows.length,
    raised,
    rate: rows.length ? raised.length / rows.length : 0,
    byShop: groupRates(rows, (p) => (p.shopName ? { key: `${p.platform}|${p.shopName}`, label: p.shopName, platform: p.platform } : null)),
    byCategory: groupRates(rows, (p) => (p.category ? { key: p.category, label: p.category } : null)),
    byPlatform: groupRates(rows, (p) => ({ key: p.platform, label: PLATFORM_LABEL[p.platform] ?? p.platform, platform: p.platform })),
  };
}

/** Đợt sale mặc định cho /nang-gia: đang diễn ra hoặc sắp tới gần nhất, không có thì đợt vừa qua */
export function currentRaisePage(now = new Date()) {
  const pages = salePages(now);
  return pages.find((p) => p.state === "live") ?? pages.find((p) => p.state === "upcoming") ?? pages[pages.length - 1];
}
