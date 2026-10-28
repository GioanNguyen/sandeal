"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Báo máy chủ "đang xem trang này" khi tab đang mở (lúc vào trang, khi chuyển trang, rồi ~30 giây/lần) và "đã rời"
 * khi ẩn tab / đóng trang – để quản trị viên thấy số người đang online. Gửi bằng sendBeacon, không làm chậm trang.
 */
const BEAT_MS = 30_000;
// Nguồn tới của lần vào site (referrer chỉ đúng ở trang đầu tiên; chuyển trang trong site thì giữ nguyên)
const firstRef = typeof document !== "undefined" ? document.referrer : "";

function send(body: Record<string, unknown>) {
  try {
    const data = JSON.stringify(body);
    if (!navigator.sendBeacon?.("/api/presence", new Blob([data], { type: "application/json" }))) {
      void fetch("/api/presence", { method: "POST", body: data, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    /* bỏ qua: không được làm hỏng trang */
  }
}

export function Presence() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search?.toString();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const path = pathname + (qs ? `?${qs}` : "");
    const beat = () => {
      if (document.visibilityState === "visible") send({ path, title: document.title, ref: firstRef });
    };
    // Chờ một chút để tiêu đề trang mới kịp cập nhật sau khi chuyển trang
    const first = setTimeout(beat, 800);
    const timer = setInterval(beat, BEAT_MS);
    const onVis = () => (document.visibilityState === "visible" ? beat() : send({ leave: true }));
    const onHide = () => send({ leave: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [pathname, qs]);
  return null;
}
