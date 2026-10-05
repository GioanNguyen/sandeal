import { enabledAdapters } from "@/adapters";
import { conversions } from "@/db/schema";
import { db } from "@/lib/db";
import { attributeLines, saveOrders, type ConversionOrder } from "@/lib/revenue";

/**
 * Lấy báo cáo đơn hàng/hoa hồng 30 ngày gần nhất từ các nguồn hỗ trợ.
 * Lưu cả bản tổng (conversions) và từng dòng sản phẩm (conversion_items) rồi ghép với món/lượt bấm trên site.
 */
export async function syncConversions(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  let n = 0;
  for (const a of enabledAdapters()) {
    if (!a.fetchConversions) continue;
    const rows = await a.fetchConversions(since);
    const orders: ConversionOrder[] = [];
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
      const detailed = (c.orders ?? []).filter((o) => o.lines.length);
      if (detailed.length) for (const o of detailed) orders.push({ platform: c.platform, orderId: o.orderId, lines: o.lines });
      else
        // Nguồn không có chi tiết: 1 dòng cho cả đơn
        orders.push({
          platform: c.platform,
          orderId: c.externalId,
          lines: [{ lineKey: "#1", price: c.orderAmount, qty: 1, commission: c.commission, status: c.status, purchasedAt: c.purchasedAt }],
        });
    }
    await saveOrders(a.name === "mock" ? "mock" : "api", orders, now);
    n += rows.length;
  }
  if (n) await attributeLines({ now });
  return n;
}
