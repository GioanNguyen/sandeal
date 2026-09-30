/**
 * "Mua ngay hay chờ?" có con số: ước tính giá ở đợt sale lớn sắp tới.
 * - Món đã có dữ liệu ở các đợt sale trước: dùng mức giảm của chính nó (giá thấp nhất trong ngày sale so với
 *   giá phổ biến 14 ngày trước sale).
 * - Món mới theo dõi: dùng mức giảm trung vị của các món cùng danh mục ở đợt sale gần nhất (cần ≥ 5 món có dữ liệu).
 * Chỉ là ước tính từ lịch sử, không phải cam kết giá.
 */
import { and, eq, inArray, lte } from "drizzle-orm";
import { pricePoints, products } from "@/db/schema";
import { db } from "./db";
import { salesBetween, type SaleEvent } from "./sales";

type Pt = { price: number; capturedAt: Date };
const DAY = 86_400_000;
/** Số ngày trước sale dùng để lấy giá "bình thường" */
const BEFORE_DAYS = 14;
/** Số món tối thiểu cùng danh mục để lấy số liệu chung */
export const MIN_CATEGORY_SAMPLE = 5;

export const saleShort = (e: Pick<SaleEvent, "name">) => e.name.match(/\d+\.\d+/)?.[0] ?? (e.name.includes("Black Friday") ? "Black Friday" : e.name.replace(/ – .*/, ""));

/** Giá có hiệu lực trong [a, b) kèm thời lượng (giá trước a vẫn tính nếu chưa đổi) */
function segments(hist: Pt[], a: number, b: number) {
  const out: { price: number; w: number }[] = [];
  for (let i = 0; i < hist.length; i++) {
    const s = Math.max(a, hist[i].capturedAt.getTime());
    const e = Math.min(b, hist[i + 1]?.capturedAt.getTime() ?? Infinity);
    if (e > s) out.push({ price: hist[i].price, w: e - s });
  }
  return out;
}

function weightedMedian(seg: { price: number; w: number }[]) {
  const s = [...seg].sort((x, y) => x.price - y.price);
  const total = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) if ((acc += x.w) >= total / 2) return x.price;
  return s[s.length - 1].price;
}

/**
 * Mức giảm của 1 món trong 1 đợt sale (0.12 = rẻ hơn 12% so với giá 14 ngày trước sale).
 * null khi không đủ dữ liệu: chưa theo dõi từ trước sale ít nhất 7 ngày, hoặc không có giá trong ngày sale.
 */
export function saleDrop(history: Pt[], sale: Pick<SaleEvent, "start" | "end">): number | null {
  const hist = [...history].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (!hist.length || hist[0].capturedAt.getTime() > sale.start.getTime() - 7 * DAY) return null;
  const before = segments(hist, sale.start.getTime() - BEFORE_DAYS * DAY, sale.start.getTime());
  const during = segments(hist, sale.start.getTime(), sale.end.getTime() + 1);
  if (!before.length || !during.length) return null;
  const usual = weightedMedian(before);
  const low = Math.min(...during.map((x) => x.price));
  if (!(usual > 0)) return null;
  return Math.max(-0.5, Math.min(0.8, (usual - low) / usual));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface CategoryDrop {
  /** Tên ngắn đợt sale dùng làm mốc, vd "9.9" */
  ref: string;
  /** Mức giảm trung vị (0.12 = 12%) */
  median: number;
  /** Số món có dữ liệu */
  n: number;
}

/** Từ lịch sử giá của nhiều món: mức giảm trung vị ở đợt sale lớn gần nhất có đủ mẫu */
export function categoryDropFrom(histories: Pt[][], now: Date, lookbackDays = 120): CategoryDrop | null {
  const past = salesBetween(new Date(now.getTime() - lookbackDays * DAY), now).filter((e) => e.end < now).reverse();
  for (const sale of past) {
    const drops = histories.map((h) => saleDrop(h, sale)).filter((d): d is number => d != null);
    if (drops.length >= MIN_CATEGORY_SAMPLE) return { ref: saleShort(sale), median: median(drops), n: drops.length };
  }
  return null;
}

const cache = new Map<string, { at: number; v: CategoryDrop | null }>();

/** Mức giảm trung vị của danh mục ở đợt sale gần nhất (lưu tạm 1 giờ) */
export async function categorySaleDrop(category: string | null | undefined, now = new Date()): Promise<CategoryDrop | null> {
  if (!category) return null;
  const hit = cache.get(category);
  if (hit && now.getTime() - hit.at < 3_600_000) return hit.v;
  const ids = (await db.select({ id: products.id }).from(products).where(eq(products.category, category)).limit(400)).map((r) => r.id);
  let v: CategoryDrop | null = null;
  if (ids.length >= MIN_CATEGORY_SAMPLE) {
    const rows = await db
      .select({ id: pricePoints.productId, price: pricePoints.price, capturedAt: pricePoints.capturedAt })
      .from(pricePoints)
      .where(and(inArray(pricePoints.productId, ids), lte(pricePoints.capturedAt, now)));
    const by = new Map<number, Pt[]>();
    for (const r of rows) (by.get(r.id) ?? by.set(r.id, []).get(r.id)!).push({ price: r.price, capturedAt: r.capturedAt });
    v = categoryDropFrom([...by.values()], now);
  }
  cache.set(category, { at: now.getTime(), v });
  return v;
}

export interface SaleForecast {
  sale: string;
  days: number;
  /** Giá dự kiến trong đợt sale (làm tròn nghìn) */
  expected: number;
  /** Rẻ hơn giá hiện tại bao nhiêu nếu chờ (≥ 0) */
  save: number;
  /** % rẻ hơn giá hiện tại */
  pct: number;
  basis: "own" | "category";
  /** Mô tả nguồn số liệu, vd "giá món này ở 9.9" */
  basisText: string;
}

/**
 * Ước tính giá ở đợt sale tới. Mức giảm tính trên giá "bình thường" (giá thường ngày); nếu giá hiện tại đã thấp hơn
 * giá thường ngày thì phần đã giảm được trừ ra (không hứa giảm chồng).
 */
export function saleForecast(opts: {
  price: number;
  usual: number;
  nextSale: { name: string; days: number } | null;
  ownDrops: { ref: string; drop: number }[];
  category?: { name: string; drop: CategoryDrop | null };
}): SaleForecast | null {
  const { price, nextSale } = opts;
  if (!nextSale || !(price > 0)) return null;
  let drop: number, basis: SaleForecast["basis"], basisText: string;
  if (opts.ownDrops.length) {
    drop = median(opts.ownDrops.map((d) => d.drop));
    basis = "own";
    basisText = `giá của chính món này ở ${opts.ownDrops.map((d) => d.ref).join(", ")}`;
  } else if (opts.category?.drop) {
    const c = opts.category.drop;
    drop = c.median;
    basis = "category";
    basisText = `${c.n} món ${opts.category.name} ở ${c.ref} (giảm trung vị ${Math.round(c.median * 100)}%)`;
  } else return null;
  const base = Math.max(price, opts.usual || price);
  const expected = Math.min(price, Math.round((base * (1 - Math.max(0, drop))) / 1000) * 1000);
  const save = Math.max(0, price - expected);
  return { sale: saleShort(nextSale), days: nextSale.days, expected, save, pct: Math.round((save / price) * 100), basis, basisText };
}
