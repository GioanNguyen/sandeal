import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { pricePoints, products, vouchers, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { slugify } from "./slug";

const DAY = 86_400_000;

export interface DealFilter {
  q?: string;
  platform?: string;
  category?: string;
  minDrop?: number;
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
  return conds.length ? and(...conds) : undefined;
}

export type DealRow = Product & { low30: number | null; droppedAt?: Date | null; clicks24?: number };

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
  const since = new Date(Date.now() - 30 * DAY);
  // Viết tên bảng/cột đầy đủ: trong subquery Drizzle không tự thêm tiền tố bảng
  const low30 = sql<number | null>`(select min(pp.price) from price_points pp where pp.product_id = "products"."id" and pp.captured_at >= ${since})`;
  const [items, [{ total }]] = await Promise.all([
    db
      .select({ product: products, low30, droppedAt: droppedAtSql, clicks24: clicks24Sql })
      .from(products)
      .where(where)
      .orderBy(...(SORTS[f.sort ?? "score"] ?? SORTS.score), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);
  return {
    items: items.map((r) => ({
      ...r.product,
      low30: r.low30 == null ? null : Number(r.low30),
      droppedAt: r.droppedAt ? new Date(r.droppedAt) : null,
      clicks24: Number(r.clicks24),
    })),
    total,
  };
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
  return rows.map((r) => ({ ...r, low30: null, droppedAt: null, clicks24: 0 }));
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
  return rows.map((r) => ({ ...r.product, low30: null, droppedAt: r.droppedAt ? new Date(r.droppedAt) : null, clicks24: Number(r.clicks24) }));
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
