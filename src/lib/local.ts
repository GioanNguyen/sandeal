/** Lưu trữ trên trình duyệt (bọc try/catch: chế độ ẩn danh hoặc bị chặn vẫn chạy bình thường) */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export interface ViewedItem { id: number; price: number; category: string | null; at: number }
export const VIEWED_KEY = "sd-viewed-v1";
export const SAVED_KEY = "sd-saved-v1";

/** Chuyển dữ liệu JSON từ API về lại dạng DealRow (ngày tháng là Date) */
export function reviveDeal<T extends { droppedAt?: unknown; lastSeenAt?: unknown; createdAt?: unknown; telegramPostedAt?: unknown }>(d: T): T {
  const toDate = (x: unknown) => (x ? new Date(x as string) : null);
  return { ...d, droppedAt: toDate(d.droppedAt), lastSeenAt: toDate(d.lastSeenAt), createdAt: toDate(d.createdAt), telegramPostedAt: toDate(d.telegramPostedAt) };
}

/** Giá lúc bấm lưu: { id: { p: giá, at: thời điểm } } */
export const SAVED_PRICE_KEY = "sd-saved-price-v1";
/** Giá lần cuối khách mở trang "Đã lưu" (để chỉ báo giảm MỚI) */
export const SAVED_SEEN_KEY = "sd-saved-seen-v1";
/** Danh mục khách thích (từ chế độ lướt deal): { danh mục: điểm } */
export const LIKES_KEY = "sd-likes-v1";
/** Deal đã lướt qua (để không hiện lại) */
export const SWIPED_KEY = "sd-swiped-v1";
/** Deal bí ẩn: ngày đã lật + chuỗi ngày liên tiếp */
export const MYSTERY_KEY = "sd-mystery-v1";

export type SavedPrices = Record<string, { p: number; at: number }>;

/** Món đã lưu nào đang rẻ hơn mốc (giá lần cuối xem trang Đã lưu, nếu chưa thì giá lúc lưu) ít nhất 1.000đ */
export function savedDrops(ids: number[], current: Record<string, number>, saved: SavedPrices, seen: Record<string, number>) {
  const out: { id: number; from: number; to: number }[] = [];
  for (const id of ids) {
    const cur = current[id];
    const ref = seen[id] ?? saved[id]?.p;
    if (cur != null && ref != null && cur <= ref - 1000) out.push({ id, from: ref, to: cur });
  }
  return out;
}
