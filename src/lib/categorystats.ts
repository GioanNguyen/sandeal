/**
 * Số liệu theo ngành hàng (danh mục) để chọn ngành tập trung: hoa hồng, lượt xem, tỉ lệ bấm mua, tỉ lệ đặt cảnh báo giá.
 *
 * Hoa hồng ước tính / 1.000 lượt xem = 1.000 × (bấm mua / lượt xem) × tỉ lệ chốt đơn × hoa hồng TB mỗi đơn.
 * Tỉ lệ chốt đơn: lấy từ báo cáo đơn của sàn (đơn / lượt bấm mua trong kỳ) khi đủ dữ liệu, không thì dùng 4% (mức tham khảo).
 *
 * Mọi số đếm dùng JOIN/WHERE (không đặt truy vấn con trong SELECT – drizzle không ghi tên bảng ở đó, xem producthealth.ts).
 */
import { and, gte, ne, sql } from "drizzle-orm";
import { clicks, conversions, productViews, products, watches } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";

const DAY = 86_400_000;
export const NO_CAT = "Chưa có danh mục";
/** Tỉ lệ chốt đơn mặc định khi chưa đủ dữ liệu đơn hàng */
export const DEFAULT_CR = 0.04;
/** Dưới mức này số liệu tỉ lệ chưa đáng tin */
export const MIN_VIEWS = 50;

export interface CategoryRow {
  category: string;
  products: number;
  available: number;
  /** Số món có tỉ lệ hoa hồng */
  withRate: number;
  /** Tỉ lệ hoa hồng trung bình (0–1), null nếu chưa món nào có */
  avgRate: number | null;
  /** Hoa hồng trung bình mỗi đơn (giá × tỉ lệ), đồng */
  avgCommission: number | null;
  medianPrice: number;
  views: number;
  clicks: number;
  watches: number;
  /** bấm mua / lượt xem */
  clickRate: number | null;
  /** đặt cảnh báo / lượt xem */
  watchRate: number | null;
  /** Hoa hồng ước tính cho mỗi 1.000 lượt xem (đồng) */
  rpm: number | null;
  /** Đủ lượt xem để tin tỉ lệ */
  enough: boolean;
}

export interface CategoryStats {
  days: number;
  rows: CategoryRow[];
  totals: { views: number; clicks: number; watches: number; orders: number; clickRate: number | null; watchRate: number | null };
  /** Tỉ lệ chốt đơn dùng để ước tính, và nguồn */
  cr: { value: number; fromOrders: boolean };
}

const catKey = (c: string | null) => (c && c.trim() ? c : NO_CAT);
// Nhóm theo cột category gốc (null và "" gộp lại trong code) – tránh biểu thức có tham số trong GROUP BY
const catExpr = products.category;

/** Tính hoa hồng ước tính / 1.000 lượt xem */
export function estimateRpm(views: number, clicksN: number, avgCommission: number | null, cr: number): number | null {
  if (!views || avgCommission == null) return null;
  return (1000 * clicksN * cr * avgCommission) / views;
}

