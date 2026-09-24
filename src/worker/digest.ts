import { productPath } from "@/lib/slug";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, notExists, or, sql, type SQL } from "drizzle-orm";
import { products, sentDeals, subscriptions, users, vouchers, type Product, type Subscription } from "@/db/schema";
import { signedFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORMS, vnd } from "@/lib/format";
import { button, escapeHtml, layout, sendMail, siteUrl } from "@/lib/mail";
import { saleTomorrow, vnParts } from "@/lib/sales";
import { sendTelegram } from "@/lib/telegram";
import { sendPush } from "@/lib/push";
import { pushSubscriptions } from "@/db/schema";

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
/** 00:00 hôm nay theo giờ VN */
const vnToday = (now: Date) => new Date(Math.floor((now.getTime() + VN) / DAY) * DAY - VN);

/** Deal khớp sở thích, chưa từng gửi cho người này */
export async function matchingDeals(userId: number, s: Subscription, now = new Date(), limit = 8): Promise<Product[]> {
  const conds: SQL[] = [
    gte(products.lastSeenAt, new Date(now.getTime() - 1.5 * DAY)),
    gte(products.realDropPct, s.minDrop),
    notExists(
      db.select({ x: sql`1` }).from(sentDeals).where(and(eq(sentDeals.userId, userId), eq(sentDeals.productId, products.id))),
    ),
  ];
  if (s.maxPrice) conds.push(lte(products.price, s.maxPrice));
  if (s.platforms.length) conds.push(inArray(products.platform, s.platforms));
  if (s.categories.length) conds.push(inArray(products.category, s.categories));
  const kws = s.keywords.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
  if (kws.length) conds.push(or(...kws.map((k) => ilike(products.name, `%${k.replace(/[%_]/g, "")}%`)))!);
  return db.select().from(products).where(and(...conds)).orderBy(desc(products.dealScore)).limit(limit);
}

