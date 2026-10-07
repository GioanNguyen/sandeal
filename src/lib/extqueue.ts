/**
 * Hàng đợi cho tiện ích trình duyệt (chế độ "Cập nhật hàng loạt" của quản trị viên). Gồm 2 loại món:
 *  - thiếu ảnh: món đang bán chưa có ảnh (thường là món nhập từ CSV)
 *  - giá cũ: món khách đang quan tâm (có lượt xem / bấm mua / theo dõi giá trong 30 ngày) mà giá đã quá
 *    STALE_PRICE_DAYS ngày chưa cập nhật (CSV chưa nhập lại, chưa ai góp giá)
 * Món được quan tâm nhiều làm trước. Tiện ích mở lần lượt từng trang sản phẩm (link thường, không phải link affiliate)
 * với tốc độ như người thật; dữ liệu trang được gửi về như "Góp giá" bình thường.
 */
import { and, count, desc, gte, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { clicks, productViews, products, watches } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { plainProductUrl } from "./links";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Giá quá ngần này ngày chưa cập nhật là "giá cũ" */
export const STALE_PRICE_DAYS = () => Math.max(1, Number(process.env.STALE_PRICE_DAYS) || 3);
/** Món vắng lâu hơn thế này thì thôi (nhiều khả năng đã ngừng bán) */
const MAX_STALE_DAYS = 45;

// Món đã mở gần đây mà vẫn chưa cập nhật được (trang lỗi, hết hàng…): không đưa lại trong 24 giờ
const g = globalThis as unknown as { __extQueueTried?: Map<number, number> };
const tried = (g.__extQueueTried ??= new Map());

export type QueueReason = "image" | "price";
export interface QueueItem {
  id: number;
  name: string;
  platform: string;
  url: string;
  reason: QueueReason;
  /** Số ngày giá chưa cập nhật (món giá cũ) */
  staleDays?: number;
}

const noImage = sql`coalesce(${products.imageUrl}, '') = ''`;

/**
 * Món mở được đúng trang sản phẩm (giống plainProductUrl với exact = true): có link sản phẩm, link mua là link sản phẩm
 * đầy đủ, hoặc Lazada / TikTok có mã số. Món không thoả (chỉ có link rút gọn s.shopee.vn) tiện ích không mở được.
 */
export const openableSql = sql`(${products.productUrl} ~* '^https://'
  or ${products.affiliateUrl} ~* '^https?://([a-z]+\.)?shopee\.vn/(product/[0-9]+/[0-9]+|.*-i\.[0-9]+\.[0-9]+)'
  or ${products.affiliateUrl} ~* '^https?://([a-z]+\.)?lazada\.vn/.*-i[0-9]+'
  or (${products.platform} in ('lazada', 'tiktok') and ${products.externalId} ~ '^[0-9]+$'))`;

/** Mức quan tâm 30 ngày: lượt xem + 5 × bấm mua + 10 × người đang theo dõi giá */
function interest(now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const views = db.select({ pid: productViews.productId, n: sql<number>`count(*)`.as("vn") }).from(productViews).where(gte(productViews.createdAt, since)).groupBy(productViews.productId).as("v");
  const clk = db
    .select({ pid: clicks.productId, n: sql<number>`count(*)`.as("cn") })
    .from(clicks)
    .where(and(gte(clicks.createdAt, since), isNotNull(clicks.productId)))
    .groupBy(clicks.productId)
    .as("c");
  const wat = db.select({ pid: watches.productId, n: sql<number>`count(*)`.as("wn") }).from(watches).groupBy(watches.productId).as("w");
  const score = sql<number>`(coalesce(${views.n}, 0) + 5 * coalesce(${clk.n}, 0) + 10 * coalesce(${wat.n}, 0))`;
  return { views, clk, wat, score };
}

function conditions(now: Date, score: SQL) {
  const staleCut = new Date(now.getTime() - STALE_PRICE_DAYS() * DAY);
  const tooOld = new Date(now.getTime() - MAX_STALE_DAYS * DAY);
  const image = and(availableSql(), noImage, openableSql)!;
  const price = and(sql`not ${products.hidden}`, lt(products.lastSeenAt, staleCut), gte(products.lastSeenAt, tooOld), sql`${score} > 0`, openableSql)!;
  return { image, price, any: or(image, price)! };
}

export async function extQueue(opts: { limit?: number; now?: Date } = {}): Promise<{ items: QueueItem[]; remaining: number; counts: { image: number; price: number } }> {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  for (const [id, at] of tried) if (now.getTime() - at > DAY) tried.delete(id);
  const { views, clk, wat, score } = interest(now);
  const c = conditions(now, score);
  const base = () =>
    db
      .select({ n: count() })
      .from(products)
      .leftJoin(views, sql`${views.pid} = ${products.id}`)
      .leftJoin(clk, sql`${clk.pid} = ${products.id}`)
      .leftJoin(wat, sql`${wat.pid} = ${products.id}`);
  const [rows, [img], [prc]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        platform: products.platform,
        externalId: products.externalId,
        productUrl: products.productUrl,
        affiliateUrl: products.affiliateUrl,
        imageUrl: products.imageUrl,
        lastSeenAt: products.lastSeenAt,
        isImage: sql<boolean>`(${c.image})`,
      })
      .from(products)
      .leftJoin(views, sql`${views.pid} = ${products.id}`)
      .leftJoin(clk, sql`${clk.pid} = ${products.id}`)
      .leftJoin(wat, sql`${wat.pid} = ${products.id}`)
      .where(c.any)
      // Món khách quan tâm trước, rồi món mới thấy trên sàn
      .orderBy(desc(score), desc(products.lastSeenAt))
      .limit(limit * 4 + tried.size),
    base().where(c.image),
    base().where(and(c.price, sql`not (${c.image})`)),
  ]);
  const items: QueueItem[] = [];
  for (const r of rows) {
    if (tried.has(r.id)) continue;
    const u = plainProductUrl(r);
    // Chỉ mở đúng trang sản phẩm (không mở trang tìm kiếm khi không biết link)
    if (!u.exact) continue;
    const isImage = r.isImage === true || (r.isImage as unknown) === "t";
    items.push({
      id: r.id,
      name: r.name,
      platform: r.platform,
      url: u.url,
      reason: isImage ? "image" : "price",
      ...(isImage ? {} : { staleDays: Math.floor((now.getTime() - r.lastSeenAt.getTime()) / DAY) }),
    });
    if (items.length >= limit) break;
  }
  const counts = { image: Number(img.n), price: Number(prc.n) };
  return { items, remaining: counts.image + counts.price, counts };
}