export async function categoryStats(days = 30, now = new Date()): Promise<CategoryStats> {
  await ensureMigrated();
  const since = new Date(now.getTime() - days * DAY);
  const [base, avail, viewRows, clickRows, watchRows, [ord], [clk]] = await Promise.all([
    db
      .select({
        category: catExpr,
        n: sql<number>`count(*)::int`,
        withRate: sql<number>`count(*) filter (where ${products.commissionRate} > 0)::int`,
        avgRate: sql<number | null>`avg(${products.commissionRate}) filter (where ${products.commissionRate} > 0)`,
        avgComm: sql<number | null>`avg(${products.price} * ${products.commissionRate}) filter (where ${products.commissionRate} > 0)`,
        median: sql<number>`percentile_cont(0.5) within group (order by ${products.price})`,
      })
      .from(products)
      .where(sql`not ${products.hidden}`)
      .groupBy(catExpr),
    db.select({ category: catExpr, n: sql<number>`count(*)::int` }).from(products).where(availableSql()).groupBy(catExpr),
    db
      .select({ category: catExpr, n: sql<number>`count(*)::int` })
      .from(productViews)
      .innerJoin(products, sql`${products.id} = ${productViews.productId}`)
      .where(gte(productViews.createdAt, since))
      .groupBy(catExpr),
    db
      .select({ category: catExpr, n: sql<number>`count(*)::int` })
      .from(clicks)
      .innerJoin(products, sql`${products.id} = ${clicks.productId}`)
      .where(gte(clicks.createdAt, since))
      .groupBy(catExpr),
    db
      .select({ category: catExpr, n: sql<number>`count(*)::int` })
      .from(watches)
      .innerJoin(products, sql`${products.id} = ${watches.productId}`)
      .where(gte(watches.createdAt, since))
      .groupBy(catExpr),
    db.select({ n: sql<number>`count(*)::int` }).from(conversions).where(and(gte(conversions.purchasedAt, since), ne(conversions.status, "cancelled"))),
    db.select({ n: sql<number>`count(*)::int` }).from(clicks).where(gte(clicks.createdAt, since)),
  ]);
  const m = (rows: { category: string | null; n: number }[]) => {
    const out = new Map<string, number>();
    for (const r of rows) out.set(catKey(r.category), (out.get(catKey(r.category)) ?? 0) + Number(r.n));
    return out;
  };
  const availM = m(avail), viewM = m(viewRows), clickM = m(clickRows), watchM = m(watchRows);

  // Tỉ lệ chốt đơn thật khi có ≥ 100 lượt bấm mua và ≥ 5 đơn trong kỳ
  const orders = Number(ord?.n ?? 0);
  const totalClicks = Number(clk?.n ?? 0);
  const fromOrders = totalClicks >= 100 && orders >= 5;
  const cr = fromOrders ? Math.min(0.5, orders / totalClicks) : DEFAULT_CR;

  // Gộp nhóm null và "" (cùng là "Chưa có danh mục"): cộng số món, trung bình có trọng số
  const merged = new Map<string, { n: number; withRate: number; rateSum: number; commSum: number; median: number }>();
  for (const b of base) {
    const k = catKey(b.category);
    const g = merged.get(k) ?? { n: 0, withRate: 0, rateSum: 0, commSum: 0, median: 0 };
    const wr = Number(b.withRate);
    g.rateSum += b.avgRate == null ? 0 : Number(b.avgRate) * wr;
    g.commSum += b.avgComm == null ? 0 : Number(b.avgComm) * wr;
    g.median = g.n >= Number(b.n) ? g.median : Number(b.median ?? 0);
    g.n += Number(b.n);
    g.withRate += wr;
    merged.set(k, g);
  }
  const rows: CategoryRow[] = [...merged].map(([category, g]) => {
    const b = { n: g.n, withRate: g.withRate, avgRate: g.withRate ? g.rateSum / g.withRate : null, avgComm: g.withRate ? g.commSum / g.withRate : null, median: g.median };
    const views = viewM.get(category) ?? 0;
    const cl = clickM.get(category) ?? 0;
    const w = watchM.get(category) ?? 0;
    const avgCommission = b.avgComm == null ? null : Number(b.avgComm);
    return {
      category,
      products: Number(b.n),
      available: availM.get(category) ?? 0,
      withRate: Number(b.withRate),
      avgRate: b.avgRate == null ? null : Number(b.avgRate),
      avgCommission,
      medianPrice: Number(b.median ?? 0),
      views,
      clicks: cl,
      watches: w,
      clickRate: views ? cl / views : null,
      watchRate: views ? w / views : null,
      rpm: estimateRpm(views, cl, avgCommission, cr),
      enough: views >= MIN_VIEWS,
    };
  });
  const tv = rows.reduce((s, r) => s + r.views, 0);
  const tc = rows.reduce((s, r) => s + r.clicks, 0);
  const tw = rows.reduce((s, r) => s + r.watches, 0);
  return {
    days,
    rows,
    totals: { views: tv, clicks: tc, watches: tw, orders, clickRate: tv ? tc / tv : null, watchRate: tv ? tw / tv : null },
    cr: { value: cr, fromOrders },
  };
}

export type CategorySort = "rpm" | "commission" | "rate" | "views" | "clickRate" | "watchRate" | "products";

/** Sắp xếp: ngành đủ dữ liệu lên trước, rồi theo cột chọn (giá trị trống xuống cuối) */
export function sortCategories(rows: CategoryRow[], by: CategorySort): CategoryRow[] {
  const val = (r: CategoryRow): number | null =>
    by === "rpm" ? r.rpm
    : by === "commission" ? r.avgCommission
    : by === "rate" ? r.avgRate
    : by === "views" ? r.views
    : by === "clickRate" ? r.clickRate
    : by === "watchRate" ? r.watchRate
    : r.products;
  const needsData = by === "rpm" || by === "clickRate" || by === "watchRate";
  return [...rows].sort((a, b) => {
    if (needsData && a.enough !== b.enough) return a.enough ? -1 : 1;
    const va = val(a), vb = val(b);
    if (va == null && vb == null) return b.products - a.products;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || b.products - a.products;
  });
}