function digestEmail(deals: Product[], userId: number) {
  const site = siteUrl();
  const rows = deals
    .map(
      (p) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #f1e3da">
    <a href="${site}${productPath(p)}" style="color:#1c1a19;text-decoration:none;font-weight:600">${escapeHtml(p.name)}</a><br>
    <span style="color:#5b6170;font-size:13px">${PLATFORMS[p.platform]?.label ?? p.platform} · giảm thật ${Math.round(p.realDropPct)}% so với 30 ngày</span>
  </td>
  <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f1e3da;text-align:right;white-space:nowrap">
    <b style="color:#d0390f">${vnd(p.price)}</b><br><a href="${site}/go/${p.id}" style="font-size:13px;color:#d0390f">Mua ngay →</a>
  </td>
</tr>`,
    )
    .join("");
  return layout(`<p>Deal mới khớp sở thích của bạn hôm nay:</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>
<p style="margin-top:20px">${button(`${site}/`, "Xem thêm deal")}</p>
<p style="font-size:13px"><a href="${site}/account/so-thich" style="color:#5b6170">Đổi sở thích</a> ·
<a href="${site}/unsubscribe?t=digest&u=${userId}&s=${signedFor("digest", userId)}" style="color:#5b6170">Tắt bản tin email</a></p>`);
}

function digestTelegram(deals: Product[]) {
  const site = siteUrl();
  return [
    "<b>Deal hôm nay theo sở thích của bạn</b>",
    ...deals.map((p, i) => `${i + 1}. <a href="${site}/go/${p.id}">${escapeHtml(p.name)}</a>\n   <b>${vnd(p.price)}</b> · giảm thật ${Math.round(p.realDropPct)}% · ${PLATFORMS[p.platform]?.label ?? ""}`),
    `\nĐổi sở thích: ${site}/account/so-thich`,
  ].join("\n");
}

/** Bản tin hằng ngày (gửi từ DIGEST_HOUR giờ VN, mỗi người tối đa 1 lần/ngày) */
export async function runDigests(now = new Date()): Promise<number> {
  if (vnParts(now).h < Number(process.env.DIGEST_HOUR ?? 8)) return 0;
  const today = vnToday(now);
  const subs = await db
    .select({ s: subscriptions, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(
      and(
        or(
          eq(subscriptions.emailDigest, true),
          and(eq(subscriptions.telegramDigest, true), sql`${subscriptions.telegramChatId} is not null`),
          and(eq(subscriptions.pushDigest, true), sql`exists (select 1 from ${pushSubscriptions} ps where ps.user_id = ${subscriptions.userId})`),
        ),
        or(isNull(subscriptions.lastDigestAt), sql`${subscriptions.lastDigestAt} < ${today}`),
      ),
    );
  let sent = 0;
  for (const { s, email } of subs) {
    const deals = await matchingDeals(s.userId, s, now);
    if (deals.length) {
      if (s.emailDigest) await sendMail(email, `${deals.length} deal giảm thật hôm nay cho bạn – Săn Deal`, digestEmail(deals, s.userId));
      if (s.telegramDigest && s.telegramChatId) await sendTelegram(s.telegramChatId, digestTelegram(deals));
      if (s.pushDigest) await sendPush(s.userId, {
        title: `${deals.length} deal giảm thật hôm nay cho bạn`,
        body: deals.slice(0, 2).map((d) => `${d.name} – ${vnd(d.price)}`).join(" · "),
        url: "/account/so-thich",
        tag: "digest",
      });
      await db.insert(sentDeals).values(deals.map((d) => ({ userId: s.userId, productId: d.id, sentAt: now }))).onConflictDoNothing();
      sent++;
    }
    await db.update(subscriptions).set({ lastDigestAt: now }).where(eq(subscriptions.userId, s.userId));
  }
  // dọn lịch sử gửi cũ hơn 30 ngày để deal tốt có thể được gửi lại
  await db.delete(sentDeals).where(sql`${sentDeals.sentAt} < ${new Date(now.getTime() - 30 * DAY)}`);
  return sent;
}

/** Nhắc sale: từ 20h tối hôm trước ngày sale */
export async function runSaleReminders(now = new Date()): Promise<number> {
  const event = saleTomorrow(now);
  if (!event || vnParts(now).h < Number(process.env.SALE_REMINDER_HOUR ?? 20)) return 0;
  const subs = await db
    .select({ s: subscriptions, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(
      and(
        eq(subscriptions.saleReminder, true),
        or(isNull(subscriptions.lastSaleReminderKey), sql`${subscriptions.lastSaleReminderKey} <> ${event.key}`),
      ),
    );
  if (!subs.length) return 0;
  const vs = await db
    .select()
    .from(vouchers)
    .where(and(or(isNull(vouchers.startAt), lte(vouchers.startAt, event.end)), or(isNull(vouchers.endAt), gte(vouchers.endAt, event.start))))
    .limit(5);
  const site = siteUrl();
  const list = vs.map((v) => `<li>${escapeHtml(v.title)}${v.code ? ` – mã <b>${escapeHtml(v.code)}</b>` : ""}</li>`).join("");
  for (const { s, email } of subs) {
    await sendMail(
      email,
      `Nhắc bạn: ${event.name} bắt đầu lúc 0h đêm nay`,
      layout(`<p><b>${escapeHtml(event.name)}</b> bắt đầu lúc <b>0h đêm nay</b>. ${escapeHtml(event.note)}.</p>
${list ? `<p>Mã nên lưu trước:</p><ul>${list}</ul>` : ""}
<p>Mẹo: bỏ sẵn món cần mua vào giỏ và kiểm tra giá thật trước khi chốt đơn.</p>
<p>${button(`${site}/lich-sale`, "Xem lịch sale & mã giảm giá")}</p>
<p style="font-size:13px"><a href="${site}/unsubscribe?t=sale&u=${s.userId}&s=${signedFor("sale", s.userId)}" style="color:#5b6170">Tắt nhắc sale</a></p>`),
    );
    await sendPush(s.userId, { title: `${event.name} bắt đầu lúc 0h đêm nay`, body: event.note, url: "/lich-sale", tag: `sale-${event.key}` });
    if (s.telegramChatId) {
      await sendTelegram(s.telegramChatId, `⏰ <b>${escapeHtml(event.name)}</b> bắt đầu lúc 0h đêm nay!\n${escapeHtml(event.note)}\n${site}/lich-sale`);
    }
    await db.update(subscriptions).set({ lastSaleReminderKey: event.key }).where(eq(subscriptions.userId, s.userId));
  }
  return subs.length;
}

/** Nhận lệnh /start <mã> từ bot để liên kết Telegram với tài khoản (long polling, không cần webhook) */
let tgOffset = 0;
export async function pollTelegram(): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 0;
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${tgOffset}&allowed_updates=["message"]`).catch(() => null);
  if (!res?.ok) return 0;
  const json = (await res.json()) as { result: { update_id: number; message?: { chat: { id: number }; text?: string } }[] };
  let linked = 0;
  for (const u of json.result) {
    tgOffset = u.update_id + 1;
    const chatId = u.message?.chat.id;
    const text = u.message?.text?.trim() ?? "";
    if (!chatId) continue;
    const m = text.match(/^\/start\s+([\w-]{8,})$/);
    if (m) {
      const rows = await db
        .update(subscriptions)
        .set({ telegramChatId: String(chatId), telegramLinkCode: null, telegramDigest: true, updatedAt: new Date() })
        .where(eq(subscriptions.telegramLinkCode, m[1]))
        .returning({ userId: subscriptions.userId });
      await sendTelegram(
        String(chatId),
        rows.length
          ? "Đã kết nối Săn Deal! Bạn sẽ nhận deal theo sở thích và nhắc sale tại đây. Gõ /stop để ngừng."
          : "Mã kết nối không đúng hoặc đã hết hạn. Hãy bấm lại nút “Kết nối Telegram” trên web.",
      );
      linked += rows.length;
    } else if (text === "/stop") {
      await db
        .update(subscriptions)
        .set({ telegramChatId: null, telegramDigest: false })
        .where(eq(subscriptions.telegramChatId, String(chatId)));
      await sendTelegram(String(chatId), "Đã ngừng gửi tin. Bạn có thể kết nối lại trên web bất cứ lúc nào.");
    }
  }
  return linked;
}
