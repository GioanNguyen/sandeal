/**
 * Đoạn script nhỏ chạy trong <head> trước khi vẽ trang (không nháy giao diện):
 * khôi phục kiểu hiển thị Lưới/Danh sách và giao diện Sáng/Tối đã chọn.
 * Để ở file thường (không "use client") vì server cần đọc được chuỗi này.
 */
export const VIEW_KEY = "sd-view";
export const THEME_KEY = "sd-theme";
export const BOOT_SCRIPT =
  `try{var d=document.documentElement;if(localStorage.getItem("${VIEW_KEY}")==="list")d.dataset.view="list";` +
  `var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t}catch(e){}`;
