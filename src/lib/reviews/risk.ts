/**
 * Cảnh báo rủi ro cho một món: gộp dấu hiệu từ giá/shop (luôn có) với dấu hiệu từ đánh giá (khi đã thu được).
 * Lời lẽ: chỉ nêu dữ liệu quan sát được ("dấu hiệu"), không kết luận shop gian lận.
 */
import type { Flag, Level } from "./analyze";

export interface RiskInput {
  price: number;
  discountPct: number;
  originalPrice?: number | null;
  realDropPct: number;
  rating?: number | null;
  sold?: number | null;
  shopType?: string | null;
  shopRating?: number | null;
  /** Số ngày Săn Deal đã theo dõi giá */
  trackedDays: number;
  /** Giá bị đẩy lên trong 14 ngày rồi "giảm" về mức cũ (từ computeDealScore) */
  inflatedBeforeSale: boolean;
  /** Giá rẻ nhất của cùng sản phẩm ở shop Mall/chính hãng (bất kỳ sàn nào), nếu có */
  mallPrice?: number | null;
  /** Tổng số lượt đánh giá sàn hiển thị (nếu tiện ích đọc được) */
  ratingCount?: number | null;
  /** Số lượt theo sao [1★..5★] sàn hiển thị */
  starCounts?: number[] | null;
}

export interface Risk {
  level: Level | "none";
  flags: Flag[];
}

const ORDER: Record<Level, number> = { high: 3, medium: 2, low: 1 };

export function productFlags(i: RiskInput): Flag[] {
  const flags: Flag[] = [];
  if (i.inflatedBeforeSale) {
    flags.push({ key: "inflated", level: "medium", title: "Giá bị nâng lên trước khi giảm", detail: "Trong 14 ngày qua giá từng bị đẩy lên rồi mới \"giảm\" về gần mức cũ, nên mức giảm hiển thị không phản ánh giá thật." });
  }
  if (i.trackedDays >= 14 && i.discountPct >= 40 && i.realDropPct < 5) {
    flags.push({ key: "fakeDiscount", level: "medium", title: `Sàn ghi giảm ${Math.round(i.discountPct)}% nhưng giá gần như không đổi`, detail: `So với giá ${i.trackedDays >= 30 ? "30" : i.trackedDays} ngày Săn Deal theo dõi, món này rẻ hơn chưa tới 5%. Giá gạch ngang là do shop tự khai.` });
  }
  if (i.mallPrice && i.shopType !== "mall" && i.price < i.mallPrice * 0.55) {
    flags.push({ key: "tooCheap", level: "high", title: "Rẻ bất thường so với shop chính hãng", detail: `Rẻ hơn ${Math.round((1 - i.price / i.mallPrice) * 100)}% so với cùng sản phẩm ở shop Mall. Hãy kiểm tra kỹ tem, nguồn gốc và chính sách đổi trả.` });
  }
  if (i.shopRating != null && i.shopRating > 0 && i.shopRating < 4.5 && i.shopType !== "mall") {
    flags.push({ key: "shopRating", level: i.shopRating < 4 ? "medium" : "low", title: `Shop có điểm đánh giá thấp (${i.shopRating.toFixed(1)}/5)`, detail: "Điểm của shop thấp hơn mặt bằng chung trên sàn (thường từ 4,7 trở lên)." });
  }
  // Tỉ lệ 1–2★ trên toàn bộ đánh giá của sàn (thường chỉ 2–5%)
  const total = i.starCounts?.reduce((a, b) => a + b, 0) ?? 0;
  if (i.starCounts && total >= 30) {
    const low = Math.round(((i.starCounts[0] + i.starCounts[1]) / total) * 100);
    if (low >= 12) {
      flags.push({ key: "lowStars", level: low >= 25 ? "high" : "medium", title: `${low}% đánh giá trên sàn là 1–2 sao`, detail: `Trong ${total.toLocaleString("vi-VN")} lượt đánh giá, tỉ lệ 1–2★ cao hơn nhiều so với mức thường gặp (2–5%).` });
    }
  }
  const sold = i.sold ?? 0;
  if (i.rating && i.rating >= 4.8 && (i.ratingCount != null ? i.ratingCount < 15 : sold < 30)) {
    flags.push({ key: "fewRatings", level: "low", title: "Điểm sao cao nhưng còn ít người mua", detail: `${i.ratingCount != null ? `Mới có ${i.ratingCount} lượt đánh giá` : `Mới bán ${sold}`}, chưa đủ để tin hẳn vào điểm ${i.rating.toFixed(1)}★.` });
  }
  return flags;
}

export function combineRisk(...lists: Flag[][]): Risk {
  const seen = new Set<string>();
  const flags = lists
    .flat()
    .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
    .sort((a, b) => ORDER[b.level] - ORDER[a.level]);
  const top = flags[0]?.level;
  // Hai dấu hiệu "vừa" cùng lúc coi như rủi ro cao
  const level: Risk["level"] = !top ? "none" : top === "medium" && flags.filter((f) => f.level === "medium").length >= 2 ? "high" : top;
  return { level, flags };
}

export const RISK_LABEL: Record<Risk["level"], string> = {
  high: "Rủi ro cao",
  medium: "Cần cân nhắc",
  low: "Lưu ý nhỏ",
  none: "Chưa thấy dấu hiệu rủi ro",
};
