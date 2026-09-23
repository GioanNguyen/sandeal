import { and, desc, gte, isNull, lt, or } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "@/lib/db";
import { PLATFORMS, vnd } from "@/lib/format";
import { escapeHtml, siteUrl } from "@/lib/mail";
import { sendTelegram } from "@/lib/telegram";

/**
 * Đăng deal hot lên kênh/nhóm Telegram.
 * Cần TELEGRAM_BOT_TOKEN (tạo bằng @BotFather) và TELEGRAM_CHAT_ID (vd: @ten_kenh), bot phải là admin kênh.
 */
export async function postHotDealsToTelegram(now = new Date()): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return 0;
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
    if (!(await sendTelegram(chatId, caption, p.imageUrl))) continue;
    await db.update(products).set({ telegramPostedAt: now }).where(eq(products.id, p.id));
    sent++;
  }
  return sent;
}
