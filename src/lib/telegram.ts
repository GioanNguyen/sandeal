/** Gửi tin Telegram qua Bot API. Trả về true nếu thành công. */
export async function sendTelegram(chatId: string, text: string, photo?: string | null): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const usePhoto = !!photo && photo.startsWith("http") && text.length <= 1000;
  const res = await fetch(`https://api.telegram.org/bot${token}/${usePhoto ? "sendPhoto" : "sendMessage"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      usePhoto
        ? { chat_id: chatId, photo, caption: text, parse_mode: "HTML" }
        : { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
    ),
  }).catch(() => null);
  if (!res?.ok) console.warn(`[telegram] gửi tới ${chatId} lỗi ${res?.status}: ${await res?.text().catch(() => "")}`);
  return !!res?.ok;
}

export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "";
