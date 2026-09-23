import type { Product } from "@/db/schema";
import { PLATFORMS, vnd } from "./format";
import { slugify } from "./slug";

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** Link sản phẩm kèm nguồn để đo lượt vào từ từng kênh; trang sản phẩm có ảnh xem trước đẹp */
export const shareUrl = (site: string, productId: number, channel: string) =>
  `${site}/product/${productId}?utm_source=${channel}&utm_medium=social`;

/**
 * Nội dung bài đăng (tiếng Việt, số liệu thật). `variant` xoay vòng mẫu câu để các bài không giống hệt nhau.
 * `html` dùng cho Telegram (thẻ <b>), còn lại là chữ thường cho Facebook/Zalo/TikTok.
 */
export function buildCaption(p: Product, link: string, opts: { variant?: number; html?: boolean } = {}) {
  const b = (s: string) => (opts.html ? `<b>${s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</b>` : s);
  const plat = PLATFORMS[p.platform]?.label ?? p.platform;
  const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.price;
  const saving = round1k(usual - p.price);
  const hooks = [
    `Giảm thật ${Math.round(p.realDropPct)}% so với giá thường ngày`,
    `Rẻ hơn thường ngày ${vnd(saving)}`,
    `Đang ở mức giá tốt trong 30 ngày qua`,
  ];
  const hook = hooks[(opts.variant ?? 0) % hooks.length];
  const tags = ["#SănDeal", `#${plat.replace(/\s+/g, "")}`, p.category ? `#${slugify(p.category).replace(/-/g, "")}` : ""].filter(Boolean).join(" ");
  return [
    `${hook}`,
    `${b(p.name)}`,
    `Giá: ${b(vnd(p.price))}${p.originalPrice && p.originalPrice > p.price ? ` (giá niêm yết ${vnd(p.originalPrice)})` : ""} · ${plat}`,
    `Xem lịch sử giá & mua: ${link}`,
    `Giá có thể thay đổi, kiểm tra lại trên sàn trước khi thanh toán.`,
    tags,
  ].join("\n");
}
