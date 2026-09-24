/**
 * - Nhắc từng món khi đợt sale lớn bắt đầu (kèm giá mới của chính món đó).
 * - Mail tóm tắt cuối tuần: các món đã lưu giảm bao nhiêu trong 7 ngày qua.
 */
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { pricePoints, products, saleAlerts, subscriptions, users, watches } from "@/db/schema";
import { signedFor } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { PLATFORMS, vnd } from "@/lib/format";
import { thumbUrl } from "@/lib/images";
import { button, escapeHtml, layout, sendMail, siteUrl } from "@/lib/mail";
import { sendPush } from "@/lib/push";
import { upcomingSales, vnParts, type SaleEvent } from "@/lib/sales";
import { productPath } from "@/lib/slug";
import { sendTelegram } from "@/lib/telegram";

const DAY = 86_400_000;
const shortSale = (name: string) => name.replace(/ – .*/, "");

/* ---------- Nhắc khi sale bắt đầu ---------- */

/** Đợt sale lớn gần nhất (bỏ sale giữa tháng/ngày lương); `live` = đang diễn ra */
export function targetSale(now = new Date()): (SaleEvent & { live: boolean; days: number }) | null {
  const e = upcomingSales(now, 8).find((x) => x.kind !== "payday");
  if (!e) return null;
  const live = e.start <= now && now <= e.end;
  return { ...e, live, days: live ? 0 : Math.ceil((e.start.getTime() - now.getTime()) / DAY) };
}

export async function setSaleAlert(userId: number, productId: number, on: boolean, now = new Date()) {
  await ensureMigrated();
  const sale = targetSale(now);
  if (!sale || sale.live) return { ok: false as const, error: sale?.live ? `${shortSale(sale.name)} đang diễn ra – mua được luôn` : "Chưa có đợt sale lớn sắp tới" };
  const [p] = await db.select({ price: products.price }).from(products).where(eq(products.id, productId)).limit(1);
  if (!p) return { ok: false as const, error: "Không tìm thấy sản phẩm" };
  if (on) {
    await db
      .insert(saleAlerts)
      .values({ userId, productId, saleKey: sale.key, saleName: sale.name, priceAtCreate: p.price, createdAt: now })
      .onConflictDoNothing();
  } else {
    await db.delete(saleAlerts).where(and(eq(saleAlerts.userId, userId), eq(saleAlerts.productId, productId), eq(saleAlerts.saleKey, sale.key)));
  }
  return { ok: true as const, on, sale: { key: sale.key, name: shortSale(sale.name), days: sale.days } };
}

export async function hasSaleAlert(userId: number, productId: number, now = new Date()) {
  const sale = targetSale(now);
  if (!sale) return false;
  const [r] = await db
    .select({ id: saleAlerts.id })
    .from(saleAlerts)
    .where(and(eq(saleAlerts.userId, userId), eq(saleAlerts.productId, productId), eq(saleAlerts.saleKey, sale.key)))
    .limit(1);
  return !!r;
}

type Row = { alertId: number; name: string; id: number; imageUrl: string | null; platform: string; price: number; before: number };

