import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { clicks, pricePoints, products, votes, vouchers, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { slugify } from "./slug";

const DAY = 86_400_000;

export interface DealFilter {
  q?: string;
  platform?: string;
  category?: string;
  minDrop?: number;
  /** Giá tối đa (đ) – dùng cho "Deal dưới 99K/199K/499K" và bộ sưu tập */
  maxPrice?: number;
  /** Nhiều danh mục (OR) */
  categories?: string[];
  /** Tên chứa một trong các từ khoá (OR) */
  keywords?: string[];
  excludeIds?: number[];
  sort?: string;
  page?: number;
  pageSize?: number;
}

const SORTS: Record<string, SQL[]> = {
  score: [desc(products.dealScore)],
  drop: [desc(products.realDropPct)],
  price: [asc(products.price)],
  sold: [sql`${products.sold} desc nulls last`],
};

function dealWhere(f: DealFilter) {
  const conds: SQL[] = [];
  if (f.platform) conds.push(eq(products.platform, f.platform));
  if (f.category) conds.push(eq(products.category, f.category));
  if (f.q) conds.push(ilike(products.name, `%${f.q.replace(/[%_]/g, "")}%`));
  if (f.minDrop) conds.push(gte(products.realDropPct, f.minDrop));
  if (f.maxPrice) conds.push(lte(products.price, f.maxPrice));
  if (f.categories?.length) conds.push(inArray(products.category, f.categories));
  if (f.keywords?.length) conds.push(or(...f.keywords.map((k) => ilike(products.name, `%${k.replace(/[%_]/g, "")}%`)))!);
  if (f.excludeIds?.length) conds.push(notInArray(products.id, f.excludeIds));
  return conds.length ? and(...conds) : undefined;
}

export type DealRow = Product & {
  low30: number | null;
  droppedAt?: Date | null;
  clicks24?: number;
  /** Lịch sử giá 30 ngày [thời điểm ms, giá] cho biểu đồ nhỏ trên thẻ */
  spark?: [number, number][];
  /** Số ngày đã theo dõi giá */
  trackedDays?: number;
  /** Điểm cộng đồng (lượt hot trừ lượt không đáng) */
  communityNet?: number;
  /** Cùng sản phẩm ở sàn khác đang rẻ hơn */
  cheaperElsewhere?: { platform: string; price: number; id: number } | null;
  /** Rẻ nhất trong nhóm cùng sản phẩm ở nhiều sàn */
  cheapestAcross?: number; // số sàn so sánh
};

/**
 * Bổ sung dữ liệu cho thẻ deal bằng vài truy vấn gộp (không truy vấn từng sản phẩm):
 * lịch sử giá 30 ngày, lần giảm gần nhất, lượt bấm 24h, bình chọn, giá ở sàn khác.
 */
export async function enrichDeals(rows: Product[]): Promise<DealRow[]> {
  if (!rows.length) return [];
  await ensureMigrated();
  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - 31 * DAY);
  const groupKeys = [...new Set(rows.map((r) => r.groupKey).filter((k): k is string => !!k))];
  const [points, firstSeen, clickRows, voteRows, groupRows] = await Promise.all([
    db
      .select({ productId: pricePoints.productId, price: pricePoints.price, at: pricePoints.capturedAt })
      .from(pricePoints)
      .where(and(inArray(pricePoints.productId, ids), gte(pricePoints.capturedAt, since)))
      .orderBy(asc(pricePoints.capturedAt)),
    db
      .select({ productId: pricePoints.productId, first: sql<string>`min(${pricePoints.capturedAt})`, before: sql<number | null>`(array_agg(${pricePoints.price} order by ${pricePoints.capturedAt} desc) filter (where ${pricePoints.capturedAt} < ${since}))[1]` })
      .from(pricePoints)
      .where(inArray(pricePoints.productId, ids))
      .groupBy(pricePoints.productId),
    db
      .select({ productId: clicks.productId, n: count() })
      .from(clicks)
      .where(and(inArray(clicks.productId, ids), gte(clicks.createdAt, new Date(Date.now() - DAY))))
      .groupBy(clicks.productId),
    db
      .select({ productId: votes.productId, net: sql<number>`sum(${votes.value})` })
      .from(votes)
      .where(inArray(votes.productId, ids))
      .groupBy(votes.productId),
    groupKeys.length
      ? db.select({ id: products.id, groupKey: products.groupKey, platform: products.platform, price: products.price }).from(products).where(inArray(products.groupKey, groupKeys))
      : Promise.resolve([] as { id: number; groupKey: string | null; platform: string; price: number }[]),
  ]);

  const byProduct = new Map<number, { price: number; at: Date }[]>();
  for (const pt of points) (byProduct.get(pt.productId) ?? byProduct.set(pt.productId, []).get(pt.productId)!).push(pt);
  const first = new Map(firstSeen.map((f) => [f.productId, { first: new Date(f.first), before: f.before == null ? null : Number(f.before) }]));
  const clickMap = new Map(clickRows.map((c) => [c.productId!, Number(c.n)]));
  const voteMap = new Map(voteRows.map((v) => [v.productId, Number(v.net)]));

  return rows.map((p) => {
    const pts = byProduct.get(p.id) ?? [];
    const f = first.get(p.id);
    // Chuỗi giá: giá trước mốc 30 ngày (nếu có) làm điểm đầu, rồi các lần đổi giá
    const series: [number, number][] = [];
    if (f?.before != null) series.push([since.getTime(), f.before]);
    for (const pt of pts) series.push([pt.at.getTime(), pt.price]);
    let droppedAt: Date | null = null;
    for (let i = series.length - 1; i > 0; i--) {
      if (series[i][1] <= series[i - 1][1] * 0.95) { droppedAt = new Date(series[i][0]); break; }
    }
    const low30 = series.length ? Math.min(...series.map((x) => x[1])) : null;

    let cheaperElsewhere: DealRow["cheaperElsewhere"] = null;
    let cheapestAcross: number | undefined;
    if (p.groupKey) {
      const members = groupRows.filter((g) => g.groupKey === p.groupKey);
      const others = members.filter((g) => g.platform !== p.platform).sort((a, b) => a.price - b.price);
      if (others[0] && others[0].price < p.price * 0.99) cheaperElsewhere = { platform: others[0].platform, price: others[0].price, id: others[0].id };
      else if (others.length) cheapestAcross = new Set(members.map((m) => m.platform)).size;
    }
    return {
      ...p,
      low30,
      spark: series,
      droppedAt,
      trackedDays: f ? (Date.now() - f.first.getTime()) / DAY : 0,
      clicks24: clickMap.get(p.id) ?? 0,
      communityNet: voteMap.get(p.id) ?? 0,
      cheaperElsewhere,
      cheapestAcross,
    };
  });
}

