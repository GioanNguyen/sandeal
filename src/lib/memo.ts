/**
 * Bộ nhớ đệm ngắn hạn trong tiến trình web cho dữ liệu dùng chung mọi khách (không phụ thuộc người đang xem):
 * nhiều lượt tải trang trong vài chục giây chỉ chạy truy vấn một lần -> máy chủ trả trang nhanh hơn (TTFB).
 * Lượt gọi trùng lúc đang chạy dùng chung một lần truy vấn. Lỗi không được giữ lại.
 * Tắt khi chạy test (node --test) để test luôn đọc dữ liệu mới.
 */
const g = globalThis as unknown as { __memo?: Map<string, { at: number; p: Promise<unknown> }> };
const store = (g.__memo ??= new Map());
const MAX_KEYS = 500;

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_TEST_CONTEXT || process.env.MEMO_OFF === "1") return fn();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.p as Promise<T>;
  if (store.size >= MAX_KEYS) for (const [k, v] of store) if (now - v.at >= ttlMs || store.size >= MAX_KEYS) store.delete(k);
  const p = fn();
  store.set(key, { at: now, p });
  p.catch(() => store.get(key)?.p === p && store.delete(key));
  return p;
}

/** Xoá đệm (vd. sau khi quản trị sửa dữ liệu trong cùng tiến trình web) */
export function memoClear(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
