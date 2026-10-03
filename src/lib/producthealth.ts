/**
 * Kiểm tra tình trạng sản phẩm trên web (trang Quản trị › Sản phẩm):
 * món còn thấy trên sàn hay đã vắng, món bị ẩn, thiếu ảnh/danh mục, link mua không hợp lệ, giá bất thường…
 * Mỗi "vấn đề" là một điều kiện SQL để vừa đếm, vừa lọc danh sách.
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { refFromInput } from "./links";

const DAY = 86_400_000;

export type Issue = "gone" | "hidden" | "no_image" | "no_category" | "bad_link" | "bad_price" | "price_jump" | "new";

export const ISSUES: { key: Issue; label: string; hint: string; tone: "bad" | "warn" | "info" }[] = [
  { key: "gone", label: "Không còn thấy trên sàn", hint: "Lần đồng bộ gần nhất của sàn không còn món này (hết hàng, ngừng bán hoặc hết khuyến mãi). Trang vẫn giữ nhưng không mời mua.", tone: "warn" },
  { key: "hidden", label: "Đã ẩn", hint: "Quản trị viên đã ẩn: không hiện trong danh sách, khách mở trang thấy 404.", tone: "info" },
  { key: "bad_price", label: "Giá bất thường", hint: "Giá ≤ 0, giá gạch thấp hơn giá bán, hoặc ghi giảm trên 95%.", tone: "bad" },
  { key: "price_jump", label: "Giá đổi gấp đôi / còn nửa", hint: "Trong 7 ngày có mức giá gấp đôi hoặc chỉ bằng nửa giá hiện tại – nên mở sàn kiểm tra giá có đúng không.", tone: "warn" },
  { key: "bad_link", label: "Link mua không hợp lệ", hint: "Link không phải http(s) hoặc là link mẫu (example.com) – khách bấm “Mua” sẽ không tới được sàn.", tone: "bad" },
  { key: "no_image", label: "Thiếu ảnh", hint: "Không có ảnh sản phẩm – thẻ deal và ảnh chia sẻ kém hấp dẫn.", tone: "warn" },
  { key: "no_category", label: "Thiếu danh mục", hint: "Không vào được trang danh mục, không so sánh được với món cùng loại.", tone: "info" },
  { key: "new", label: "Mới thêm (< 7 ngày)", hint: "Chưa đủ lịch sử để biết giá thường ngày.", tone: "info" },
];

/** Điều kiện SQL của từng vấn đề (`now` để kiểm thử) */
export function issueSql(key: Issue, now = new Date()): SQL {
  const week = new Date(now.getTime() - 7 * DAY);
  switch (key) {
    case "hidden":
      return sql`${products.hidden}`;
    case "gone":
      return sql`(not ${products.hidden} and not ${availableSql()})`;
    case "no_image":
      return sql`coalesce(${products.imageUrl}, '') = ''`;
    case "no_category":
      return sql`coalesce(${products.category}, '') = ''`;
    case "bad_link":
      return sql`(${products.affiliateUrl} !~* '^https?://[^/[:space:]]+\\.[a-z]{2,}' or ${products.affiliateUrl} ~* '^https?://(www\\.)?(example\\.(com|org|net)|e\\.com)(/|$)')`;
    case "bad_price":
      return sql`(${products.price} <= 0 or (coalesce(${products.originalPrice}, 0) > 0 and ${products.originalPrice} < ${products.price}) or ${products.discountPct} > 95)`;
    case "price_jump":
      return sql`exists (select 1 from price_points pp where pp.product_id = ${products.id} and pp.captured_at >= ${week}
        and (pp.price >= ${products.price} * 2 or pp.price * 2 <= ${products.price}))`;
    case "new":
      return sql`${products.createdAt} >= ${week}`;
  }
}

export interface HealthSummary {
  total: number;
  available: number;
  /** Số món có ít nhất 1 lỗi dữ liệu (giá bất thường, giá đổi mạnh, link lỗi) */
  needsCheck: number;
  counts: Record<Issue, number>;
  platforms: { platform: string; total: number; available: number; gone: number; hidden: number; lastSync: Date | null }[];
}

export async function healthSummary(now = new Date()): Promise<HealthSummary> {
  await ensureMigrated();
  const n = (cond: SQL) => sql<number>`count(*) filter (where ${cond})::int`;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      available: n(availableSql()),
      needsCheck: n(sql`(${issueSql("bad_price", now)} or ${issueSql("price_jump", now)} or ${issueSql("bad_link", now)})`),
      ...(Object.fromEntries(ISSUES.map((i) => [i.key, n(issueSql(i.key, now))])) as Record<Issue, SQL<number>>),
    })
    .from(products);
  const plats = await db
    .select({
      platform: products.platform,
      total: sql<number>`count(*)::int`,
      available: n(availableSql()),
      gone: n(issueSql("gone", now)),
      hidden: n(issueSql("hidden", now)),
      lastSync: sql<Date | string | null>`max(${products.lastSeenAt}) filter (where ${products.priceSource} <> 'ext')`,
    })
    .from(products)
    .groupBy(products.platform)
    .orderBy(products.platform);
  const counts = Object.fromEntries(ISSUES.map((i) => [i.key, Number((row as Record<string, unknown>)[i.key] ?? 0)])) as Record<Issue, number>;
  return {
    total: Number(row?.total ?? 0),
    available: Number(row?.available ?? 0),
    needsCheck: Number(row?.needsCheck ?? 0),
    counts,
    platforms: plats.map((p) => ({ ...p, total: Number(p.total), available: Number(p.available), gone: Number(p.gone), hidden: Number(p.hidden), lastSync: p.lastSync ? new Date(p.lastSync) : null })),
  };
}