/** Lần gần nhất giá giảm ≥5% so với mức trước đó (chỉ số thật từ lịch sử giá) */
const droppedAtSql = sql<string | null>`(select max(t.captured_at) from (
  select pp.captured_at, pp.price, lag(pp.price) over (order by pp.captured_at) as prev
  from price_points pp where pp.product_id = "products"."id") t where t.price <= t.prev * 0.95)`;
/** Số lượt bấm mua thật trong 24 giờ qua */
const clicks24Sql = sql<number>`(select count(*) from clicks c where c.product_id = "products"."id" and c.created_at > now() - interval '24 hours')`;

export async function listDeals(f: DealFilter): Promise<{ items: DealRow[]; total: number }> {
  await ensureMigrated();
  const pageSize = f.pageSize ?? 24;
  const page = Math.max(1, f.page ?? 1);
  const where = dealWhere(f);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(...(SORTS[f.sort ?? "score"] ?? SORTS.score), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);
  return { items: await enrichDeals(rows), total };
}

export async function listCategories() {
  await ensureMigrated();
  const rows = await db
    .select({ name: products.category, n: count() })
    .from(products)
    .where(isNotNull(products.category))
    .groupBy(products.category)
    .orderBy(desc(count()));
  return rows.map((r) => ({ name: r.name!, slug: slugify(r.name!), count: r.n }));
}

const activeVoucher = () => or(isNull(vouchers.endAt), gte(vouchers.endAt, new Date()));

export async function listActiveVouchers(opts: { platform?: string; limit?: number } = {}) {
  await ensureMigrated();
  const q = db
    .select()
    .from(vouchers)
    .where(and(activeVoucher(), opts.platform ? eq(vouchers.platform, opts.platform) : undefined))
    .orderBy(sql`${vouchers.endAt} asc nulls last`);
  return opts.limit ? q.limit(opts.limit) : q;
}

export async function homeStats() {
  await ensureMigrated();
  const [[{ realDeals }], [{ voucherCount }], [{ best }]] = await Promise.all([
    db.select({ realDeals: count() }).from(products).where(gte(products.realDropPct, 10)),
    db.select({ voucherCount: count() }).from(vouchers).where(activeVoucher()),
    db.select({ best: sql<number>`coalesce(max(${products.realDropPct}), 0)` }).from(products),
  ]);
  return { realDeals, voucherCount, best: Number(best) };
}

export async function getProduct(id: number) {
  await ensureMigrated();
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) return null;
  const prices = await db
    .select({ price: pricePoints.price, capturedAt: pricePoints.capturedAt })
    .from(pricePoints)
    .where(and(eq(pricePoints.productId, id), gte(pricePoints.capturedAt, new Date(Date.now() - 90 * DAY))))
    .orderBy(asc(pricePoints.capturedAt));
  return { ...p, prices };
}

