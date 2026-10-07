import type { Platform } from "@/adapters/types";

export interface ProductRef {
  platform: Platform;
  externalId: string;
  shopId?: string;
  url: string;
  /** Tên đoán từ đường dẫn đầy đủ (vd "Quat-tich-dien-mini-i.1.2" -> "Quat tich dien mini"), không có thì bỏ trống */
  nameHint?: string;
}

/** Lấy phần chữ (tên sản phẩm) trong đường dẫn Shopee / Lazada */
export function nameHintFromPath(path: string): string | undefined {
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  const m = seg.match(/^(.+?)-i\.?\d+/);
  if (!m) return undefined;
  const words = m[1].replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
  return words.length >= 6 && /\p{L}{2,}/u.test(words) ? words.slice(0, 140) : undefined;
}

/** Tên miền rút gọn được phép mở để lấy link đầy đủ (chống SSRF: chỉ các host này) */
const SHORT_HOSTS = ["s.shopee.vn", "shope.ee", "vn.shp.ee", "shp.ee", "s.lazada.vn", "c.lazada.vn", "vt.tiktok.com", "vm.tiktok.com"];

const hostOf = (u: URL) => u.hostname.replace(/^www\./, "").toLowerCase();

const hint = (path: string) => {
  const h = nameHintFromPath(path);
  return h ? { nameHint: h } : {};
};

/** Tách platform + mã sản phẩm từ link đầy đủ. Trả về null nếu không nhận ra. */
export function parseProductUrl(raw: string): ProductRef | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = hostOf(u);
  const path = decodeURIComponent(u.pathname);

  if (host.endsWith("shopee.vn")) {
    // https://shopee.vn/Ten-san-pham-i.123456.7890123   |  https://shopee.vn/product/123456/7890123
    const m = path.match(/-i\.(\d+)\.(\d+)/) ?? path.match(/\/product\/(\d+)\/(\d+)/) ?? path.match(/\/[^/]+\/(\d+)\/(\d+)\/?$/);
    if (m) return { platform: "shopee", shopId: m[1], externalId: m[2], url: `https://shopee.vn/product/${m[1]}/${m[2]}`, ...hint(path) };
  }
  if (host.endsWith("lazada.vn")) {
    // https://www.lazada.vn/products/ten-san-pham-i123456789-s987654321.html
    const m = path.match(/-i(\d+)(?:-s\d+)?\.html/) ?? path.match(/\/products\/i(\d+)/);
    if (m) return { platform: "lazada", externalId: m[1], url: `https://www.lazada.vn/products/i${m[1]}.html`, ...hint(path) };
  }
  if (host.endsWith("tiktok.com")) {
    // https://shop.tiktok.com/view/product/1729384756?...  |  https://www.tiktok.com/view/product/1729...
    const m = path.match(/\/product\/(\d{6,})/) ?? path.match(/\/pdp\/[^/]*\/(\d{6,})/);
    if (m) return { platform: "tiktok", externalId: m[1], url: `https://shop.tiktok.com/view/product/${m[1]}` };
  }
  return null;
}

export function isShortLink(raw: string) {
  try {
    return SHORT_HOSTS.includes(hostOf(new URL(raw.trim())));
  } catch {
    return false;
  }
}

/** Mở link rút gọn (tối đa 5 lần chuyển hướng, chỉ các host cho phép) để lấy link đầy đủ */
export async function resolveShortLink(raw: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let url = raw.trim();
  for (let hop = 0; hop < 5; hop++) {
    if (parseProductUrl(url)) return url;
    if (!isShortLink(url)) return null;
    const res = await fetchImpl(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(6000) });
    const loc = res.headers.get("location");
    if (!loc) return null;
    url = new URL(loc, url).toString();
  }
  return parseProductUrl(url) ? url : null;
}

/** Nhận link bất kỳ (đầy đủ hoặc rút gọn) và trả về ProductRef */
export async function refFromInput(input: string, fetchImpl: typeof fetch = fetch): Promise<ProductRef | null> {
  const direct = parseProductUrl(input);
  if (direct) return direct;
  if (!isShortLink(input)) return null;
  const full = await resolveShortLink(input, fetchImpl).catch(() => null);
  return full ? parseProductUrl(full) : null;
}

/**
 * Link sản phẩm thường trên sàn (KHÔNG qua tiếp thị liên kết) – dùng trong trang quản trị để kiểm tra món
 * mà không tạo lượt bấm affiliate. exact=false: không biết đúng trang sản phẩm (Shopee thiếu mã shop) nên dẫn tới trang tìm theo tên.
 */
export function plainProductUrl(p: { platform: string; externalId: string; name: string; productUrl?: string | null; affiliateUrl?: string | null }): { url: string; exact: boolean } {
  if (p.productUrl && /^https:\/\//i.test(p.productUrl)) return { url: p.productUrl, exact: true };
  // Link mua đôi khi chính là link sản phẩm dạng đầy đủ (món người dùng dán link, giá từ tiện ích…)
  const fromAff = p.affiliateUrl ? parseProductUrl(p.affiliateUrl) : null;
  if (fromAff && fromAff.platform === p.platform && fromAff.externalId === p.externalId) return { url: fromAff.url, exact: true };
  if (/^\d+$/.test(p.externalId)) {
    if (p.platform === "lazada") return { url: `https://www.lazada.vn/products/i${p.externalId}.html`, exact: true };
    if (p.platform === "tiktok") return { url: `https://shop.tiktok.com/view/product/${p.externalId}`, exact: true };
  }
  const q = encodeURIComponent(p.name.slice(0, 120));
  if (p.platform === "lazada") return { url: `https://www.lazada.vn/catalog/?q=${q}`, exact: false };
  if (p.platform === "tiktok") return { url: `https://www.tiktok.com/search?q=${q}`, exact: false };
  return { url: `https://shopee.vn/search?keyword=${q}`, exact: false };
}
