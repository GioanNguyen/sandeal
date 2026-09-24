/**
 * Ảnh nhỏ cho thẻ sản phẩm: dùng bản thu nhỏ có sẵn trên máy chủ ảnh của sàn (nhẹ hơn nhiều lần ảnh gốc).
 * Không nhận ra dạng link thì trả nguyên link (an toàn).
 */
export function thumbUrl(url: string | null | undefined, size: 300 | 600 = 300): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const h = u.hostname;
    // Shopee: .../file/<mã ảnh>  ->  .../file/<mã ảnh>_tn (bản ~300px)
    if (/(susercontent\.com|cf\.shopee\.vn)$/.test(h) && /\/file\/[\w-]+$/.test(u.pathname)) {
      return size === 300 ? `${u.origin}${u.pathname}_tn` : url;
    }
    // Lazada (alicdn/lazcdn/slatic): thêm hậu tố cỡ ảnh + webp
    if (/(lazcdn\.com|slatic\.net|alicdn\.com)$/.test(h) && /\.(jpe?g|png)$/i.test(u.pathname)) {
      return `${u.origin}${u.pathname}_${size}x${size}q80.jpg_.webp`;
    }
    // Ảnh mẫu khi chạy thử
    if (h === "picsum.photos") return url.replace(/\/\d+\/\d+$/, `/${size}/${size}`);
  } catch {}
  return url;
}

/** Máy chủ ảnh của các sàn – kết nối sẵn để ảnh đầu tiên hiện nhanh hơn */
export const IMAGE_ORIGINS = ["https://down-vn.img.susercontent.com", "https://img.lazcdn.com", "https://vn-live-01.slatic.net"];
