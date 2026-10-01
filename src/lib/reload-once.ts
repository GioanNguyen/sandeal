/**
 * Lỗi tải mã trang (thường ngay sau khi web vừa cập nhật bản mới, hoặc trình duyệt trong app Facebook/Zalo
 * giữ bản cũ): tự tải lại trang 1 lần để lấy bản mới. Trả về true nếu đã cho tải lại.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  const msg = String((error as { message?: string; name?: string })?.name ?? "") + " " + String((error as { message?: string })?.message ?? "");
  if (!/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) return false;
  try {
    const key = "sd-reload-once";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Gửi lỗi về máy chủ (không chặn, không báo lỗi nếu gửi thất bại) */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: `${error.name}: ${error.message}`, digest: error.digest, url: location.href, stack: error.stack });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {}
}
