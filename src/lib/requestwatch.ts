/**
 * Link khách dán mà Săn Deal chưa có dữ liệu: không để khách về tay trắng.
 *  - Gợi ý món tương tự đang có lịch sử giá (đoán từ tên trong đường dẫn / chữ khách chia sẻ)
 *  - "Báo cho tôi khi có lịch sử giá": khi link được tra cứu xong (API, tiện ích quản trị, người khác góp giá…) thì gửi
 *    email (và Telegram nếu tài khoản đã liên kết) kèm link trang sản phẩm.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { productRequests, products, requestWatchers, subscriptions } from "@/db/schema";
import { fold } from "./autocategory";
import { db, ensureMigrated } from "./db";
import { PLATFORMS, vnd } from "./format";
import { button, escapeHtml, layout, sendMail, siteUrl } from "./mail";
import { listDeals, type DealRow } from "./queries";
import { productPath } from "./slug";
import { sendTelegram } from "./telegram";

const DAY = 86_400_000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

// Chữ không mang nghĩa sản phẩm (quảng cáo, đơn vị, mã) – bỏ khi đoán món tương tự
const NOISE = new Set(
  ["chinh", "hang", "chính", "hãng", "freeship", "free", "ship", "sale", "giam", "giảm", "gia", "giá", "re", "rẻ", "hot", "new", "moi", "mới", "combo", "set", "loai", "loại", "cao", "cap", "cấp", "tot", "tốt", "nhat", "nhất", "ban", "bán", "chay", "chạy", "mau", "mẫu", "2024", "2025", "2026", "hcm", "hn", "tphcm", "voucher", "qua", "quà", "tang", "tặng", "kem", "kèm", "bao", "bảo", "hanh", "hành"].map((w) => w.normalize("NFC")),
);

/** Từ khoá tìm món tương tự: các chữ đầu có nghĩa của tên (tên sản phẩm thường nói loại hàng trước) */
export function similarKeywords(hint: string): string[] {
  const words = hint
    .normalize("NFC")
    .replace(/[\[\](){}|,.;:!?"'“”/\\#*]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^\d+([a-z]{0,3})$/i.test(w) && !NOISE.has(w.toLowerCase()) && !NOISE.has(fold(w).trim()));
  const out: string[] = [];
  for (const n of [3, 2]) if (words.length >= n) out.push(words.slice(0, n).join(" "));
  if (words[0] && words[0].length >= 3) out.push(words[0]);
  return [...new Set(out)];
}

/** Món tương tự đang có lịch sử giá: thử cụm 3 chữ, rồi 2 chữ, rồi 1 chữ đầu */
export async function similarForHint(hint: string | null | undefined, limit = 6): Promise<{ items: DealRow[]; keyword: string | null }> {
  if (!hint) return { items: [], keyword: null };
  for (const q of similarKeywords(hint)) {
    const { items } = await listDeals({ q, pageSize: limit, sort: "score" });
    if (items.length >= 2) return { items, keyword: q };
  }
  return { items: [], keyword: null };
}

/** Đăng ký báo khi link có dữ liệu. Trả về false nếu email không hợp lệ */
export async function watchRequest(requestId: number, who: { email: string; userId?: number | null }, now = new Date()) {
  await ensureMigrated();
  const email = who.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return false;
  const [req] = await db.select({ id: productRequests.id }).from(productRequests).where(eq(productRequests.id, requestId)).limit(1);
  if (!req) return false;
  await db
    .insert(requestWatchers)
    .values({ requestId, email, userId: who.userId ?? null, createdAt: now })
    .onConflictDoUpdate({ target: [requestWatchers.requestId, requestWatchers.email], set: { notifiedAt: null, userId: who.userId ?? null } });
  return true;
}

/**
 * Gửi báo cho người chờ các link nay đã có dữ liệu. Chạy định kỳ (mỗi giờ) – link được giải quyết bằng bất kỳ cách nào
 * (tra cứu API, tiện ích, người khác góp giá) đều được báo. Người chờ quá 60 ngày mà link vẫn chưa có dữ liệu thì thôi.
 */
export async function notifyResolvedRequests(now = new Date()): Promise<number> {
  await ensureMigrated();
  const rows = await db
    .select({
      id: requestWatchers.id,
      email: requestWatchers.email,
      userId: requestWatchers.userId,
      productId: productRequests.productId,
      platform: productRequests.platform,
    })
    .from(requestWatchers)
    .innerJoin(productRequests, eq(productRequests.id, requestWatchers.requestId))
    .where(and(isNull(requestWatchers.notifiedAt), isNotNull(productRequests.productId)))
    .limit(200);
  let sent = 0;
  for (const r of rows) {
    const [p] = await db.select({ id: products.id, name: products.name, price: products.price, platform: products.platform }).from(products).where(eq(products.id, r.productId!)).limit(1);
    await db.update(requestWatchers).set({ notifiedAt: now }).where(eq(requestWatchers.id, r.id));
    if (!p) continue;
    const link = `${siteUrl()}${productPath(p)}?utm_source=email&utm_medium=request`;
    const label = PLATFORMS[p.platform]?.label ?? p.platform;
    const html = layout(
      `<p style="font-size:16px"><b>Món bạn hỏi đã có dữ liệu giá</b></p>
       <p style="font-size:17px;font-weight:700;margin:10px 0 4px">${escapeHtml(p.name)}</p>
       <p style="color:#5b6170">${label} · giá hiện tại ${vnd(p.price)}</p>
       <p>Xem lịch sử giá, biết có đang giảm thật không và đặt báo khi giá xuống:</p>
       <p>${button(link, "Xem lịch sử giá")}</p>`,
    );
    if (r.email) await sendMail(r.email, `Đã có lịch sử giá: ${p.name.slice(0, 60)}`, html).catch((e) => console.error("[request-watch] email lỗi:", (e as Error).message));
    if (r.userId) {
      const [sub] = await db.select({ chat: subscriptions.telegramChatId }).from(subscriptions).where(eq(subscriptions.userId, r.userId)).limit(1);
      if (sub?.chat) await sendTelegram(sub.chat, `<b>Đã có lịch sử giá món bạn hỏi</b>\n${escapeHtml(p.name)}\n${label} · ${vnd(p.price)}`, null, { text: "Xem lịch sử giá", url: link }).catch(() => false);
    }
    sent++;
  }
  // Chờ quá lâu mà vẫn chưa có dữ liệu: thôi không giữ
  await db
    .update(requestWatchers)
    .set({ notifiedAt: now })
    .where(and(isNull(requestWatchers.notifiedAt), sql`${requestWatchers.createdAt} < ${new Date(now.getTime() - 60 * DAY)}`));
  return sent;
}
