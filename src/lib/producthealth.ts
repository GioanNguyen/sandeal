/**
 * Kiểm tra tình trạng sản phẩm trên web (trang Quản trị › Sản phẩm):
 * món còn thấy trên sàn hay đã vắng, món bị ẩn, thiếu ảnh/danh mục, link mua không hợp lệ, giá bất thường…
 * Mỗi "vấn đề" là một điều kiện SQL để vừa đếm, vừa lọc danh sách.
 */
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { clicks, productViews, products, watches, type Product } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { refFromInput } from "./links";

const DAY = 86_400_000;

export type Issue = "gone" | "hidden" | "no_image" | "bad_image" | "no_category" | "bad_link" | "no_aff" | "bad_price" | "price_jump" | "new";

/** Link mua Shopee là link affiliate (link rút gọn s.shopee.vn / shope.ee của tài khoản affiliate) – khớp NO_AFF_SQL */
export const SHOPEE_AFF_RE = /^https?:\/\/(s\.shopee\.vn|shope\.ee)\//i;
export const isShopeeAffiliate = (url: string | null | undefined) => SHOPEE_AFF_RE.test(url ?? "");

export const ISSUES: { key: Issue; label: string; hint: string; tone: "bad" | "warn" | "info" }[] = [
  { key: "gone", label: "Không còn thấy trên sàn", hint: "Lần đồng bộ gần nhất của sàn không còn món này (hết hàng, ngừng bán hoặc hết khuyến mãi). Trang vẫn giữ nhưng không mời mua.", tone: "warn" },
  { key: "hidden", label: "Đã ẩn", hint: "Quản trị viên đã ẩn: không hiện trong danh sách, khách mở trang thấy 404.", tone: "info" },
  { key: "bad_price", label: "Giá bất thường", hint: "Giá ≤ 0, giá gạch thấp hơn giá bán, hoặc ghi giảm trên 95%.", tone: "bad" },
  { key: "price_jump", label: "Giá đổi gấp đôi / còn nửa", hint: "Trong 7 ngày có mức giá gấp đôi hoặc chỉ bằng nửa giá hiện tại – nên mở sàn kiểm tra giá có đúng không.", tone: "warn" },
  { key: "bad_link", label: "Link mua không hợp lệ", hint: "Link không phải http(s) hoặc là link mẫu (example.com) – khách bấm “Mua” sẽ không tới được sàn.", tone: "bad" },
  { key: "no_aff", label: "Chưa có link affiliate", hint: "Món Shopee mà link mua là link sản phẩm thường (thường do khách góp qua tiện ích, hoặc file CSV thiếu “Link ưu đãi”) – khách bấm “Mua” không tính hoa hồng. Xuất danh sách, tạo link hàng loạt trên Shopee Affiliate rồi tải file kết quả lên để thay.", tone: "bad" },
  { key: "no_image", label: "Thiếu ảnh", hint: "Không có ảnh sản phẩm – thẻ deal và ảnh chia sẻ kém hấp dẫn.", tone: "warn" },
  { key: "bad_image", label: "Ảnh lỗi", hint: "Có link ảnh nhưng tải không được (link hỏng, không phải ảnh) – phát hiện khi web lập chỉ mục “Tìm bằng ảnh”, nên chỉ có số liệu khi tính năng này đang chạy.", tone: "warn" },
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
    case "bad_image":
      return sql`(coalesce(${products.imageUrl}, '') <> '' and exists (select 1 from product_embeddings e where e.product_id = ${products.id}
        and e.image_url = ${products.imageUrl} and e.vec is null and e.failures >= 1))`;
    case "no_aff":
      return sql`(${products.platform} = 'shopee' and ${products.affiliateUrl} !~* '^https?://(s\.shopee\.vn|shope\.ee)/')`;
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

/*
 * Lưu ý: drizzle viết cột trong phần SELECT không kèm tên bảng ("id" thay vì "products"."id"). Đặt các điều kiện có truy vấn con
 * (select … from product_views v where v.product_id = "id") vào SELECT thì "id" bị hiểu là cột của bảng con – đếm sai.
 * Vì vậy mọi số đếm ở đây đều đặt điều kiện trong WHERE / ORDER BY (drizzle có ghi tên bảng), không đặt trong SELECT.
 */
const countWhere = async (cond?: SQL) => Number((await db.select({ n: sql<number>`count(*)::int` }).from(products).where(cond))[0]?.n ?? 0);
const countByPlatform = async (cond?: SQL) =>
  new Map((await db.select({ platform: products.platform, n: sql<number>`count(*)::int` }).from(products).where(cond).groupBy(products.platform)).map((r) => [r.platform, Number(r.n)]));

export async function healthSummary(now = new Date()): Promise<HealthSummary> {
  await ensureMigrated();
  const [total, available, needsCheck, ...issueCounts] = await Promise.all([
    countWhere(),
    countWhere(availableSql()),
    countWhere(sql`(${issueSql("bad_price", now)} or ${issueSql("price_jump", now)} or ${issueSql("bad_link", now)})`),
    ...ISSUES.map((i) => countWhere(issueSql(i.key, now))),
  ]);
  const [plats, avail, gone, hidden] = await Promise.all([
    db
      .select({
        platform: products.platform,
        total: sql<number>`count(*)::int`,
        lastSync: sql<Date | string | null>`max(${products.lastSeenAt}) filter (where ${products.priceSource} <> 'ext')`,
      })
      .from(products)
      .groupBy(products.platform)
      .orderBy(products.platform),
    countByPlatform(availableSql()),
    countByPlatform(issueSql("gone", now)),
    countByPlatform(issueSql("hidden", now)),
  ]);
  return {
    total,
    available,
    needsCheck,
    counts: Object.fromEntries(ISSUES.map((i, k) => [i.key, issueCounts[k]])) as Record<Issue, number>,
    platforms: plats.map((p) => ({
      platform: p.platform,
      total: Number(p.total),
      available: avail.get(p.platform) ?? 0,
      gone: gone.get(p.platform) ?? 0,
      hidden: hidden.get(p.platform) ?? 0,
      lastSync: p.lastSync ? new Date(p.lastSync) : null,
    })),
  };
}

export type HealthSort = "seen" | "views" | "clicks" | "score" | "new";
export const PAGE_SIZE = 40;

export interface HealthRow {
  p: Product;
  available: boolean;
  priceJump: boolean;
  badImage: boolean;
  views7: number;
  clicks7: number;
  watchers: number;
  issues: Issue[];
}

/** Vấn đề của 1 món, tính từ dữ liệu đã có (khớp với issueSql) */
export function rowIssues(p: Pick<Product, "platform" | "hidden" | "imageUrl" | "category" | "affiliateUrl" | "price" | "originalPrice" | "discountPct" | "createdAt">, flags: { available: boolean; priceJump: boolean; badImage?: boolean }, now = new Date()): Issue[] {
  const out: Issue[] = [];
  if (p.hidden) out.push("hidden");
  else if (!flags.available) out.push("gone");
  if (p.price <= 0 || ((p.originalPrice ?? 0) > 0 && p.originalPrice! < p.price) || p.discountPct > 95) out.push("bad_price");
  if (flags.priceJump) out.push("price_jump");
  if (!/^https?:\/\/[^/\s]+\.[a-z]{2,}/i.test(p.affiliateUrl) || /^https?:\/\/(www\.)?(example\.(com|org|net)|e\.com)(\/|$)/i.test(p.affiliateUrl)) out.push("bad_link");
  if (p.platform === "shopee" && !isShopeeAffiliate(p.affiliateUrl)) out.push("no_aff");
  if (!p.imageUrl) out.push("no_image");
  else if (flags.badImage) out.push("bad_image");
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

/** Lọc theo ảnh: có ảnh (tải được), chưa có ảnh, ảnh lỗi */
export type ImageFilter = "co" | "chua" | "loi";

/** Giá trị lọc danh mục cho món chưa có danh mục */
export const NO_CATEGORY = "__none";

/** Danh mục đang có (kèm số món), nhiều món trước – cho ô lọc danh mục */
export async function categoryOptions(): Promise<{ name: string; n: number }[]> {
  await ensureMigrated();
  const rows = await db
    .select({ name: products.category, n: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`coalesce(${products.category}, '') <> ''`)
    .groupBy(products.category)
    .orderBy(desc(sql`count(*)`), asc(products.category));
  return rows.map((r) => ({ name: r.name!, n: Number(r.n) }));
}

/** Bộ lọc của danh sách sản phẩm (dùng chung cho danh sách và thao tác hàng loạt "tất cả món khớp bộ lọc") */
export interface HealthFilter {
  issue?: Issue | "available" | "all";
  platform?: string;
  q?: string;
  image?: ImageFilter;
  category?: string;
}

/** Món đã được tự xếp danh mục (từ khoá hoặc AI) – để quản trị viên xem lại */
export const AUTO_CATEGORY = "__auto";

export async function healthWhere(opts: HealthFilter, now = new Date()): Promise<SQL | undefined> {
  const conds: (SQL | undefined)[] = [
    opts.issue && opts.issue !== "all" ? (opts.issue === "available" ? availableSql() : issueSql(opts.issue, now)) : undefined,
    opts.platform ? eq(products.platform, opts.platform) : undefined,
    opts.category === NO_CATEGORY ? issueSql("no_category", now)
    : opts.category === AUTO_CATEGORY ? sql`${products.categorySource} in ('auto', 'ai')`
    : opts.category ? eq(products.category, opts.category) : undefined,
    opts.image === "chua" ? issueSql("no_image", now)
    : opts.image === "loi" ? issueSql("bad_image", now)
    : opts.image === "co" ? sql`(not ${issueSql("no_image", now)} and not ${issueSql("bad_image", now)})`
    : undefined,
    opts.q ? await searchCond(opts.q) : undefined,
  ];
  const where = and(...conds.filter(Boolean));
  return and(...conds.filter(Boolean));
}

export async function healthList(opts: HealthFilter & { sort?: HealthSort; page?: number; now?: Date } = {}) {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 7 * DAY);
  const views = sql<number>`(select count(*)::int from product_views v where v.product_id = ${products.id} and v.created_at >= ${since})`;
  const clicksN = sql<number>`(select count(*)::int from clicks c where c.product_id = ${products.id} and c.created_at >= ${since})`;
  const watchers = sql<number>`(select count(*)::int from watches w where w.product_id = ${products.id})`;
  const where = await healthWhere(opts, now);
  const order =
    opts.sort === "views" ? [desc(views), desc(products.lastSeenAt)]
    : opts.sort === "clicks" ? [desc(clicksN), desc(products.lastSeenAt)]
    : opts.sort === "score" ? [desc(products.dealScore)]
    : opts.sort === "new" ? [desc(products.createdAt)]
    : [desc(products.lastSeenAt), asc(products.id)];
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(where);
  const rows = (await db
    .select()
    .from(products)
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)) as Product[];
  // Số liệu từng món: truy vấn riêng theo danh sách mã của trang (xem lưu ý ở trên)
  const ids = rows.map((r) => r.id);
  const idsIn = (cond: SQL) => (ids.length ? db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), cond)) : Promise.resolve([]));
  const countIn = async (table: typeof productViews | typeof clicks | typeof watches, sinceCond: boolean) => {
    if (!ids.length) return new Map<number, number>();
    const pid = table.productId;
    const rs = await db
      .select({ id: pid, n: sql<number>`count(*)::int` })
      .from(table)
      .where(and(inArray(pid, ids), sinceCond && "createdAt" in table ? gte(table.createdAt, since) : undefined))
      .groupBy(pid);
    return new Map(rs.map((r) => [Number(r.id), Number(r.n)]));
  };
  const [availRows, jumpRows, badImgRows, viewN, clickN, watchN] = await Promise.all([
    idsIn(availableSql()),
    idsIn(issueSql("price_jump", now)),
    idsIn(issueSql("bad_image", now)),
    countIn(productViews, true),
    countIn(clicks, true),
    countIn(watches, false),
  ]);
  const avail = new Set(availRows.map((r) => r.id));
  const jump = new Set(jumpRows.map((r) => r.id));
  const badImg = new Set(badImgRows.map((r) => r.id));
  const list: HealthRow[] = rows.map((p) => {
    const flags = { available: avail.has(p.id), priceJump: jump.has(p.id), badImage: badImg.has(p.id) };
    return { p, ...flags, views7: viewN.get(p.id) ?? 0, clicks7: clickN.get(p.id) ?? 0, watchers: watchN.get(p.id) ?? 0, issues: rowIssues(p, flags, now) };
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

/** Tối đa số món một lần thao tác hàng loạt */
export const BULK_MAX = 5000;

/** Mã các món khớp bộ lọc (thao tác "tất cả món khớp bộ lọc") */
export async function idsMatching(filter: HealthFilter, now = new Date(), max = BULK_MAX): Promise<number[]> {
  await ensureMigrated();
  const where = await healthWhere(filter, now);
  return (await db.select({ id: products.id }).from(products).where(where).orderBy(asc(products.id)).limit(max)).map((r) => r.id);
}

/** Gán danh mục tay cho nhiều món (đánh dấu "manual": nguồn đồng bộ không ghi đè) */
export async function setCategoryMany(ids: number[], category: string): Promise<number> {
  await ensureMigrated();
  const c = category.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!c || !ids.length) return 0;
  const rows = await db.update(products).set({ category: c, categorySource: "manual" }).where(inArray(products.id, ids)).returning({ id: products.id });
  return rows.length;
}

/** Ẩn / hiện lại nhiều món */
export async function setHiddenMany(ids: number[], hidden: boolean, reason?: string | null, now = new Date()): Promise<number> {
  await ensureMigrated();
  if (!ids.length) return 0;
  const r = (reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const rows = await db
    .update(products)
    .set(hidden ? { hidden: true, hiddenReason: r, hiddenAt: now } : { hidden: false, hiddenReason: null, hiddenAt: null })
    .where(inArray(products.id, ids))
    .returning({ id: products.id });
  return rows.length;
}

/** Số món theo nguồn danh mục (để xem việc tự xếp) */
export async function categorySourceCounts(): Promise<{ auto: number; ai: number; manual: number; none: number }> {
  await ensureMigrated();
  const rows = await db.select({ s: products.categorySource, n: sql<number>`count(*)::int` }).from(products).where(sql`coalesce(${products.category}, '') <> ''`).groupBy(products.categorySource);
  const get = (k: string) => Number(rows.find((r) => r.s === k)?.n ?? 0);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(sql`coalesce(${products.category}, '') = ''`);
  return { auto: get("auto"), ai: get("ai"), manual: get("manual"), none: Number(n) };
}
