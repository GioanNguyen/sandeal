"use client";
import { useEffect } from "react";

/**
 * Menu trên cùng tự thu gọn thành chỉ biểu tượng khi không đủ chỗ cho cả ô tìm kiếm và chữ
 * (vd. tài khoản quản trị có thêm mục "Thống kê", hoặc cửa sổ trình duyệt hẹp / phóng to chữ).
 */
export function HeaderFit() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".main-nav");
    const row = nav?.parentElement;
    const search = row?.querySelector<HTMLElement>(".header-search");
    if (!nav || !row || !search) return;
    const MIN_SEARCH = 240;
    const fit = () => {
      // Trên điện thoại ô tìm kiếm nằm hàng riêng, menu đã là biểu tượng
      if (getComputedStyle(search).order === "3") { nav.classList.remove("is-compact"); return; }
      nav.classList.remove("is-compact");
      const tooTight = search.getBoundingClientRect().width < MIN_SEARCH || row.scrollWidth > row.clientWidth + 1;
      nav.classList.toggle("is-compact", tooTight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);
  return null;
}
