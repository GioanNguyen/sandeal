/** Khám phá nhanh: gợi ý tìm kiếm, từ khoá hot, deal nổi bật, deal tương tự rẻ hơn, "người xem cũng xem" */
import { and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import { productViews, products, searchLog, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { enrichDeals, listCategories, type DealRow } from "./queries";

const DAY = 86_400_000;

/** Chuẩn hoá từ khoá: chữ thường, gọn khoảng trắng; bỏ từ khoá lạ (link, ký tự đặc biệt, quá dài) */
export function normalizeQuery(q: string | null | undefined): string | null {
  const s = (q ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 40) return null;
  if (!/^[\p{L}\p{N} .,+\-/"']+$/u.test(s) || /https?:|www\.|\.(vn|com)/.test(s)) return null;
  return s;
}

export async function logSearch(q: string | undefined, results: number) {
  const n = normalizeQuery(q);
  if (!n) return;
  await ensureMigrated();
  await db.insert(searchLog).values({ q: n, results });
}

/** Từ khoá được tìm nhiều trong 7 ngày (chỉ từ khoá có kết quả, ít nhất 2 lượt) */
export async function trendingSearches(limit = 8): Promise<{ q: string; n: number }[]> {
  await ensureMigrated();
  const rows = await db
    .select({ q: searchLog.q, n: sql<number>`count(*)::int` })
    .from(searchLog)
    .where(and(gte(searchLog.createdAt, new Date(Date.now() - 7 * DAY)), sql`${searchLog.results} > 0`))
    .groupBy(searchLog.q)
    .having(sql`count(*) >= 2`)
    .orderBy(desc(sql`count(*)`), searchLog.q)
    .limit(limit);
  return rows.map((r) => ({ q: r.q, n: Number(r.n) }));
}

export interface Suggestion {
  products: { id: number; name: string; imageUrl: string | null; price: number; platform: string; realDropPct: number }[];
  categories: { name: string; slug: string; count: number }[];
  trending: { q: string; n: number }[];
}

/** Gợi ý khi gõ: sản phẩm khớp tên (deal tốt trước) + danh mục khớp; ô trống thì trả từ khoá hot */
export async function suggest(q: string): Promise<Suggestion> {
  await ensureMigrated();
  const term = q.trim().slice(0, 40).replace(/[%_]/g, "");
  if (term.length < 2) {
    const [trending, cats] = await Promise.all([trendingSearches(8), listCategories()]);
    return { products: [], categories: cats.slice(0, 6), trending };
  }
  const [rows, cats] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, imageUrl: products.imageUrl, price: products.price, platform: products.platform, realDropPct: products.realDropPct })
      .from(products)
      .where(ilike(products.name, `%${term}%`))
      .orderBy(desc(sql`${products.name} ilike ${term + "%"}`), desc(products.dealScore))
      .limit(6),
    listCategories(),
  ]);
  const t = term.toLowerCase();
  return { products: rows, categories: cats.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 3), trending: [] };
}

/** Deal nổi bật cho dải trượt đầu trang: điểm cao nhất, giảm thật ≥10%, mỗi nhóm sản phẩm chỉ lấy 1 */
export async function spotlightDeals(limit = 5): Promise<DealRow[]> {
  await ensureMigrated();
  const rows = await db.select().from(products).where(gte(products.realDropPct, 10)).orderBy(desc(products.dealScore)).limit(limit * 4);
  const seen = new Set<string>();
  const pick: Product[] = [];
  for (const r of rows) {
    const key = r.groupKey ?? r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pick.push(r);
    if (pick.length >= limit) break;
  }
  return enrichDeals(pick);
}

/** Món tương tự (cùng danh mục, ưu tiên trùng từ trong tên) nhưng RẺ HƠN món đang xem */
export async function cheaperSimilar(p: Product, limit = 5): Promise<DealRow[]> {
  await ensureMigrated();
  if (!p.category) return [];
  const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).slice(0, 3);
  const overlap = words.length
    ? sql.join(words.map((w) => sql`(case when ${products.name} ilike ${"%" + w.replace(/[%_]/g, "") + "%"} then 1 else 0 end)`), sql` + `)
    : sql`0`;
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.category, p.category), lt(products.price, p.price * 0.97), sql`${products.id} <> ${p.id}`, gte(products.realDropPct, 1)))
    .orderBy(desc(overlap), desc(products.dealScore))
    .limit(limit);
  return enrichDeals(rows);
}

/** Ngày theo giờ VN (khoá chống đếm trùng lượt xem trong ngày) */
export const vnDay = (d = new Date()) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export async function recordView(visitor: string, productId: number, now = new Date()) {
  await ensureMigrated();
  await db.insert(productViews).values({ visitor, productId, day: vnDay(now), createdAt: now }).onConflictDoNothing();
}

/** "Người xem món này cũng xem": món khác được chính những khách đó xem trong 30 ngày (ít nhất 2 khách) */
export async function alsoViewed(productId: number, limit = 6): Promise<(DealRow & { viewers: number })[]> {
  await ensureMigrated();
  const since = new Date(Date.now() - 30 * DAY);
  const rows = await db.execute<{ product_id: number; viewers: number }>(sql`
    select b.product_id, count(distinct b.visitor)::int as viewers
    from product_views a join product_views b on b.visitor = a.visitor and b.product_id <> a.product_id
    where a.product_id = ${productId} and a.created_at >= ${since} and b.created_at >= ${since}
    group by b.product_id having count(distinct b.visitor) >= 2
    order by viewers desc, b.product_id limit ${limit}`);
  const list = (rows as unknown as { rows: { product_id: number; viewers: number }[] }).rows ?? (rows as unknown as { product_id: number; viewers: number }[]);
  if (!list.length) return [];
  const ids = list.map((r) => Number(r.product_id));
  const prods = await db.select().from(products).where(sql`${products.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  const byId = new Map(prods.map((x) => [x.id, x]));
  const enriched = await enrichDeals(ids.map((i) => byId.get(i)).filter((x): x is Product => !!x));
  const viewers = new Map(list.map((r) => [Number(r.product_id), Number(r.viewers)]));
  return enriched.map((d) => ({ ...d, viewers: viewers.get(d.id) ?? 0 }));
}

/** Nửa đêm kế tiếp theo giờ VN (UTC+7) */
export function nextVnMidnight(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - 7 * 3_600_000);
}

/**
 * Deal bí ẩn mỗi ngày: chọn cố định theo ngày (mọi người thấy cùng 1 deal) trong nhóm deal giảm thật ≥15% điểm cao,
 * bỏ các món đã có ở dải "Deal nổi bật" để luôn là bất ngờ.
 */
export async function mysteryDeal(excludeIds: number[] = [], now = new Date()): Promise<{ deal: DealRow; day: string; nextAt: string } | null> {
  await ensureMigrated();
  const rows = await db.select().from(products).where(gte(products.realDropPct, 15)).orderBy(desc(products.dealScore), products.id).limit(20);
  const pool = rows.filter((r) => !excludeIds.includes(r.id)).slice(0, 12);
  if (!pool.length) return null;
  const day = vnDay(now);
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [deal] = await enrichDeals([pool[h % pool.length]]);
  return { deal, day, nextAt: nextVnMidnight(now).toISOString() };
}
