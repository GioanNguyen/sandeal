import Link from "next/link";
// JSX chạy cả ngoài Next (kiểm thử bằng tsx): cần React trong phạm vi
import React from "react";

/**
 * Nội dung bài hướng dẫn do AI soạn: lưu dạng khối (không lưu HTML) rồi site tự dựng thành trang.
 * Chỉ cho **đậm** và [chữ](/đường-dẫn) tới các trang có thật của Săn Deal – AI không chèn được mã hay link ra ngoài.
 */
export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "tip"; text: string };

/** Các trang được phép dẫn link trong bài, kèm mô tả đúng chức năng (đưa cho AI để không viết sai tính năng) */
export const SITE_FEATURES: { path: string; name: string; what: string }[] = [
  { path: "/kiem-tra-gia", name: "Kiểm tra giá", what: "dán link sản phẩm Shopee/Lazada/TikTok Shop để xem lịch sử giá 90 ngày, mức giảm thật và kết luận nên mua ngay hay chờ" },
  { path: "/tien-ich", name: "Tiện ích Chrome Săn Deal", what: "hiện biểu đồ giá ngay trên trang sản phẩm của sàn; ghi nhận giá từng phân loại (màu, size) khi người dùng chọn" },
  { path: "/tim-bang-anh", name: "Tìm bằng ảnh", what: "tải ảnh lên để tìm món giống nhất kèm giá" },
  { path: "/tinh-gia", name: "Máy tính giá cuối cùng", what: "cộng trừ mã của shop, mã của sàn, phí vận chuyển để ra giá phải trả" },
  { path: "/vouchers", name: "Mã giảm giá", what: "danh sách mã còn hạn của 3 sàn, sắp theo giờ hết hạn" },
  { path: "/lich-sale", name: "Lịch sale", what: "ngày giờ các đợt sale sắp tới, có đếm ngược" },
  { path: "/nang-gia", name: "Ai đang nâng giá trước sale?", what: "danh sách món đang đắt hơn giá thường ngày của chính chúng trước đợt sale" },
  { path: "/giam-gia-ao", name: "Giảm giá ảo", what: "danh sách món ghi giảm sâu (giá gạch cao) nhưng giá hiện tại gần như bằng giá thường ngày" },
  { path: "/so-sanh", name: "So sánh giá", what: "cùng sản phẩm ở các sàn, ghép tự động theo tên, xếp theo chênh lệch" },
  { path: "/shop", name: "Shop", what: "mỗi shop có bao nhiêu món giảm thật, bao nhiêu món ghi % giảm cao hơn thực tế" },
  { path: "/gia", name: "Giá hôm nay", what: "bảng giá rẻ nhất theo loại sản phẩm trên 3 sàn" },
  { path: "/deal-hom-nay", name: "Deal hôm nay", what: "các món giảm thật trong ngày" },
  { path: "/bao-cao-gia", name: "Báo cáo giá hằng tuần", what: "món giảm thật, món tăng giá trong tuần" },
  { path: "/da-luu", name: "Đã lưu", what: "danh sách món đã bấm ♡, có nút tạo link chia sẻ danh sách" },
  { path: "/bo-suu-tap", name: "Bộ sưu tập", what: "deal theo chủ đề như quà tặng, công nghệ, làm đẹp" },
  { path: "/huong-dan", name: "Hướng dẫn", what: "các bài hướng dẫn mua sắm" },
];
export const ALLOWED_PATHS = SITE_FEATURES.map((f) => f.path);
export const isAllowedPath = (p: string) => ALLOWED_PATHS.some((a) => p === a || p.startsWith(`${a}/`));

const LIMITS = { text: 700, item: 300, items: 8, blocks: 32 };
const plain = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[<>{}]/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "";
/** Bỏ link không được phép (giữ lại chữ) */
const safeLinks = (s: string) => s.replace(/\[([^\]]{1,80})\]\(([^)\s]*)\)/g, (m, t: string, href: string) => (isAllowedPath(href) ? `[${t}](${href})` : t));

/** Kiểm tra và làm sạch khối nội dung AI trả về; null nếu không dùng được */
export function cleanBlocks(raw: unknown): GuideBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GuideBlock[] = [];
  for (const b of raw.slice(0, LIMITS.blocks)) {
    const t = (b as { type?: unknown })?.type;
    if (t === "p" || t === "tip" || t === "h2") {
      const text = safeLinks(plain((b as { text?: unknown }).text, t === "h2" ? 120 : LIMITS.text));
      if (text.length >= 2) out.push({ type: t, text });
    } else if (t === "ul" || t === "ol") {
      const items = ((b as { items?: unknown }).items as unknown[] | undefined ?? []).map((x) => safeLinks(plain(x, LIMITS.item))).filter((x) => x.length >= 2).slice(0, LIMITS.items);
      if (items.length) out.push({ type: t, items });
    }
  }
  const words = out.reduce((n, b) => n + ("text" in b ? b.text : b.items.join(" ")).split(/\s+/).length, 0);
  if (out.length < 5 || words < 250 || !out.some((b) => b.type === "h2")) return null;
  return out;
}

/** Chữ thường + **đậm** + [link nội bộ](/đường-dẫn) */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<b key={i++}>{m[1]}</b>);
    else if (isAllowedPath(m[3])) parts.push(<Link key={i++} href={m[3]}>{m[2]}</Link>);
    else parts.push(m[2]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function GuideBody({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return <h2 key={i}>{b.text}</h2>;
          case "tip":
            return <div key={i} className="tip"><Inline text={b.text} /></div>;
          case "ul":
            return <ul key={i}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ul>;
          case "ol":
            return <ol key={i}>{b.items.map((x, j) => <li key={j}><Inline text={x} /></li>)}</ol>;
          default:
            return <p key={i}><Inline text={b.text} /></p>;
        }
      })}
    </>
  );
}