/**
 * Số món thiếu ảnh tách theo tình trạng – để trang quản trị và tiện ích nói cùng một con số:
 *  all: mọi món chưa có ảnh · available: đang bán (đang hiện trên web) · openable: đang bán và tiện ích mở được trang
 */
export async function imageGapCounts(): Promise<{ all: number; available: number; openable: number }> {
  await ensureMigrated();
  const n = async (w: SQL) => Number((await db.select({ n: count() }).from(products).where(w))[0].n);
  const [all, available, openable] = await Promise.all([n(noImage), n(and(availableSql(), noImage)!), n(and(availableSql(), noImage, openableSql)!)]);
  return { all, available, openable };
}

/** Giữ tên cũ cho chỗ khác đang gọi */
export const imageQueue = extQueue;

/** Số món giá cũ đang được quan tâm, theo danh mục (để biết nên xuất CSV ngành nào) – dùng cho trang Hôm nay */
export async function stalePriceSummary(now = new Date()): Promise<{ total: number; byCategory: { category: string; n: number }[] }> {
  await ensureMigrated();
  const { views, clk, wat, score } = interest(now);
  const c = conditions(now, score);
  const cat = sql<string>`coalesce(${products.category}, 'Chưa có danh mục')`;
  const rows = await db
    .select({ category: cat, n: count() })
    .from(products)
    .leftJoin(views, sql`${views.pid} = ${products.id}`)
    .leftJoin(clk, sql`${clk.pid} = ${products.id}`)
    .leftJoin(wat, sql`${wat.pid} = ${products.id}`)
    .where(c.price)
    .groupBy(cat)
    .orderBy(desc(count()));
  return { total: rows.reduce((s, r) => s + Number(r.n), 0), byCategory: rows.map((r) => ({ category: r.category, n: Number(r.n) })) };
}

/** Tiện ích báo đã mở xong 1 món: món vẫn chưa cập nhật được (còn thiếu ảnh / giá vẫn cũ) thì tạm bỏ qua 24 giờ */
export async function markTried(ids: number[], now = new Date()) {
  const clean = ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, 100);
  if (!clean.length) return { stillMissing: 0 };
  const staleCut = new Date(now.getTime() - STALE_PRICE_DAYS() * DAY);
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, clean), or(noImage, lt(products.lastSeenAt, staleCut))));
  for (const r of rows) tried.set(r.id, now.getTime());
  return { stillMissing: rows.length };
}
