/**
 * Đoạn script nhỏ chạy trong <head> trước khi vẽ trang (không nháy giao diện):
 * khôi phục kiểu hiển thị Lưới/Danh sách và giao diện Sáng/Tối đã chọn.
 * Để ở file thường (không "use client") vì server cần đọc được chuỗi này.
 */
export const VIEW_KEY = "sd-view";
export const THEME_KEY = "sd-theme";
// Ghép bằng mảng + join (KHÔNG dùng template literal): bộ nén mã SWC của Next 15.5 gộp sai chuỗi
// `...("${VIEW_KEY}")==="list")...` khi build production, làm mất 1 đoạn và gây lỗi cú pháp trên web thật.
export const BOOT_SCRIPT = [
  "try{var d=document.documentElement;",
  "if(localStorage.getItem(" + JSON.stringify(VIEW_KEY) + ')==="list")d.dataset.view="list";',
  "var t=localStorage.getItem(" + JSON.stringify(THEME_KEY) + ');if(t==="light"||t==="dark")d.dataset.theme=t',
  "}catch(e){}",
].join("");
