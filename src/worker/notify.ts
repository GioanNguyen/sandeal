import { productPath } from "@/lib/slug";
import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { products, users, watches } from "@/db/schema";
import { unsubscribeUrl } from "@/lib/auth";
import { db } from "@/lib/db";
import { vnd } from "@/lib/format";
import { button, escapeHtml, layout, sendMail, siteUrl } from "@/lib/mail";
import { sendPush } from "@/lib/push";

const DAY = 86_400_000;

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
    await db.update(watches).set({ lastNotifiedAt: now }).where(eq(watches.id, watch.id));
  }
  return due.length;
}