function saleEmail(saleName: string, rows: Row[]) {
  const site = siteUrl();
  const items = rows
    .map((r) => {
      const diff = r.before - r.price;
      return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #f1e3da;width:64px">${r.imageUrl ? `<img src="${escapeHtml(thumbUrl(r.imageUrl) ?? r.imageUrl)}" width="56" height="56" style="border-radius:10px;object-fit:cover" alt="">` : ""}</td>
  <td style="padding:12px 8px;border-bottom:1px solid #f1e3da">
    <a href="${site}${productPath(r)}" style="color:#1c1a19;text-decoration:none;font-weight:600">${escapeHtml(r.name)}</a><br>
    <span style="font-size:13px;color:#5b6170">${PLATFORMS[r.platform]?.label ?? r.platform}${diff >= 1000 ? ` · <b style="color:#047857">rẻ hơn lúc bạn hẹn ${vnd(diff)}</b>` : diff <= -1000 ? " · giá chưa giảm so với lúc bạn hẹn" : ""}</span>
  </td>
  <td style="padding:12px 0;border-bottom:1px solid #f1e3da;text-align:right;white-space:nowrap">
    <b style="color:#d0390f;font-size:16px">${vnd(r.price)}</b><br>
    <a href="${site}/go/${r.id}" style="display:inline-block;margin-top:6px;background:#d0390f;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px">Mua ngay</a>
  </td>
</tr>`;
    })
    .join("");
  return layout(`<p><b>${escapeHtml(saleName)}</b> đã bắt đầu! Đây là giá hiện tại của ${rows.length === 1 ? "món" : `${rows.length} món`} bạn hẹn nhắc:</p>
<table style="width:100%;border-collapse:collapse">${items}</table>
<p style="font-size:13px;color:#5b6170">Giá lấy lúc gửi email, sàn có thể đổi giá bất cứ lúc nào – kiểm tra lại trước khi thanh toán.</p>
<p>${button(`${site}/lich-sale`, "Xem mã giảm giá cho đợt sale")}</p>
<p style="font-size:13px;color:#5b6170">Bạn nhận email này vì đã bấm “Nhắc tôi” trên ${rows.length === 1 ? "sản phẩm này" : "các sản phẩm này"}. Mỗi lời nhắc chỉ gửi một lần.</p>`);
}

/**
 * Gửi nhắc khi đợt sale đã bắt đầu được ≥ 15 phút (để lần đồng bộ giá lúc 0h kịp cập nhật).
 * Mỗi người 1 email + 1 thông báo gộp tất cả món đã hẹn; mỗi lời nhắc chỉ gửi 1 lần.
 */
export async function runSaleStartAlerts(now = new Date()): Promise<number> {
  await ensureMigrated();
  const live = upcomingSales(now, 6).filter((e) => e.start.getTime() + 15 * 60_000 <= now.getTime() && now <= e.end);
  if (!live.length) return 0;
  const keys = live.map((e) => e.key);
  const pending = await db
    .select({ alertId: saleAlerts.id, userId: saleAlerts.userId, saleKey: saleAlerts.saleKey, saleName: saleAlerts.saleName, before: saleAlerts.priceAtCreate, id: products.id, name: products.name, imageUrl: products.imageUrl, platform: products.platform, price: products.price, email: users.email, chat: subscriptions.telegramChatId })
    .from(saleAlerts)
    .innerJoin(products, eq(products.id, saleAlerts.productId))
    .innerJoin(users, eq(users.id, saleAlerts.userId))
    .leftJoin(subscriptions, eq(subscriptions.userId, saleAlerts.userId))
    .where(and(inArray(saleAlerts.saleKey, keys), isNull(saleAlerts.sentAt)));
  const byUser = new Map<string, typeof pending>();
  for (const r of pending) {
    const k = `${r.userId}|${r.saleKey}`;
    (byUser.get(k) ?? byUser.set(k, []).get(k)!).push(r);
  }
  let sent = 0;
  for (const rows of byUser.values()) {
    const { userId, email, chat, saleName } = rows[0];
    const name = shortSale(saleName);
    const first = rows[0];
    await sendMail(email, rows.length === 1 ? `${name} bắt đầu: ${first.name} giờ ${vnd(first.price)}` : `${name} bắt đầu: giá mới của ${rows.length} món bạn chờ`, saleEmail(name, rows));
    await sendPush(userId, {
      title: `${name} đã bắt đầu!`,
      body: rows.length === 1 ? `${first.name} giờ còn ${vnd(first.price)}` : rows.slice(0, 2).map((r) => `${r.name} ${vnd(r.price)}`).join(" · ") + (rows.length > 2 ? ` và ${rows.length - 2} món nữa` : ""),
      url: rows.length === 1 ? productPath(first) : "/da-luu",
      image: first.imageUrl,
      tag: `sale-start-${first.saleKey}`,
    });
    if (chat) {
      const site = siteUrl();
      await sendTelegram(chat, [`<b>${escapeHtml(name)} đã bắt đầu!</b>`, ...rows.map((r) => `• <a href="${site}/go/${r.id}">${escapeHtml(r.name)}</a>: <b>${vnd(r.price)}</b>`)].join("\n"));
    }
    await db.update(saleAlerts).set({ sentAt: now }).where(inArray(saleAlerts.id, rows.map((r) => r.alertId)));
    sent++;
  }
  return sent;
}

/* ---------- Mail tóm tắt cuối tuần ---------- */

export interface WeeklyItem { id: number; name: string; imageUrl: string | null; platform: string; before: number; price: number }

/** Các món đã lưu của 1 người đã giảm ≥ 1.000đ so với giá 7 ngày trước (giá có hiệu lực lúc đó) */
export async function weeklyDrops(userId: number, now = new Date()): Promise<{ drops: WeeklyItem[]; total: number; watched: number }> {
  const since = new Date(now.getTime() - 7 * DAY);
  const rows = await db
    .select({ id: products.id, name: products.name, imageUrl: products.imageUrl, platform: products.platform, price: products.price })
    .from(watches)
    .innerJoin(products, eq(products.id, watches.productId))
    .where(eq(watches.userId, userId));
  if (!rows.length) return { drops: [], total: 0, watched: 0 };
  const drops: WeeklyItem[] = [];
  for (const r of rows) {
    const [old] = await db
      .select({ price: pricePoints.price })
      .from(pricePoints)
      .where(and(eq(pricePoints.productId, r.id), lte(pricePoints.capturedAt, since)))
      .orderBy(desc(pricePoints.capturedAt))
      .limit(1);
    if (old && old.price - r.price >= 1000) drops.push({ ...r, before: old.price });
  }
  drops.sort((a, b) => b.before - b.price - (a.before - a.price));
  return { drops, total: drops.reduce((s, d) => s + d.before - d.price, 0), watched: rows.length };
}

function weeklyEmail(userId: number, drops: WeeklyItem[], total: number, watched: number) {
  const site = siteUrl();
  const items = drops
    .map(
      (d) => `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #f1e3da;width:64px">${d.imageUrl ? `<img src="${escapeHtml(thumbUrl(d.imageUrl) ?? d.imageUrl)}" width="56" height="56" style="border-radius:10px;object-fit:cover" alt="">` : ""}</td>
  <td style="padding:12px 8px;border-bottom:1px solid #f1e3da">
    <a href="${site}${productPath(d)}" style="color:#1c1a19;text-decoration:none;font-weight:600">${escapeHtml(d.name)}</a><br>
    <span style="font-size:13px;color:#5b6170"><s>${vnd(d.before)}</s> → <b style="color:#d0390f">${vnd(d.price)}</b> · <b style="color:#047857">−${vnd(d.before - d.price)}</b></span>
  </td>
  <td style="padding:12px 0;border-bottom:1px solid #f1e3da;text-align:right">
    <a href="${site}/go/${d.id}" style="display:inline-block;background:#d0390f;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px;white-space:nowrap">Mua ngay</a>
  </td>
</tr>`,
    )
    .join("");
  const rest = watched - drops.length;
  return layout(`<p style="font-size:18px;margin:0 0 4px"><b>${drops.length} món bạn lưu đã giảm tổng ${vnd(total)}</b></p>
<p style="margin:0 0 12px;color:#5b6170">So với giá cách đây 7 ngày.</p>
<table style="width:100%;border-collapse:collapse">${items}</table>
${rest > 0 ? `<p style="font-size:13px;color:#5b6170">${rest} món còn lại chưa giảm – chúng tôi vẫn đang theo dõi giúp bạn.</p>` : ""}
<p>${button(`${site}/da-luu`, "Xem tất cả món đã lưu")}</p>
<p style="font-size:13px"><a href="${site}/unsubscribe?t=weekly&u=${userId}&s=${signedFor("weekly", userId)}" style="color:#5b6170">Tắt mail tóm tắt cuối tuần</a></p>`);
}

/** Gửi tóm tắt vào WEEKLY_DAY (0 = Chủ nhật) từ WEEKLY_HOUR giờ VN; mỗi người tối đa 1 lần/tuần; không giảm gì thì không gửi */
export async function runWeeklySummary(now = new Date()): Promise<number> {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  if (vn.getUTCDay() !== Number(process.env.WEEKLY_DAY ?? 0) || vnParts(now).h < Number(process.env.WEEKLY_HOUR ?? 19)) return 0;
  await ensureMigrated();
  const people = await db
    .selectDistinct({ userId: watches.userId, email: users.email, weekly: subscriptions.weeklySummary, last: subscriptions.lastWeeklyAt, chat: subscriptions.telegramChatId })
    .from(watches)
    .innerJoin(users, eq(users.id, watches.userId))
    .leftJoin(subscriptions, eq(subscriptions.userId, watches.userId));
  let sent = 0;
  for (const u of people) {
    if (u.weekly === false) continue;
    if (u.last && now.getTime() - u.last.getTime() < 6 * DAY) continue;
    const { drops, total, watched } = await weeklyDrops(u.userId, now);
    if (drops.length) {
      await sendMail(u.email, `${drops.length} món bạn lưu đã giảm tổng ${vnd(total)} tuần này`, weeklyEmail(u.userId, drops, total, watched));
      await sendPush(u.userId, { title: `${drops.length} món bạn lưu đã giảm tổng ${vnd(total)}`, body: drops.slice(0, 2).map((d) => `${d.name} −${vnd(d.before - d.price)}`).join(" · "), url: "/da-luu", tag: "weekly" });
      if (u.chat) await sendTelegram(u.chat, [`<b>${drops.length} món bạn lưu đã giảm tổng ${vnd(total)} tuần này</b>`, ...drops.slice(0, 8).map((d) => `• <a href="${siteUrl()}/go/${d.id}">${escapeHtml(d.name)}</a>: ${vnd(d.before)} → <b>${vnd(d.price)}</b>`)].join("\n"));
      sent++;
    }
    // Ghi mốc cả khi không có gì giảm để không kiểm tra lại mỗi giờ
    await db.insert(subscriptions).values({ userId: u.userId, lastWeeklyAt: now }).onConflictDoUpdate({ target: subscriptions.userId, set: { lastWeeklyAt: now } });
  }
  return sent;
}

