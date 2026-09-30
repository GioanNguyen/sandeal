import type { Product } from "@/db/schema";
import { PLATFORMS, vnd, soldText } from "./format";
import { productPath, slugify } from "./slug";

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/**
 * Link sản phẩm kèm nguồn để đo lượt vào từ từng kênh; trang sản phẩm có ảnh xem trước đẹp.
 * Dùng đường dẫn có tên (/product/ten-san-pham-47) – trùng canonical, không phải qua chuyển hướng 301.
 */
export const shareUrl = (site: string, p: { id: number; name?: string | null }, channel: string) =>
  `${site}${productPath(p)}?utm_source=${channel}&utm_medium=social`;

/** 329.000 -> "329K", 1.250.000 -> "1,25tr" */
export const priceK = (n: number) =>
  n >= 1_000_000 ? `${(Math.round(n / 10_000) / 100).toString().replace(".", ",")}tr` : `${Math.round(n / 1000)}K`;

export interface CaptionExtras {
  /** Mã giảm giá tốt nhất đang áp được và giá sau mã */
  voucher?: { code: string | null; price: number } | null;
  /** Giá thấp nhất từ khi theo dõi */
  recordLow?: boolean;
  /** Thời điểm lấy giá (mặc định: lúc đăng) */
  at?: Date;
}

/**
 * Nội dung bài đăng kiểu "kênh deal": dòng tiêu đề nổi bật + các dòng có biểu tượng, dễ đọc lướt.
 * Mọi con số là số thật: % giảm = giảm THẬT so với giá thường ngày 30 ngày (không dùng % giảm của shop),
 * giá gạch = giá thường ngày, voucher = mã đang còn hạn áp được cho đơn này.
 * `variant` xoay vòng tiêu đề để các bài không giống hệt nhau. `html` cho Telegram (<b>, <s>, <code>).
 */
export function buildCaption(p: Product, link: string, opts: { variant?: number; html?: boolean } & CaptionExtras = {}) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const b = (s: string) => (opts.html ? `<b>${esc(s)}</b>` : s);
  const strike = (s: string) => (opts.html ? `<s>${esc(s)}</s>` : s);
  const code = (s: string) => (opts.html ? `<code>${esc(s)}</code>` : s);
  const plat = PLATFORMS[p.platform]?.label ?? p.platform;
  const PLAT = plat.toUpperCase();
  const drop = Math.round(p.realDropPct);
  const usual = p.realDropPct >= 1 ? round1k(p.price / (1 - p.realDropPct / 100)) : null;
  const saving = usual ? usual - round1k(p.price) : 0;

  const headers = opts.recordLow
    ? [`🏆 GIÁ THẤP KỶ LỤC · ${PLAT}`]
    : drop >= 30
      ? [`🔥 DEAL SỐC ${PLAT}`, `⚡ GIẢM SÂU TRÊN ${PLAT}`, `🔥 DEAL HOT ${PLAT}`]
      : [`🔥 DEAL HOT ${PLAT}`, `✨ GIÁ ĐẸP HÔM NAY · ${PLAT}`, `🛒 SĂN NGAY TRÊN ${PLAT}`];
  const header = headers[(opts.variant ?? 0) % headers.length];

  const name = p.name.replace(/\s+/g, " ").trim();
  const at = (opts.at ?? new Date()).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const social = [p.rating ? `⭐ ${p.rating.toFixed(1)}` : "", p.sold ? `🛒 ${soldText(p.sold)} đã bán` : ""].filter(Boolean).join(" · ");
  const tags = ["#SănDeal", `#${plat.replace(/\s+/g, "")}`, p.category ? `#${slugify(p.category).replace(/-/g, "")}` : ""].filter(Boolean).join(" ");

  return [
    b(header),
    `🛍 ${b(name)}`,
    drop >= 5 ? `📉 Giảm thật ${drop}% so với giá thường ngày${saving >= 1000 ? ` (bớt ${priceK(saving)})` : ""}` : "",
    usual && usual > p.price ? `💰 Giá: ${strike(priceK(usual))} → ${b(priceK(p.price))}` : `💰 Giá: ${b(priceK(p.price))}`,
    opts.voucher && opts.voucher.price < p.price
      ? `🎟 Voucher: ${opts.voucher.code ? `nhập ${code(opts.voucher.code)}` : "dùng mã sàn"} còn ${b(priceK(opts.voucher.price))}`
      : "",
    social,
    `👉 Xem deal: ${link}`,
    `⏱ Giá lúc ${at}, có thể thay đổi – kiểm tra lại trên sàn trước khi thanh toán.`,
    opts.html ? "🔔 Bật thông báo kênh để không lỡ deal mới!" : "",
    tags,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface DigestItem {
  product: Product;
  link: string;
  voucher?: { code: string | null; price: number } | null;
}

/**
 * Bài tổng hợp nhiều deal cho Trang Facebook (1 bài / lượt thay vì 1 bài / sản phẩm).
 * Giá là giá thật lúc lấy; chỉ ghi "giảm thật" khi thấp hơn giá thường ngày 30 ngày từ 5% trở lên.
 */
export function buildDigestCaption(items: DigestItem[], opts: { pageName?: string; at?: Date } = {}) {
  const page = opts.pageName || "Săn Deal";
  const oldest = items.reduce<Date | undefined>((m, it) => {
    const t = it.product.lastSeenAt;
    return t && (!m || t < m) ? t : m;
  }, undefined);
  // "11:00 27/09" theo giờ Việt Nam
  const vn = new Date((opts.at ?? oldest ?? new Date()).getTime() + 7 * 3_600_000).toISOString();
  const at = `${vn.slice(11, 16)} ${vn.slice(8, 10)}/${vn.slice(5, 7)}`;
  const blocks = items.map(({ product: p, link, voucher }) => {
    const name = p.name.replace(/\s+/g, " ").trim();
    const drop = Math.round(p.realDropPct);
    return [
      `🛍️ ${name}`,
      `💰 Giá hiện tại: ${vnd(p.price)}${drop >= 5 ? ` (giảm thật ${drop}% so với giá thường ngày)` : ""}`,
      voucher && voucher.price < p.price ? `🎟 ${voucher.code ? `Nhập mã ${voucher.code}` : "Dùng mã sàn"} còn ${vnd(voucher.price)}` : "",
      `🔗 ${link}`,
    ].filter(Boolean).join("\n");
  });
  return [
    "🔥 DEAL ĐÁNG CHÚ Ý HÔM NAY",
    `Hôm nay, ${page} giới thiệu một số sản phẩm đang có chương trình ưu đãi:`,
    ...blocks,
    `⏱ Giá cập nhật lúc ${at}. Ưu đãi có thể thay đổi tùy thời điểm. Bạn hãy kiểm tra giá cuối cùng trước khi đặt hàng nhé!`,
    "#SănDeal #DealHômNay",
  ].join("\n\n");
}
