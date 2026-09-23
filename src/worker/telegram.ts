import { and, desc, gte, isNull, lt, or } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "@/lib/db";
import { PLATFORMS, vnd } from "@/lib/format";
import { escapeHtml, siteUrl } from "@/lib/mail";

/**
 * Đăng deal hot lên kênh/nhóm Telegram.
 * Cần TELEGRAM_BOT_TOKEN (tạo bằng @BotFather) và TELEGRAM_CHAT_ID (vd: @ten_kenh), bot phải là admin kênh.
 */
export async function postHotDealsToTelegram(now = new Date()): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return 0;
  const minScore = Number(process.env.TELEGRAM_MIN_SCORE ?? 70);
  const perRun = Number(process.env.TELEGRAM_PER_RUN ?? 3);

  const deals = await db
    .select()
    .from(products)
    .where(
      and(
        gte(products.dealScore, minScore),
        gte(products.realDropPct, 10),
        gte(products.lastSeenAt, new Date(now.getTime() - 86_400_000)),
        or(isNull(products.telegramPostedAt), lt(products.telegramPostedAt, new Date(now.getTime() - 7 * 86_400_000))),
      ),
    )
    .orderBy(desc(products.dealScore))
    .limit(perRun);

  let sent = 0;
  for (const p of deals) {
    const caption = [
      `🔥 <b>${escapeHtml(p.name)}</b>`,
      `${PLATFORMS[p.platform]?.label ?? p.platform} · <b>${vnd(p.price)}</b>${p.originalPrice ? ` <s>${vnd(p.originalPrice)}</s>` : ""}`,
      `Giảm thật ${Math.round(p.realDropPct)}% so với giá 30 ngày · điểm deal ${Math.round(p.dealScore)}`,
      `👉 ${siteUrl()}/go/${p.id}`,
    ].join("\n");
    const hasPhoto = p.imageUrl?.startsWith("http");
    const res = await fetch(`https://api.telegram.org/bot${token}/${hasPhoto ? "sendPhoto" : "sendMessage"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        hasPhoto
          ? { chat_id: chatId, photo: p.imageUrl, caption, parse_mode: "HTML" }
          : { chat_id: chatId, text: caption, parse_mode: "HTML" },
      ),
    });
    if (!res.ok) {
      console.warn(`[telegram] lỗi ${res.status}: ${await res.text()}`);
      continue;
    }
    await db.update(products).set({ telegramPostedAt: now }).where(eq(products.id, p.id));
    sent++;
  }
  return sent;
}
