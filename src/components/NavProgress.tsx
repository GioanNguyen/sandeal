"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thanh tiến trình trên cùng màn hình khi chuyển trang (bấm link nội bộ hoặc gửi form lọc/tìm kiếm).
 * Hiện ngay khi bấm, chạy chậm dần tới ~90%, hoàn tất khi trang mới đã hiển thị.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = () => {
    clearInterval(timer.current);
    clearTimeout(safety.current);
    setState("loading");
    setWidth(12);
    document.documentElement.classList.add("is-navigating");
    timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 180);
    // Phòng trường hợp điều hướng bị huỷ (bấm Esc, lỗi mạng…): tự ẩn sau 15 giây
    safety.current = setTimeout(done, 15000);
  };
  const done = () => {
    clearInterval(timer.current);
    clearTimeout(safety.current);
    document.documentElement.classList.remove("is-navigating");
    document.querySelectorAll(".is-opening").forEach((el) => el.classList.remove("is-opening"));
    setWidth(100);
    setState("done");
    setTimeout(() => { setState("idle"); setWidth(0); }, 300);
  };

  // Trang mới đã hiển thị -> hoàn tất. Nếu đang hiện khung chờ (loading.tsx) thì đợi nội dung thật thay thế.
  useEffect(() => {
    if (state !== "loading") return;
    if (!document.querySelector(".page-loading")) return done();
    const mo = new MutationObserver(() => {
      if (!document.querySelector(".page-loading")) {
        mo.disconnect();
        done();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname.startsWith("/go/") || url.pathname.startsWith("/api/")) return; // chuyển sang sàn / gọi API
      if (url.pathname === location.pathname && url.search === location.search) return; // chỉ cuộn tới #neo
      // Thẻ/mục vừa bấm hiện vòng xoay để khách biết đã nhận thao tác
      (a.closest(".deal, .drop-item, .collection, .post, .band, .tool") ?? a).classList.add("is-opening");
      start();
    };
    // Nghe ở pha "capture" để chạy trước next/form (next/form tự chặn submit mặc định để chuyển trang phía client)
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (f.closest("dialog")) return;
      // form GET (lọc, tìm kiếm, kiểm tra giá) hoặc POST chuyển trang (đăng nhập, lưu sở thích)
      const action = f.getAttribute("action");
      if (action === null && f.method.toLowerCase() !== "get") return;
      // form gửi bằng JS (fetch) như Theo dõi giá, Đăng nhập: không chuyển trang -> không bật thanh
      if (f.dataset.noProgress !== undefined) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    // Rời trang hẳn (link ngoài, tải lại) không cần thanh tiến trình
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div className={`nav-progress ${state}`} role="progressbar" aria-label="Đang tải trang" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
      <i style={{ width: `${width}%` }} />
    </div>
  );
}
