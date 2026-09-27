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

/** Điều kiện SQL: món vẫn còn thấy trên sàn (dùng trong mọi danh sách deal) */
export const availableSql = () =>
  sql`${products.lastSeenAt} >= (select max(p2.last_seen_at) from products p2 where p2.platform = ${products.platform}) - make_interval(days => ${STALE_DAYS()})`;

/** Lần đồng bộ mới nhất của từng sàn */
export async function platformLatest(): Promise<Map<string, Date>> {
  const rows = await db
    .select({ platform: products.platform, at: sql<Date | string>`max(${products.lastSeenAt})` })
    .from(products)
    .groupBy(products.platform);
  return new Map(rows.map((r) => [r.platform, new Date(r.at)]));
}

/** Mốc: thấy lần cuối trước mốc này là "không còn thấy" */
export const staleCutoff = (latest: Date | undefined) => (latest ? new Date(latest.getTime() - STALE_DAYS() * DAY) : null);

export function isUnavailable(p: { platform: string; lastSeenAt: Date | null }, latest: Map<string, Date>) {
  const cut = staleCutoff(latest.get(p.platform));
  return !!(cut && p.lastSeenAt && p.lastSeenAt < cut);
}
