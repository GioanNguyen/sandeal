/**
 * Người đang online: mỗi trình duyệt báo "đang xem trang X" khoảng 30 giây một lần (components/Presence.tsx);
 * quá ONLINE_MS không báo thì coi như đã rời. Giữ trong bộ nhớ (site chạy 1 tiến trình Node) – không ghi CSDL,
 * khởi động lại máy chủ thì danh sách trống tới lượt báo kế tiếp (≤ 30 giây).
 * Chỉ giữ mã khách ẩn danh (cookie sd_vid), đường dẫn, tiêu đề trang, loại thiết bị, nguồn tới. Quản trị viên và bot không tính.
 */
export const ONLINE_MS = 75_000;
const MAX_VISITORS = 5000;

export interface PresenceInfo {
  path: string;
  title: string;
  device: "mobile" | "desktop";
  /** Nguồn tới: google, facebook, zalo… (theo referrer lúc vào site) hoặc "trực tiếp" */
  source: string;
}
interface Entry extends PresenceInfo {
  at: number;
  since: number;
}

const g = globalThis as unknown as { __presence?: Map<string, Entry> };
const live = (g.__presence ??= new Map());

/** Đường dẫn gọn: chỉ đường dẫn trong site (bỏ tên miền, #, tham số theo dõi utm/fbclid), tối đa 200 ký tự */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  let u: URL;
  try {
    u = new URL(raw, "http://x");
  } catch {
    return null;
  }
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|zarsrc|_)/i.test(k)) u.searchParams.delete(k);
  const p = decodeURIComponent(u.pathname) + (u.search ? decodeURIComponent(u.search) : "");
  return p.slice(0, 200);
}

/** Nguồn tới từ referrer (chỉ tên miền, không lưu cả đường dẫn) */
export function sourceOf(referrer: unknown, ownHost?: string): string {
  if (typeof referrer !== "string" || !referrer) return "trực tiếp";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\.|^m\.|^l\./, "");
  } catch {
    return "trực tiếp";
  }
  if (!host || (ownHost && host === ownHost.replace(/^www\./, ""))) return "trực tiếp";
  if (/google\./.test(host)) return "Google";
  if (/bing\.|coccoc\.|duckduckgo\./.test(host)) return "Tìm kiếm khác";
  if (/facebook\.|fb\.|messenger\./.test(host)) return "Facebook";
  if (/zalo\./.test(host)) return "Zalo";
  if (/tiktok\./.test(host)) return "TikTok";
  if (/youtube\.|youtu\.be/.test(host)) return "YouTube";
  if (/t\.me|telegram\./.test(host)) return "Telegram";
  return host.slice(0, 40);
}

export function touchPresence(visitor: string, info: PresenceInfo, now = Date.now()) {
  const prev = live.get(visitor);
  // Giữ nguồn tới của lần vào đầu tiên trong phiên (chuyển trang trong site thì referrer là chính site)
  const source = prev && now - prev.at < ONLINE_MS && info.source === "trực tiếp" ? prev.source : info.source;
  live.delete(visitor); // đưa xuống cuối Map: Map giữ thứ tự chèn -> mục đầu là mục cũ nhất
  live.set(visitor, { ...info, source, title: info.title.slice(0, 120), at: now, since: prev && now - prev.at < ONLINE_MS ? prev.since : now });
  while (live.size > MAX_VISITORS) live.delete(live.keys().next().value!);
}

export function leavePresence(visitor: string) {
  live.delete(visitor);
}

export interface OnlineSummary {
  total: number;
  mobile: number;
  desktop: number;
  pages: { path: string; title: string; n: number }[];
  sources: { source: string; n: number }[];
  at: string;
}

export function onlineNow(now = Date.now()): OnlineSummary {
  const pages = new Map<string, { path: string; title: string; n: number }>();
  const sources = new Map<string, number>();
  let mobile = 0;
  for (const [vid, e] of live) {
    if (now - e.at > ONLINE_MS) {
      live.delete(vid);
      continue;
    }
    if (e.device === "mobile") mobile++;
    const pg = pages.get(e.path) ?? { path: e.path, title: e.title, n: 0 };
    pg.n++;
    if (!pg.title && e.title) pg.title = e.title;
    pages.set(e.path, pg);
    sources.set(e.source, (sources.get(e.source) ?? 0) + 1);
  }
  const total = [...pages.values()].reduce((s, p) => s + p.n, 0);
  return {
    total,
    mobile,
    desktop: total - mobile,
    pages: [...pages.values()].sort((a, b) => b.n - a.n || a.path.localeCompare(b.path)),
    sources: [...sources.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
    at: new Date(now).toISOString(),
  };
}

/** Chỉ dùng cho test */
export const _resetPresence = () => live.clear();
