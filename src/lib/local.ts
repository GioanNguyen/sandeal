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
