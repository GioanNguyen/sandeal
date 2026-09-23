import { enabledAdapters } from "@/adapters";
import { conversions } from "@/db/schema";
import { db } from "@/lib/db";

/** Lấy báo cáo đơn hàng/hoa hồng 30 ngày gần nhất từ các nguồn hỗ trợ */
export async function syncConversions(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  let n = 0;
  for (const a of enabledAdapters()) {
    if (!a.fetchConversions) continue;
    const rows = await a.fetchConversions(since);
    for (const c of rows) {
      const data = {
        platform: c.platform,
        orderAmount: c.orderAmount,
        commission: c.commission,
        status: c.status,
        purchasedAt: c.purchasedAt,
        raw: c.raw ?? null,
      };
      await db
        .insert(conversions)
        .values({ source: c.source, externalId: c.externalId, ...data })
        .onConflictDoUpdate({ target: [conversions.source, conversions.externalId], set: data });
    }
    n += rows.length;
  }
  return n;
}
