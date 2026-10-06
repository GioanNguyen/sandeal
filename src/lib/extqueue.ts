/**
 * Hàng đợi cho tiện ích trình duyệt (chế độ "Cập nhật hàng loạt" của quản trị viên): các món đang bán chưa có ảnh,
 * món được xem / bấm mua nhiều làm trước. Tiện ích mở lần lượt từng trang sản phẩm (link thường, không phải link
 * affiliate) với tốc độ như người thật; dữ liệu trang được gửi về như "Góp giá" bình thường.
 */
import { and, desc, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { clicks, productViews, products } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { plainProductUrl } from "./links";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Món đã mở gần đây mà vẫn chưa có ảnh (trang lỗi, hết hàng…): không đưa lại trong 24 giờ
const g = globalThis as unknown as { __extQueueTried?: Map<number, number> };
const tried = (g.__extQueueTried ??= new Map());

export interface QueueItem {
  id: number;
  name: string;
  platform: string;
  url: string;
}

const noImage = sql`coalesce(${products.imageUrl}, '') = ''`;

export async function imageQueue(opts: { limit?: number; now?: Date } = {}): Promise<{ items: QueueItem[]; remaining: number }> {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const since = new Date(now.getTime() - 30 * DAY);
  for (const [id, at] of tried) if (now.getTime() - at > DAY) tried.delete(id);

  const views = db.select({ pid: productViews.productId, n: sql<number>`count(*)`.as("vn") }).from(productViews).where(gte(productViews.createdAt, since)).groupBy(productViews.productId).as("v");
  const clk = db
    .select({ pid: clicks.productId, n: sql<number>`count(*)`.as("cn") })
    .from(clicks)
    .where(and(gte(clicks.createdAt, since), isNotNull(clicks.productId)))
    .groupBy(clicks.productId)
    .as("c");
  const where = and(availableSql(), noImage);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, platform: products.platform, externalId: products.externalId, productUrl: products.productUrl, affiliateUrl: products.affiliateUrl })
      .from(products)
      .leftJoin(views, sql`${views.pid} = ${products.id}`)
      .leftJoin(clk, sql`${clk.pid} = ${products.id}`)
      .where(where)
      // Món khách quan tâm trước (bấm mua nặng gấp 5 lần lượt xem), rồi món mới thấy trên sàn
      .orderBy(desc(sql`coalesce(${views.n}, 0) + 5 * coalesce(${clk.n}, 0)`), desc(products.lastSeenAt))
      .limit(limit * 4 + tried.size),
    db.select({ n: sql<number>`count(*)::int` }).from(products).where(where),
  ]);
  const items: QueueItem[] = [];
  for (const r of rows) {
    if (tried.has(r.id)) continue;
    const u = plainProductUrl(r);
    // Chỉ mở đúng trang sản phẩm (không mở trang tìm kiếm khi không biết link)
    if (!u.exact) continue;
    items.push({ id: r.id, name: r.name, platform: r.platform, url: u.url });
    if (items.length >= limit) break;
  }
  return { items, remaining: Number(n) };
}

/** Tiện ích báo đã mở xong 1 món: món vẫn chưa có ảnh thì tạm bỏ qua 24 giờ */
export async function markTried(ids: number[], now = new Date()) {
  const clean = ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, 100);
  if (!clean.length) return { stillMissing: 0 };
  const rows = await db.select({ id: products.id }).from(products).where(and(inArray(products.id, clean), noImage));
  for (const r of rows) tried.set(r.id, now.getTime());
  return { stillMissing: rows.length };
}
