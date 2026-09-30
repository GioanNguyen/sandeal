import { productPath } from "@/lib/slug";
import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { products, users, watches } from "@/db/schema";
import { unsubscribeUrl } from "@/lib/auth";
import { db } from "@/lib/db";
import { vnd } from "@/lib/format";
import { button, escapeHtml, layout, sendMail, siteUrl } from "@/lib/mail";
import { sendPush } from "@/lib/push";
import { notifyZalo } from "@/lib/zalo";
import { availableSql } from "@/lib/availability";

const DAY = 86_400_000;

/**
 * Món "không còn thấy trên sàn" nay thấy lại: báo tất cả người đang theo dõi món đó (email + thông báo đẩy).
 * Không cần đạt giá mục tiêu – người dùng bấm "Báo khi có lại" chính là để biết món đã quay lại.
 */
export async function notifyRestock(productId: number, now = new Date()): Promise<number> {
  const rows = await db
    .select({ watch: watches, product: products, email: users.email })
    .from(watches)
    .innerJoin(products, eq(products.id, watches.productId))
    .innerJoin(users, eq(users.id, watches.userId))
    .where(eq(watches.productId, productId));
  const site = siteUrl();
  for (const { watch, product, email } of rows) {
    const hit = product.price <= watch.targetPrice;
    await sendMail(
      email,
      `Đã thấy lại trên sàn: ${product.name} – ${vnd(product.price)}`,
      layout(`<p><b>${escapeHtml(product.name)}</b> đã xuất hiện lại trên sàn với giá <b style="color:#d0390f">${vnd(product.price)}</b>${
        hit ? ` – bằng hoặc thấp hơn mức bạn đặt (${vnd(watch.targetPrice)})` : ` (mức bạn đặt: ${vnd(watch.targetPrice)})`
      }.</p>
        <p style="font-size:13px;color:#5b6170">Giá và tình trạng hàng có thể đổi nhanh, hãy kiểm tra trên sàn trước khi thanh toán.</p>
        <p>${button(`${site}/go/${product.id}`, "Xem trên sàn")} &nbsp; <a href="${site}${productPath(product)}">Xem lịch sử giá</a></p>
        <p style="font-size:13px"><a href="${unsubscribeUrl(watch.id)}" style="color:#5b6170">Huỷ theo dõi sản phẩm này</a></p>`),
    );
    await sendPush(watch.userId, {
      title: `Đã có lại: ${vnd(product.price)}`,
      body: `${product.name} đã xuất hiện lại trên sàn.`,
      url: productPath(product),
      image: product.imageUrl?.startsWith("http") ? product.imageUrl : undefined,
      tag: `restock-${watch.id}`,
    });
    await notifyZalo(watch.userId, `🔔 Đã có lại trên sàn: ${product.name}\nGiá ${vnd(product.price)} (mức bạn đặt: ${vnd(watch.targetPrice)})\n${site}/go/${product.id}`, now);
    // Đã báo hôm nay: không gửi thêm mail "giảm giá" trong 24 giờ
    if (hit) await db.update(watches).set({ lastNotifiedAt: now }).where(eq(watches.id, watch.id));
  }
  return rows.length;
}

/** Gửi email khi giá ≤ giá mục tiêu; tối đa 1 email/ngày cho mỗi lượt theo dõi */
export async function notifyWatchers(now = new Date()): Promise<number> {
  const due = await db
    .select({ watch: watches, product: products, email: users.email })
    .from(watches)
    .innerJoin(products, eq(products.id, watches.productId))
    .innerJoin(users, eq(users.id, watches.userId))
    .where(
      and(
        lte(products.price, watches.targetPrice),
        // Món không còn thấy trên sàn: giá cũ không phải giá đang bán, không báo "giảm giá"
        availableSql(),
        or(isNull(watches.lastNotifiedAt), lt(watches.lastNotifiedAt, new Date(now.getTime() - DAY))),
      ),
    );

  for (const { watch, product, email } of due) {
    const site = siteUrl();
    await sendMail(
      email,
      `Giảm giá: ${product.name} còn ${vnd(product.price)}`,
      layout(`<p><b>${escapeHtml(product.name)}</b> đang có giá <b style="color:#d0390f">${vnd(product.price)}</b>
        (mục tiêu của bạn: ${vnd(watch.targetPrice)}).</p>
        <p>${button(`${site}/go/${product.id}`, "Mua ngay")} &nbsp; <a href="${site}${productPath(product)}">Xem lịch sử giá</a></p>
        <p style="font-size:13px"><a href="${unsubscribeUrl(watch.id)}" style="color:#5b6170">Huỷ theo dõi sản phẩm này</a> ·
        <a href="${site}/account" style="color:#5b6170">Quản lý theo dõi</a></p>`),
    );
    await sendPush(watch.userId, {
      title: `Giảm giá: còn ${vnd(product.price)}`,
      body: `${product.name} đã chạm mức bạn muốn (${vnd(watch.targetPrice)}).`,
      url: productPath(product),
      image: product.imageUrl?.startsWith("http") ? product.imageUrl : undefined,
      tag: `watch-${watch.id}`,
    });
    await notifyZalo(watch.userId, `📉 Giảm giá: ${product.name}\nCòn ${vnd(product.price)} – đã chạm mức bạn muốn (${vnd(watch.targetPrice)})\nMua: ${site}/go/${product.id}\nLịch sử giá: ${site}${productPath(product)}`, now);
    await db.update(watches).set({ lastNotifiedAt: now }).where(eq(watches.id, watch.id));
  }
  return due.length;
}
