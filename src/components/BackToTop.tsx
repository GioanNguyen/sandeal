"use client";
import { Icon } from "./Icon";

/**
 * Nút "Lên đầu trang". Không dùng <a href="#top"> vì header đang dính (sticky) ở đỉnh màn hình:
 * trình duyệt coi nó đã nằm trong khung nhìn nên không cuộn.
 */
export function BackToTop() {
  const onClick = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Đưa focus bàn phím về đầu trang (logo) để Tab tiếp tục từ trên xuống
    document.querySelector<HTMLElement>(".site-header .logo")?.focus({ preventScroll: true });
  };
  return (
    <button type="button" className="foot-top" onClick={onClick}>
      <Icon name="arrowRight" size={14} /> Lên đầu trang
    </button>
  );
}
