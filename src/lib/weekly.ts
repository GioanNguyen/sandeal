/**
 * Báo cáo giá hằng tuần (/bao-cao-gia/2026-tuan-39): tính lại từ lịch sử giá nên tuần cũ luôn ra cùng kết quả.
 * Tuần theo chuẩn ISO (thứ Hai–Chủ nhật), giờ Việt Nam.
 */
import { and, count, gte, lt, min } from "drizzle-orm";
import { pricePoints, products, type Product } from "@/db/schema";
import { isUnavailable, platformLatest } from "./availability";
import { db, ensureMigrated } from "./db";
import { DAY, loadHistory, median, priceAt, usualBefore } from "./pricehist";

const VN = 7 * 3_600_000;

export interface WeekRef {
  year: number;
  week: number;
  slug: string; // "2026-tuan-39"
  start: Date; // thứ Hai 00:00 giờ VN
  end: Date; // thứ Hai tuần sau 00:00
}

/** Tuần ISO chứa thời điểm t */
export function weekOf(t: Date): WeekRef {
  const d = new Date(t.getTime() + VN);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const thursday = new Date(monday + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  const week = 1 + Math.round((monday - week1Monday) / (7 * DAY));
  return { year, week, slug: `${year}-tuan-${week}`, start: new Date(monday - VN), end: new Date(monday - VN + 7 * DAY) };
}

export function parseWeek(slug: string): WeekRef | null {
  const m = slug.match(/^(\d{4})-tuan-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]), week = Number(m[2]);
  const jan4 = Date.UTC(year, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (week - 1) * 7 * DAY;
  const w = weekOf(new Date(monday - VN + DAY));
  return w.year === year && w.week === week ? w : null;
}

/** "22/09 – 28/09/2026" */
export function weekRangeLabel(w: WeekRef) {
  const f = (t: number) => new Date(t + VN).toISOString().slice(0, 10);
  const a = f(w.start.getTime()), b = f(w.end.getTime() - 1);
  return `${a.slice(8, 10)}/${a.slice(5, 7)} – ${b.slice(8, 10)}/${b.slice(5, 7)}/${b.slice(0, 4)}`;
}

/** Các tuần có dữ liệu (mới nhất trước), tối đa `n` tuần, gồm cả tuần hiện tại */
export async function reportWeeks(n = 12, now = new Date()): Promise<WeekRef[]> {
  await ensureMigrated();
  const [{ first }] = await db.select({ first: min(pricePoints.capturedAt) }).from(pricePoints);
  if (!first) return [];
  const out: WeekRef[] = [];
  // Cần ít nhất 14 ngày dữ liệu trước tuần đó để có "giá thường ngày"
  for (let w = weekOf(now); out.length < n && w.start.getTime() >= new Date(first).getTime() + 14 * DAY; w = weekOf(new Date(w.start.getTime() - DAY))) out.push(w);
  return out;
}

export interface WeekItem {
  product: Product;
  /** Giá thường ngày trước tuần (trung vị 30 ngày) */
  usual: number;
  /** Giá thấp nhất trong tuần */
  low: number;
  /** Giá đầu tuần / cuối tuần (hoặc hiện tại nếu tuần chưa hết) */
  startPrice: number;
  endPrice: number;
  gone: boolean;
}

export interface WeekReport {
  week: WeekRef;
  live: boolean;
  tracked: number;
  priceChanges: number;
  cheaper: number;
  pricier: number;
  /** Giảm sâu nhất so với giá thường ngày (giá thấp nhất trong tuần ≤ 90% giá thường ngày) */
  drops: WeekItem[];
  /** Tăng giá mạnh nhất trong tuần (cuối tuần ≥ 108% đầu tuần) */
  rises: WeekItem[];
  /** Theo danh mục: số món rẻ đi / đắt lên, thay đổi giá trung vị */
  categories: { name: string; n: number; cheaper: number; pricier: number; medianChange: number }[];
}

export async function weekReport(w: WeekRef, now = new Date()): Promise<WeekReport | null> {
  await ensureMigrated();
  if (w.start > now) return null;
  const live = w.end > now;
  const endT = Math.min(w.end.getTime(), now.getTime());
  const all = (await db.select().from(products).where(lt(products.createdAt, w.start))) as Product[];
  if (!all.length) return null;
  const hist = await loadHistory(all.map((p) => p.id), new Date(w.start.getTime() - 31 * DAY), new Date(endT));
  const latest = await platformLatest();
  const items: WeekItem[] = [];
  for (const p of all) {
    const pts = hist.get(p.id) ?? [];
    const usual = usualBefore(pts, w.start.getTime(), 10);
    const startPrice = priceAt(pts, w.start.getTime());
    const endPrice = priceAt(pts, endT);
    if (usual == null || startPrice == null || endPrice == null) continue;
    const inWeek = pts.filter((x) => x.at >= w.start.getTime() && x.at < endT).map((x) => x.price);
    items.push({ product: p, usual, low: Math.min(startPrice, ...inWeek), startPrice, endPrice, gone: isUnavailable(p, latest) });
  }
  if (items.length < 5) return null;
  const [{ n: priceChanges }] = await db
    .select({ n: count() })
    .from(pricePoints)
    .where(and(gte(pricePoints.capturedAt, w.start), lt(pricePoints.capturedAt, new Date(endT))));

  const cats = new Map<string, WeekItem[]>();
  for (const it of items) if (it.product.category) (cats.get(it.product.category) ?? cats.set(it.product.category, []).get(it.product.category)!).push(it);
  const change = (it: WeekItem) => it.endPrice / it.startPrice - 1;

  return {
    week: w,
    live,
    tracked: items.length,
    priceChanges: Number(priceChanges),
    cheaper: items.filter((it) => change(it) <= -0.01).length,
    pricier: items.filter((it) => change(it) >= 0.01).length,
    drops: items.filter((it) => it.low <= it.usual * 0.9).sort((a, b) => a.low / a.usual - b.low / b.usual).slice(0, 12),
    rises: items.filter((it) => it.endPrice >= it.startPrice * 1.08).sort((a, b) => change(b) - change(a)).slice(0, 8),
    categories: [...cats]
      .filter(([, v]) => v.length >= 3)
      .map(([name, v]) => ({ name, n: v.length, cheaper: v.filter((it) => change(it) <= -0.01).length, pricier: v.filter((it) => change(it) >= 0.01).length, medianChange: median(v.map(change)) }))
      .sort((a, b) => a.medianChange - b.medianChange),
  };
}
