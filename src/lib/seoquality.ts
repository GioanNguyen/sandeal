/**
 * Chất lượng chỉ mục (SEO): trang nào cho Google index, trang nào "mỏng" thì noindex.
 * Một chỗ duy nhất giữ các ngưỡng – trang (robots), sitemap, IndexNow và Quản trị › SEO đều dùng chung.
 *
 * Trang mỏng = ít nội dung riêng (món chỉ có tên + 1–2 mức giá, danh mục 1–2 món…). Để Google index
 * nhiều trang mỏng làm giảm đánh giá chất lượng của cả site, nên không index chúng (vẫn cho đi theo link)
 * và không đưa vào sitemap cho tới khi đủ dữ liệu.
 */
import { and, count, desc, isNotNull, sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";

const DAY = 86_400_000;

export const SEO_RULES = {
  /** Món không còn thấy trên sàn quá số ngày này: thôi index (trang vẫn mở được cho link cũ) */
  productGoneDays: 60,
  /** Món chưa có ảnh cần ít nhất ngần này mức giá ghi nhận trong 90 ngày (như biểu đồ trên trang) mới đủ nội dung để index */
  productMinPoints: 3,
  /** …hoặc đã theo dõi đủ ngần này ngày (giá đứng yên lâu cũng là thông tin: "giá ổn định, không cần chờ sale") */
  productMinDays: 14,
  /** Danh mục cần ít nhất ngần này món còn bán */
  categoryMin: 5,
  /** Trang "Giá X hôm nay" cần ít nhất ngần này mẫu còn bán và ngần này ngày theo dõi */
  topicMin: 3,
  topicMinDays: 7,
};

export type ProductNoindex = "hidden" | "gone_long" | "bare";
export const PRODUCT_NOINDEX_LABEL: Record<ProductNoindex, string> = {
  hidden: "Đã ẩn khỏi web",
  gone_long: `Vắng trên sàn quá ${SEO_RULES.productGoneDays} ngày`,
  bare: `Chưa có ảnh, chưa đủ ${SEO_RULES.productMinPoints} mức giá hay ${SEO_RULES.productMinDays} ngày theo dõi`,
};

/** Lý do không index trang sản phẩm (null = index được) */
export function productNoindexReason(
  p: { hidden: boolean; imageUrl: string | null; lastSeenAt: Date | null; createdAt: Date; points: number },
  now = new Date(),
): ProductNoindex | null {
  if (p.hidden) return "hidden";
  if (p.lastSeenAt && p.lastSeenAt.getTime() < now.getTime() - SEO_RULES.productGoneDays * DAY) return "gone_long";
  if (!p.imageUrl && p.points < SEO_RULES.productMinPoints && p.createdAt.getTime() > now.getTime() - SEO_RULES.productMinDays * DAY) return "bare";
  return null;
}

// Truy vấn con đếm mức giá: ghi rõ tên bảng "products" (Drizzle không ghi tên bảng trước cột khi truy vấn 1 bảng,
// cột "id" trong truy vấn con sẽ bị hiểu nhầm là cột của price_points)
const pointsSql = sql`(select count(*) from price_points pp where pp.product_id = "products"."id" and pp.captured_at >= now() - interval '90 days')`;
const goneCut = (now: Date) => new Date(now.getTime() - SEO_RULES.productGoneDays * DAY);
const trackedCut = (now: Date) => new Date(now.getTime() - SEO_RULES.productMinDays * DAY);

/** Điều kiện SQL: trang sản phẩm index được (dùng cho sitemap, IndexNow, đếm) */
export const productIndexableSql = (now = new Date()) =>
  sql`(not "products"."hidden" and "products"."last_seen_at" >= ${goneCut(now)} and (coalesce("products"."image_url", '') <> '' or "products"."created_at" <= ${trackedCut(now)} or ${pointsSql} >= ${SEO_RULES.productMinPoints}))`;

const reasonSql = (r: ProductNoindex, now: Date) =>
  r === "hidden"
    ? sql`"products"."hidden"`
    : r === "gone_long"
      ? sql`(not "products"."hidden" and "products"."last_seen_at" < ${goneCut(now)})`
      : sql`(not "products"."hidden" and "products"."last_seen_at" >= ${goneCut(now)} and coalesce("products"."image_url", '') = '' and "products"."created_at" > ${trackedCut(now)} and ${pointsSql} < ${SEO_RULES.productMinPoints})`;

export const categoryIndexable = (available: number) => available >= SEO_RULES.categoryMin;
export const topicIndexable = (available: number, trackedDays: number) => available >= SEO_RULES.topicMin && trackedDays >= SEO_RULES.topicMinDays;

/** Số món còn bán theo danh mục */
export async function categoryAvailable(): Promise<Map<string, number>> {
  await ensureMigrated();
  const rows = await db.select({ name: products.category, n: count() }).from(products).where(and(isNotNull(products.category), availableSql())).groupBy(products.category);
  return new Map(rows.map((r) => [r.name!, Number(r.n)]));
}

const countWhere = async (where: ReturnType<typeof sql>) => Number((await db.select({ n: count() }).from(products).where(where))[0].n);

export interface SeoReport {
  products: { total: number; indexable: number; reasons: { key: ProductNoindex; label: string; n: number }[] };
  categories: { name: string; total: number; available: number; indexable: boolean }[];
  /** Tên trùng nhau giữa các món index được (dễ thành trang na ná nhau) */
  duplicates: { name: string; platform: string; n: number }[];
}

export async function seoReport(now = new Date()): Promise<SeoReport> {
  await ensureMigrated();
  const keys: ProductNoindex[] = ["hidden", "gone_long", "bare"];
  const [total, indexable, reasonCounts, catTotals, catAvail, dups] = await Promise.all([
    countWhere(sql`true`),
    countWhere(productIndexableSql(now)),
    Promise.all(keys.map((k) => countWhere(reasonSql(k, now)))),
    db.select({ name: products.category, n: count() }).from(products).where(isNotNull(products.category)).groupBy(products.category).orderBy(desc(count())),
    categoryAvailable(),
    db
      .select({ name: products.name, platform: products.platform, n: count() })
      .from(products)
      .where(productIndexableSql(now))
      .groupBy(products.name, products.platform)
      .having(sql`count(*) > 1`)
      .orderBy(desc(count()))
      .limit(15),
  ]);
  return {
    products: { total, indexable, reasons: keys.map((key, i) => ({ key, label: PRODUCT_NOINDEX_LABEL[key], n: reasonCounts[i] })) },
    categories: catTotals.map((c) => {
      const available = catAvail.get(c.name!) ?? 0;
      return { name: c.name!, total: Number(c.n), available, indexable: categoryIndexable(available) };
    }),
    duplicates: dups.map((d) => ({ name: d.name, platform: d.platform, n: Number(d.n) })),
  };
}
