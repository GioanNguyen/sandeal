/**
 * Món "không còn thấy trên sàn": lần đồng bộ gần nhất của CHÍNH SÀN ĐÓ không còn trả về món này
 * trong PRODUCT_STALE_DAYS ngày (mặc định 3). So với lần đồng bộ mới nhất của sàn (không so với giờ hiện tại)
 * để khi nguồn dữ liệu của cả sàn bị gián đoạn thì không đánh dấu nhầm hàng loạt.
 * Săn Deal không biết chắc lý do (hết hàng, ngừng bán, hết khuyến mãi…) nên chỉ nói "không còn thấy".
 */
import { sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "./db";

const DAY = 86_400_000;
export const STALE_DAYS = () => Math.max(1, Number(process.env.PRODUCT_STALE_DAYS) || 3);

/**
 * Giá do người dùng tiện ích ghi nhận ("ext") chỉ cập nhật khi có người xem trang đó, nên không suy ra
 * "hết hàng" từ việc vắng mặt; chỉ không đưa vào danh sách deal khi giá đã cũ hơn EXT_FRESH_DAYS ngày.
 */
export const EXT_FRESH_DAYS = () => Math.max(1, Number(process.env.EXT_FRESH_DAYS) || 7);

/** Điều kiện SQL: món vẫn còn thấy trên sàn (dùng trong mọi danh sách deal) */
export const availableSql = () =>
  sql`(not ${products.hidden} and case when ${products.priceSource} = 'ext'
    then ${products.lastSeenAt} >= now() - make_interval(days => ${EXT_FRESH_DAYS()})
    else ${products.lastSeenAt} >= (select max(p2.last_seen_at) from products p2 where p2.platform = ${products.platform} and p2.price_source <> 'ext') - make_interval(days => ${STALE_DAYS()})
  end)`;
/** Điều kiện SQL: món không bị quản trị viên ẩn (dùng ở nơi vẫn hiện món đã vắng trên sàn, vd sitemap) */
export const visibleSql = () => sql`not ${products.hidden}`;

/** Lần đồng bộ mới nhất của từng sàn */
export async function platformLatest(): Promise<Map<string, Date>> {
  const rows = await db
    .select({ platform: products.platform, at: sql<Date | string>`max(${products.lastSeenAt})` })
    .from(products)
    // Chỉ tính lần đồng bộ từ nguồn API (giá người dùng góp không phải "lần đồng bộ của sàn")
    .where(sql`${products.priceSource} <> 'ext'`)
    .groupBy(products.platform);
  return new Map(rows.map((r) => [r.platform, new Date(r.at)]));
}

/** Mốc: thấy lần cuối trước mốc này là "không còn thấy" */
export const staleCutoff = (latest: Date | undefined) => (latest ? new Date(latest.getTime() - STALE_DAYS() * DAY) : null);

export function isUnavailable(p: { platform: string; lastSeenAt: Date | null; priceSource?: string }, latest: Map<string, Date>) {
  if (p.priceSource === "ext") return false;
  const cut = staleCutoff(latest.get(p.platform));
  return !!(cut && p.lastSeenAt && p.lastSeenAt < cut);
}
