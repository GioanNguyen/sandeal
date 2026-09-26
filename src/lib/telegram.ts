/** Gửi tin Telegram qua Bot API. Trả về true nếu thành công. */
/** `button`: nút bấm dưới tin (vd "Xem deal") – nổi bật hơn link trong chữ */
export async function sendTelegram(chatId: string, text: string, photo?: string | null, button?: { text: string; url: string }): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const usePhoto = !!photo && photo.startsWith("http") && text.length <= 1000;
  const markup = button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {};
  const res = await fetch(`https://api.telegram.org/bot${token}/${usePhoto ? "sendPhoto" : "sendMessage"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      usePhoto
        ? { chat_id: chatId, photo, caption: text, parse_mode: "HTML", ...markup }
        : { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...markup },
    ),
  }).catch(() => null);
  if (!res?.ok) console.warn(`[telegram] gửi tới ${chatId} lỗi ${res?.status}: ${await res?.text().catch(() => "")}`);
  return !!res?.ok;
}

export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "";