export async function similarDeals(p: Product, limit = 5) {
  await ensureMigrated();
  const rows = await db
    .select()
    .from(products)
    .where(and(p.category ? eq(products.category, p.category) : undefined, sql`${products.id} <> ${p.id}`))
    .orderBy(desc(products.dealScore))
    .limit(limit);
  return enrichDeals(rows);
}

/** Các lựa chọn cùng sản phẩm ở những sàn khác (rẻ nhất mỗi sàn) */
export async function compareOffers(p: Product) {
  if (!p.groupKey) return [];
  await ensureMigrated();
  const rows = await db.select().from(products).where(eq(products.groupKey, p.groupKey)).orderBy(asc(products.price));
  const best = new Map<string, Product>();
  for (const r of rows) if (!best.has(r.platform)) best.set(r.platform, r);
  return [...best.values()].sort((a, b) => a.price - b.price);
}

/** Nhóm sản phẩm có chênh lệch giá giữa các sàn lớn nhất */
export async function biggestGaps(limit = 20) {
  await ensureMigrated();
  const groups = await db
    .select({
      key: products.groupKey,
      minP: sql<number>`min(${products.price})`,
      maxP: sql<number>`max(${products.price})`,
      platforms: sql<number>`count(distinct ${products.platform})`,
    })
    .from(products)
    .where(isNotNull(products.groupKey))
    .groupBy(products.groupKey)
    .having(sql`count(distinct ${products.platform}) >= 2`)
    .orderBy(sql`(max(${products.price}) - min(${products.price})) / max(${products.price}) desc`)
    .limit(limit * 2);
  if (!groups.length) return [];
  const members = await db
    .select()
    .from(products)
    .where(sql`${products.groupKey} in (${sql.join(groups.map((g) => sql`${g.key}`), sql`, `)})`)
    .orderBy(asc(products.price));
  return groups.map((g) => {
    const list = members.filter((m) => m.groupKey === g.key);
    const perPlatform = new Map<string, Product>();
    for (const m of list) if (!perPlatform.has(m.platform)) perPlatform.set(m.platform, m);
    const offers = [...perPlatform.values()];
    const min = offers[0].price, max = offers[offers.length - 1].price;
    return { key: g.key!, name: offers[0].name, image: offers.find((o) => o.imageUrl)?.imageUrl ?? null, offers, save: max - min, savePct: max ? ((max - min) / max) * 100 : 0 };
  })
    .filter((g) => g.offers.length >= 2 && g.save > 0)
    .sort((a, b) => b.savePct - a.savePct)
    .slice(0, limit);
}

/** Mã còn hạn đã chuẩn hoá, dùng cho máy tính giá */
export async function calcVouchers(platform?: string) {
  await ensureMigrated();
  const rows = await db
    .select()
    .from(vouchers)
    .where(and(activeVoucher(), isNotNull(vouchers.discountType), platform ? eq(vouchers.platform, platform) : undefined));
  return rows.map((v) => ({
    id: v.id,
    title: v.title,
    code: v.code,
    platform: v.platform,
    type: v.discountType as "percent" | "fixed" | "freeship" | "cashback",
    value: v.discountValue,
    max: v.maxDiscount,
    minSpend: v.minSpend,
  }));
}

/** Deal vừa giảm giá trong `hours` giờ qua (mới nhất trước) */
export async function justDropped(hours = 24, limit = 12): Promise<DealRow[]> {
  await ensureMigrated();
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db
    .select({ product: products, droppedAt: droppedAtSql, clicks24: clicks24Sql })
    .from(products)
    .where(and(gte(products.realDropPct, 5), sql`${droppedAtSql} >= ${since}`))
    .orderBy(sql`${droppedAtSql} desc`, desc(products.dealScore))
    .limit(limit);
  return enrichDeals(rows.map((r) => r.product));
}

/** Mã sắp hết hạn gần nhất của một sàn (để nhắc trên trang sản phẩm) */
export async function soonestVoucher(platform: string, withinHours = 24) {
  await ensureMigrated();
  const now = new Date();
  const [v] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.platform, platform), gte(vouchers.endAt, now), sql`${vouchers.endAt} <= ${new Date(now.getTime() + withinHours * 3_600_000)}`))
    .orderBy(asc(vouchers.endAt))
    .limit(1);
  return v ?? null;
}

/** Sản phẩm theo danh sách id (giữ nguyên thứ tự) – dùng cho "Bạn vừa xem" */
export async function dealsByIds(ids: number[]): Promise<DealRow[]> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 30);
  if (!clean.length) return [];
  await ensureMigrated();
  const rows = await db.select().from(products).where(inArray(products.id, clean));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return enrichDeals(clean.map((id) => byId.get(id)).filter((r): r is Product => !!r));
}
