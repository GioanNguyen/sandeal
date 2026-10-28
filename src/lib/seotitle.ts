/**
 * Tiêu đề trang sản phẩm cho Google (thẻ <title>, khung chia sẻ Facebook).
 * Google chỉ hiện ~60 ký tự đầu: tên sàn đặt rất dài ("Quạt tích điện mini cầm tay 3 tốc độ… [CHÍNH HÃNG]") đẩy mất giá
 * ở cuối – mà giá / mức giảm mới là thứ làm người ta bấm. Nên: tên gọn (~40 ký tự) + giá ngắn + 1 lý do bấm, rồi
 * "Lịch sử giá <sàn>" (từ khoá khách hay tìm). Layout tự thêm " | Săn Deal" ở cuối.
 *   Quạt tích điện mini cầm tay 189K, giảm thật 32% – Lịch sử giá Shopee
 *   Nồi chiên không dầu Lock&Lock 1,2tr: mua hay chờ 11.11? – Lịch sử giá Shopee
 */
import { saleShort } from "./saleforecast";

const MAX_NAME = 40;

/** Giá ngắn kiểu sàn: 9.000 -> 9K · 189.000 -> 189K · 1.250.000 -> 1,25tr · 12.500.000 -> 12,5tr */
export function priceShort(n: number): string {
  const v = Math.round(Number(n) || 0);
  if (v < 1000) return `${v}đ`;
  if (v < 1_000_000) {
    const k = v / 1000;
    return `${k < 10 ? Math.round(k * 10) / 10 : Math.round(k)}K`.replace(".", ",");
  }
  const tr = v / 1_000_000;
  return `${Math.round(tr * 100) / 100}tr`.replace(".", ",");
}

/** Tên gọn: bỏ phần trong ngoặc, sau "|" / " - ", tối đa ~40 ký tự, không cắt giữa chữ */
export function titleName(name: string, max = MAX_NAME): string {
  const base =
    name
      .replace(/[\[(【{].*?[\])】}]/g, " ")
      .split(/\s[|–-]\s|\|/)[0]
      .replace(/[,;:.!\s]+$/, "")
      .replace(/\s+/g, " ")
      .trim() || name.trim();
  if (base.length <= max) return base;
  let out = "";
  for (const w of base.split(" ")) {
    if ((out ? out.length + 1 : 0) + w.length > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return (out || base.slice(0, max)).replace(/[,;:.\-–\s]+$/, "");
}

export interface TitleInput {
  name: string;
  price: number;
  platformLabel: string;
  /** % giảm thật so với giá thường ngày (cột real_drop_pct) */
  realDropPct: number;
  /** Món không còn thấy trên sàn */
  gone: boolean;
  /** Từ buyAdvice: kết luận + đợt sale lớn sắp tới */
  advice?: { verdict: string; trackedDays: number; nextSale: { name: string; days: number } | null } | null;
}

export function productTitle(i: TitleInput): string {
  const name = titleName(i.name);
  const tail = `Lịch sử giá ${i.platformLabel}`;
  if (i.gone) return `${name} – ${tail}, báo khi có lại`;
  const price = priceShort(i.price);
  const drop = Math.round(i.realDropPct);
  // 1 lý do bấm, theo thứ tự mạnh nhất: đang giảm thật -> sắp sale lớn (≤ 21 ngày) -> câu hỏi chung
  const hook =
    drop >= 5
      ? `${price}, giảm thật ${drop}%`
      : i.advice?.nextSale && i.advice.nextSale.days <= 21
        ? `${price}: mua hay chờ ${saleShort(i.advice.nextSale)}?`
        : `${price}, có đang rẻ thật?`;
  return `${name} ${hook} – ${tail}`;
}