export type HealthSort = "seen" | "views" | "clicks" | "score" | "new";
export const PAGE_SIZE = 40;

export interface HealthRow {
  p: Product;
  available: boolean;
  priceJump: boolean;
  views7: number;
  clicks7: number;
  watchers: number;
  issues: Issue[];
}

/** Vấn đề của 1 món, tính từ dữ liệu đã có (khớp với issueSql) */
export function rowIssues(p: Pick<Product, "hidden" | "imageUrl" | "category" | "affiliateUrl" | "price" | "originalPrice" | "discountPct" | "createdAt">, flags: { available: boolean; priceJump: boolean }, now = new Date()): Issue[] {
  const out: Issue[] = [];
  if (p.hidden) out.push("hidden");
  else if (!flags.available) out.push("gone");
  if (p.price <= 0 || ((p.originalPrice ?? 0) > 0 && p.originalPrice! < p.price) || p.discountPct > 95) out.push("bad_price");
  if (flags.priceJump) out.push("price_jump");
  if (!/^https?:\/\/[^/\s]+\.[a-z]{2,}/i.test(p.affiliateUrl) || /^https?:\/\/(www\.)?(example\.(com|org|net)|e\.com)(\/|$)/i.test(p.affiliateUrl)) out.push("bad_link");
  if (!p.imageUrl) out.push("no_image");
  if (!p.category) out.push("no_category");
  if (p.createdAt.getTime() >= now.getTime() - 7 * DAY) out.push("new");
  return out;
}

/** Ô tìm: mã món trên Săn Deal, mã trên sàn, link sàn/link Săn Deal, hoặc một phần tên */
async function searchCond(q: string): Promise<SQL | undefined> {
  const s = q.trim();
  if (!s) return undefined;
  const own = s.match(/\/(?:product|p|go)\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/);
  if (own) return eq(products.id, Number(own[1]));
  if (/^https?:\/\//i.test(s)) {
    const ref = await refFromInput(s).catch(() => null);
    return ref ? and(eq(products.platform, ref.platform), eq(products.externalId, ref.externalId)) : sql`false`;
  }
  if (/^\d+$/.test(s)) return or(s.length <= 9 ? eq(products.id, Number(s)) : undefined, eq(products.externalId, s));
  return or(ilike(products.name, `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`), ilike(products.shopName, `%${s}%`));
}

export async function healthList(opts: { issue?: Issue | "available" | "all"; platform?: string; q?: string; sort?: HealthSort; page?: number; now?: Date } = {}) {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 7 * DAY);
  const views = sql<number>`(select count(*)::int from product_views v where v.product_id = ${products.id} and v.created_at >= ${since})`;
  const clicksN = sql<number>`(select count(*)::int from clicks c where c.product_id = ${products.id} and c.created_at >= ${since})`;
  const watchers = sql<number>`(select count(*)::int from watches w where w.product_id = ${products.id})`;
  const conds: (SQL | undefined)[] = [
    opts.issue && opts.issue !== "all" ? (opts.issue === "available" ? availableSql() : issueSql(opts.issue, now)) : undefined,
    opts.platform ? eq(products.platform, opts.platform) : undefined,
    opts.q ? await searchCond(opts.q) : undefined,
  ];
  const where = and(...conds.filter(Boolean));
  const order =
    opts.sort === "views" ? [desc(views), desc(products.lastSeenAt)]
    : opts.sort === "clicks" ? [desc(clicksN), desc(products.lastSeenAt)]
    : opts.sort === "score" ? [desc(products.dealScore)]
    : opts.sort === "new" ? [desc(products.createdAt)]
    : [desc(products.lastSeenAt), asc(products.id)];
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(where);
  const rows = await db
    .select({ p: products, available: sql<boolean>`${availableSql()}`, priceJump: sql<boolean>`${issueSql("price_jump", now)}`, views7: views, clicks7: clicksN, watchers })
    .from(products)
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const list: HealthRow[] = rows.map((r) => {
    const flags = { available: !!r.available, priceJump: !!r.priceJump };
    return { p: r.p as Product, ...flags, views7: Number(r.views7), clicks7: Number(r.clicks7), watchers: Number(r.watchers), issues: rowIssues(r.p as Product, flags, now) };
  });
  return { total: Number(total), page, pages: Math.max(1, Math.ceil(Number(total) / PAGE_SIZE)), list };
}

/** Ẩn / hiện lại 1 món */
export async function setHidden(id: number, hidden: boolean, reason?: string | null, now = new Date()) {
  await ensureMigrated();
  const r = (reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const rows = await db
    .update(products)
    .set(hidden ? { hidden: true, hiddenReason: r, hiddenAt: now } : { hidden: false, hiddenReason: null, hiddenAt: null })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  return rows.length > 0;
}
