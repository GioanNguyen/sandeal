/**
 * Kênh khách tới site – để biết đơn hàng (hoa hồng) đến từ Facebook, Google, Zalo… hay khách vào thẳng.
 * Middleware gắn cookie khi khách vào từ nguồn ngoài (utm_source hoặc trang giới thiệu); lượt bấm "Mua" ghi kênh đó.
 * Không chứa thông tin cá nhân: chỉ tên kênh. Dùng được ở Edge (middleware), không import gì của máy chủ.
 */
export const CHANNEL_COOKIE = "sd_ch";
/** Giữ kênh 7 ngày (bằng thời gian sàn ghi nhận đơn sau lượt bấm) */
export const CHANNEL_MAX_AGE = 7 * 86_400;

export const CHANNELS: Record<string, string> = {
  facebook: "Facebook",
  zalo: "Zalo",
  telegram: "Telegram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
  coccoc: "Cốc Cốc",
  email: "Email",
  push: "Thông báo đẩy",
  extension: "Tiện ích trình duyệt",
  share: "Khách chia sẻ link",
  pwa: "Ứng dụng trên màn hình chính",
  other: "Trang khác",
  direct: "Vào thẳng / không rõ",
};

const HOSTS: [RegExp, string][] = [
  [/(^|\.)(mail\.google|outlook\.live|mail\.yahoo)\.com$/, "email"],
  [/(^|\.)(facebook|fb|messenger|instagram)\.(com|me)$/, "facebook"],
  [/(^|\.)zalo\.(me|vn)$/, "zalo"],
  [/(^|\.)(t\.me|telegram\.(org|me))$/, "telegram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)coccoc\.com$/, "coccoc"],
];

const SOURCES: Record<string, string> = {
  facebook: "facebook", fb: "facebook", messenger: "facebook", instagram: "facebook", ig: "facebook",
  zalo: "zalo", telegram: "telegram", tg: "telegram", tiktok: "tiktok",
  google: "google", bing: "bing", coccoc: "coccoc",
  email: "email", mail: "email", newsletter: "email", digest: "email",
  push: "push", webpush: "push", extension: "extension", ext: "extension", share: "share", pwa: "pwa",
};

/**
 * Kênh của 1 lượt vào trang: utm_source trước (link do site tự gắn), rồi fbclid/gclid, rồi trang giới thiệu.
 * null = không phải lượt đến từ ngoài (đi trong site, tải lại trang) -> giữ kênh cũ.
 */
export function detectChannel(url: URL, referer: string | null, ownHost: string): string | null {
  const src = url.searchParams.get("utm_source")?.toLowerCase().trim();
  if (src) return SOURCES[src] ?? "other";
  if (url.searchParams.has("fbclid")) return "facebook";
  if (url.searchParams.has("gclid")) return "google";
  if (!referer) return null;
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host === ownHost || host === `www.${ownHost}` || `www.${host}` === ownHost) return null;
  for (const [re, ch] of HOSTS) if (re.test(host)) return ch;
  return "other";
}

/** Giá trị cookie hợp lệ (cookie có thể bị sửa tay) */
export const cleanChannel = (v: string | undefined | null) => (v && v in CHANNELS ? v : "direct");

export const channelLabel = (c: string | null | undefined) => CHANNELS[c ?? "direct"] ?? c ?? CHANNELS.direct;

/** Đọc kênh từ header Cookie của request (route /go) */
export function channelFromCookie(cookieHeader: string | null): string {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${CHANNEL_COOKIE}=([a-z]+)`));
  return cleanChannel(m?.[1]);
}
