/**
 * Kênh để người dùng "theo dõi" Săn Deal ngoài web: Trang Facebook, nhóm Facebook, Zalo OA, kênh Telegram.
 * Chỉ hiện kênh đã cấu hình trong .env; đường dẫn không đúng tên miền của nền tảng thì bỏ qua.
 *
 * .env: FB_PAGE_URL (mặc định https://www.facebook.com/<FB_PAGE_ID>) · FB_GROUP_URL · ZALO_OA_ID · TELEGRAM_CHAT_ID dạng @ten_kenh
 */
export type FollowKind = "page" | "group" | "zalo" | "telegram";

export interface FollowLink {
  kind: FollowKind;
  label: string;
  url: string;
}

const okUrl = (raw: string | undefined, hosts: RegExp): string | null => {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && hosts.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
};

const FB_HOST = /^(www\.|m\.|web\.)?(facebook\.com|fb\.com)$/i;

export function followLinks(env: Record<string, string | undefined> = process.env): FollowLink[] {
  const out: FollowLink[] = [];
  const page = okUrl(env.FB_PAGE_URL, FB_HOST) ?? (/^\d{5,}$/.test(env.FB_PAGE_ID?.trim() ?? "") ? `https://www.facebook.com/${env.FB_PAGE_ID!.trim()}` : null);
  if (page) out.push({ kind: "page", label: "Theo dõi Trang Facebook", url: page });
  const group = okUrl(env.FB_GROUP_URL, FB_HOST);
  if (group) out.push({ kind: "group", label: "Vào nhóm săn deal", url: group });
  const zalo = env.ZALO_OA_ID?.trim();
  if (zalo && /^[\w.-]{3,64}$/.test(zalo)) out.push({ kind: "zalo", label: "Quan tâm Zalo OA", url: `https://zalo.me/${zalo}` });
  const tg = env.TELEGRAM_CHAT_ID?.trim();
  if (tg && /^@[A-Za-z][\w]{3,31}$/.test(tg)) out.push({ kind: "telegram", label: "Kênh Telegram", url: `https://t.me/${tg.slice(1)}` });
  return out;
}

/** Link Trang Facebook (để nhắc trong bài đăng, ảnh…); "" nếu chưa cấu hình */
export const fbPageUrl = (env: Record<string, string | undefined> = process.env) => followLinks(env).find((l) => l.kind === "page")?.url ?? "";
