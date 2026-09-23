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

export type DealRow = Product & { low30: number | null };

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
      .select({ product: products, low30 })
      .from(products)
      .where(where)
      .orderBy(...(SORTS[f.sort ?? "score"] ?? SORTS.score), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ]);
  return { items: items.map((r) => ({ ...r.product, low30: r.low30 == null ? null : Number(r.low30) })), total };
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
  return rows.map((r) => ({ ...r, low30: null }));
}
