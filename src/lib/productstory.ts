/**
 * Nội dung chữ riêng cho từng trang sản phẩm: đoạn nhận xét giá + hỏi đáp + mô tả (meta description),
 * viết từ số liệu thật của chính món đó (lịch sử giá, đợt sale, giá ở sàn khác, vị trí trong danh mục,
 * phân loại, đánh giá). Không có số liệu thì không viết câu đó – không bịa, không câu chung chung lặp lại.
 * Câu mở đầu đổi theo mã sản phẩm để các trang không cùng một khuôn chữ.
 */
import { and, eq, sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { availableSql } from "./availability";
import { db } from "./db";
import type { Advice } from "./advice";

export interface StoryInput {
  id: number;
  name: string;
  platformLabel: string;
  price: number;
  gone: boolean;
  history: { price: number; capturedAt: Date }[];
  advice: Pick<Advice, "verdict" | "title" | "usual" | "low" | "high" | "lowAt" | "cheaperThanPct" | "belowUsualPct" | "trackedDays" | "sales" | "nextSale" | "forecast">;
  /** Cùng sản phẩm ở các sàn (rẻ nhất mỗi sàn), gồm cả món đang xem */
  offers: { platformLabel: string; price: number; current: boolean }[];
  category: CategoryStats | null;
  shop: { name: string | null; mall: boolean; rating: number | null };
  variants: { count: number; min: number; max: number } | null;
  reviews: { count: number; pros: string[]; cons: string[] } | null;
  unitText: string | null;
  /** Giá sau mã giảm tốt nhất (bằng price nếu không có mã) */
  afterCodes: number;
  sold: number | null;
  now: Date;
}

export interface CategoryStats {
  name: string;
  /** Số món cùng danh mục đang bán (gồm món đang xem) */
  count: number;
  /** Giá giữa (trung vị) của danh mục */
  median: number;
  /** % số món cùng danh mục rẻ hơn món này (0–100) */
  cheaperShare: number;
}

export interface Story {
  heading: string;
  paragraphs: string[];
  faqs: { q: string; a: string }[];
  /** Mô tả cho Google (≤ 160 ký tự) */
  meta: string;
}

const DAY = 86_400_000;
const r = Math.round;
/** 129.000 ₫ (giống vnd() nhưng không phụ thuộc Intl để chạy giống nhau ở mọi máy) */
export const money = (n: number) => `${r(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
const ddmm = (d: Date) => {
  const v = new Date(d.getTime() + 7 * 3_600_000);
  return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
};
const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const saleName = (n: string) => n.replace(/ – .*/, "");

/** Tên gọn để đặt vào câu: bỏ phần trong ngoặc/sau dấu "|", tối đa ~7 chữ */
export function shortName(name: string) {
  const base = name.replace(/[\[(【].*?[\])】]/g, " ").split(/[|,–-]\s/)[0].replace(/\s+/g, " ").trim() || name;
  const words = base.split(" ");
  let out = "";
  for (const w of words) {
    if ((out + " " + w).trim().length > 48 || out.split(" ").length >= 7) break;
    out = (out + " " + w).trim();
  }
  return out || base.slice(0, 48);
}

/** Số lần đổi giá (≥ 1%) trong 30 ngày gần nhất */
export function priceChanges(history: { price: number; capturedAt: Date }[], now: Date) {
  const since = now.getTime() - 30 * DAY;
  let n = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].capturedAt.getTime() < since) continue;
    if (Math.abs(history[i].price / history[i - 1].price - 1) >= 0.01) n++;
  }
  return n;
}

export function productStory(i: StoryInput): Story {
  const s = shortName(i.name);
  const a = i.advice;
  const days = Math.max(1, Math.floor(a.trackedDays));
  const enough = a.trackedDays >= 7 && i.history.length > 0;
  const seed = i.id;
  const paragraphs: string[] = [];
  const faqs: Story["faqs"] = [];

  // 1. Giá hiện tại so với lịch sử của chính món này
  const p1: string[] = [];
  if (i.gone) {
    p1.push(`Săn Deal không còn thấy ${s} trên ${i.platformLabel}. Giá ghi nhận lần cuối là ${money(i.price)}.`);
    if (enough) p1.push(`Trong ${days} ngày theo dõi, giá dao động từ ${money(a.low)} đến ${money(a.high)}, phổ biến nhất quanh ${money(a.usual)}.`);
  } else if (!enough) {
    const first = i.history[0]?.capturedAt ?? i.now;
    p1.push(
      pick(
        [
          `Săn Deal bắt đầu theo dõi giá ${s} trên ${i.platformLabel} từ ngày ${ddmm(first)}, nên chưa đủ dữ liệu để biết giá thường ngày.`,
          `${cap(s)} mới được Săn Deal theo dõi ${days} ngày trên ${i.platformLabel}, cần khoảng một tuần để biết mức giá thường ngày.`,
        ],
        seed,
      ),
    );
    p1.push(`Giá ghi nhận hiện tại là ${money(i.price)}.`);
    if (a.high > a.low) p1.push(`Từ lúc theo dõi, giá đã dao động từ ${money(a.low)} đến ${money(a.high)}.`);
  } else {
    const pct = r(Math.abs(a.belowUsualPct));
    const vs =
      a.belowUsualPct >= 3
        ? `thấp hơn ${pct}% so với giá thường ngày ${money(a.usual)}`
        : a.belowUsualPct <= -3
          ? `cao hơn ${pct}% so với giá thường ngày ${money(a.usual)}`
          : `gần như bằng giá thường ngày ${money(a.usual)}`;
    p1.push(
      pick(
        [
          `${cap(s)} đang bán ${money(i.price)} trên ${i.platformLabel}, ${vs} mà Săn Deal ghi nhận trong ${days} ngày qua.`,
          `Theo dữ liệu ${days} ngày của Săn Deal, giá ${s} trên ${i.platformLabel} hôm nay là ${money(i.price)}, ${vs}.`,
          `Hôm nay ${s} có giá ${money(i.price)} trên ${i.platformLabel}. So với ${days} ngày Săn Deal theo dõi, mức này ${vs}.`,
        ],
        seed,
      ),
    );
    if (i.price <= a.low * 1.005) p1.push(`Đây là mức thấp nhất trong toàn bộ thời gian theo dõi; giá cao nhất từng ghi nhận là ${money(a.high)}.`);
    else p1.push(`Mức thấp nhất từng có là ${money(a.low)}${a.lowAt ? ` (ngày ${ddmm(a.lowAt)})` : ""}, cao nhất ${money(a.high)}.`);
    const hi = r(a.cheaperThanPct);
    if (hi >= 60) p1.push(`Tính theo thời gian, giá đã cao hơn mức hôm nay trong khoảng ${hi}% số ngày theo dõi.`);
    else if (hi <= 25 && i.price > a.low * 1.005) p1.push(`Phần lớn thời gian (${100 - hi}% số ngày theo dõi) món này bán bằng hoặc rẻ hơn mức hôm nay.`);
    const ch = priceChanges(i.history, i.now);
    if (ch === 0) p1.push("Giá gần như không đổi trong 30 ngày qua.");
    else if (ch >= 6) p1.push(`Shop đổi giá khá thường xuyên (${ch} lần trong 30 ngày), nên giá có thể khác khi bạn mở trang sàn.`);
    else p1.push(`Giá đã thay đổi ${ch} lần trong 30 ngày qua.`);
  }
  paragraphs.push(p1.join(" "));

  // 2. Các đợt sale đã qua + đợt sắp tới
  const p2: string[] = [];
  const pastSales = a.sales.filter((m) => m.low != null && m.end < i.now).slice(-3);
  if (pastSales.length) {
    p2.push(`Giá thấp nhất ở các đợt sale gần đây: ${pastSales.map((m) => `${m.short} là ${money(m.low!)}`).join(", ")}.`);
    const best = Math.min(...pastSales.map((m) => m.low!));
    if (!i.gone) {
      p2.push(
        best < i.price * 0.97
          ? `Như vậy dịp sale từng rẻ hơn hôm nay khoảng ${money(i.price - best)}.`
          : "Các đợt sale đó không rẻ hơn đáng kể so với giá hôm nay.",
      );
    }
  }
  if (!i.gone && a.nextSale) {
    const n = saleName(a.nextSale.name);
    p2.push(`${n} còn ${a.nextSale.days} ngày.`);
    if (a.forecast && a.forecast.save >= 1000) p2.push(`Dựa trên ${a.forecast.basisText}, giá dịp này có thể về khoảng ${money(a.forecast.expected)} (rẻ hơn hôm nay ${r(a.forecast.pct)}%). Đây là ước tính, không phải giá chắc chắn.`);
    else if (a.forecast) p2.push(`Dựa trên ${a.forecast.basisText}, chưa thấy dấu hiệu món này sẽ rẻ hơn nhiều vào dịp đó.`);
  }
  if (p2.length) paragraphs.push(p2.join(" "));

  // 3. So với sàn khác, danh mục, đơn vị, phân loại
  const p3: string[] = [];
  const others = i.offers.filter((o) => !o.current);
  if (i.offers.length >= 2 && others.length) {
    const cheapest = [...i.offers].sort((x, y) => x.price - y.price)[0];
    const list = i.offers.map((o) => `${o.platformLabel} ${money(o.price)}`).join(", ");
    p3.push(
      cheapest.current
        ? `Cùng sản phẩm đang bán ở ${i.offers.length} sàn (${list}); ${i.platformLabel} hiện rẻ nhất.`
        : `Cùng sản phẩm đang bán ở ${i.offers.length} sàn (${list}); mua ở ${cheapest.platformLabel} rẻ hơn ${money(i.price - cheapest.price)}.`,
    );
  }
  const c = i.category;
  if (c && c.count >= 5 && !i.gone) {
    const pos =
      c.cheaperShare < 0.5
        ? "là món rẻ nhất"
        : c.cheaperShare <= 25 ? `thuộc nhóm rẻ nhất (chỉ ${r(c.cheaperShare)}% số món rẻ hơn)` : c.cheaperShare >= 75 ? `thuộc nhóm giá cao (${r(c.cheaperShare)}% số món rẻ hơn)` : `ở khoảng giữa (${r(c.cheaperShare)}% số món rẻ hơn)`;
    p3.push(`Trong ${c.count} món ${c.name} Săn Deal đang theo dõi, giá này ${pos}; giá giữa của danh mục là ${money(c.median)}.`);
  }
  if (i.unitText) p3.push(`Tính theo đơn vị: ${i.unitText}.`);
  if (i.variants && i.variants.count >= 2) {
    p3.push(
      i.variants.max > i.variants.min
        ? `Người dùng đã ghi nhận giá ${i.variants.count} phân loại, từ ${money(i.variants.min)} đến ${money(i.variants.max)} – giá ở trên thường là phân loại rẻ nhất.`
        : `Người dùng đã ghi nhận giá ${i.variants.count} phân loại, cùng mức ${money(i.variants.min)}.`,
    );
  }
  if (p3.length) paragraphs.push(p3.join(" "));

  // 4. Shop và đánh giá
  const p4: string[] = [];
  if (i.shop.name) {
    p4.push(`Món này do ${i.shop.mall ? "shop chính hãng (Mall) " : "shop "}${i.shop.name} bán${i.shop.rating ? `, điểm shop ${i.shop.rating.toFixed(1)}/5` : ""}${i.sold && i.sold >= 10 ? `, đã bán khoảng ${i.sold.toLocaleString("vi-VN")}` : ""}.`);
  }
  if (i.reviews && i.reviews.count >= 5) {
    const parts: string[] = [];
    if (i.reviews.pros.length) parts.push(`khen ${i.reviews.pros.slice(0, 3).join(", ").toLowerCase()}`);
    if (i.reviews.cons.length) parts.push(`chê ${i.reviews.cons.slice(0, 2).join(", ").toLowerCase()}`);
    if (parts.length) p4.push(`Trong ${i.reviews.count} đánh giá Săn Deal thu được, người mua ${parts.join("; ")}.`);
  }
  if (p4.length) paragraphs.push(p4.join(" "));

  // Hỏi đáp
  if (!i.gone) {
    faqs.push({
      q: `${cap(s)} giá bao nhiêu?`,
      a: `Giá trên ${i.platformLabel} lúc Săn Deal cập nhật gần nhất là ${money(i.price)}${i.afterCodes < i.price ? `, sau khi áp mã giảm tốt nhất còn khoảng ${money(i.afterCodes)}` : ""}.${enough ? ` Giá thường ngày khoảng ${money(a.usual)}.` : ""}`,
    });
    faqs.push({
      q: `Có nên mua ${s} lúc này không?`,
      a: enough
        ? `${a.title}. ${a.belowUsualPct >= 3 ? `Giá đang thấp hơn giá thường ngày ${r(a.belowUsualPct)}%` : a.belowUsualPct <= -3 ? `Giá đang cao hơn giá thường ngày ${r(-a.belowUsualPct)}%` : "Giá đang ngang giá thường ngày"}${a.nextSale ? `, và ${saleName(a.nextSale.name)} còn ${a.nextSale.days} ngày` : ""}. Bạn có thể đặt báo giá để nhận email khi giá xuống mức mong muốn.`
        : `Săn Deal mới theo dõi món này ${days} ngày nên chưa đủ dữ liệu để kết luận. Hãy đặt báo giá để được báo khi giá giảm.`,
    });
  }
  if (enough) {
    faqs.push({
      q: `Giá thấp nhất của ${s} là bao nhiêu?`,
      a: `Thấp nhất ${money(a.low)}${a.lowAt ? ` vào ngày ${ddmm(a.lowAt)}` : ""}, tính trong ${days} ngày Săn Deal theo dõi trên ${i.platformLabel}.`,
    });
  }
  if (!i.gone && a.nextSale && a.forecast) {
    const n = saleName(a.nextSale.name);
    faqs.push({
      q: `${cap(s)} có rẻ hơn vào ${n} không?`,
      a:
        a.forecast.save >= 1000
          ? `Có thể. Dựa trên ${a.forecast.basisText}, giá dịp ${n} ước tính khoảng ${money(a.forecast.expected)}, rẻ hơn hôm nay khoảng ${money(a.forecast.save)}. Giá thật phụ thuộc vào shop.`
          : `Chưa chắc. Dựa trên ${a.forecast.basisText}, giá dịp ${n} có thể không thấp hơn nhiều so với ${money(i.price)} hôm nay.`,
    });
  }
  if (i.offers.length >= 2) {
    const cheapest = [...i.offers].sort((x, y) => x.price - y.price)[0];
    faqs.push({
      q: `Mua ${s} ở sàn nào rẻ nhất?`,
      a: `Hiện rẻ nhất ở ${cheapest.platformLabel} (${money(cheapest.price)}). Sản phẩm được ghép tự động theo tên, hãy kiểm tra lại phân loại và phiên bản trước khi mua.`,
    });
  }

  // Mô tả cho Google
  let meta: string;
  if (i.gone) meta = `${cap(s)}: giá lần cuối ${money(i.price)} trên ${i.platformLabel}. Xem lịch sử giá, món tương tự đang bán và nhận báo khi có lại.`;
  else if (!enough) meta = `${cap(s)} giá ${money(i.price)} trên ${i.platformLabel}. Săn Deal đang theo dõi giá mỗi ngày – xem biểu đồ giá và nhận báo khi giá giảm.`;
  else {
    const vs = a.belowUsualPct >= 3 ? `rẻ hơn ${r(a.belowUsualPct)}% giá thường ngày` : a.belowUsualPct <= -3 ? `cao hơn giá thường ngày ${r(-a.belowUsualPct)}%` : "ngang giá thường ngày";
    meta = `${cap(s)} giá ${money(i.price)} trên ${i.platformLabel}, ${vs}, thấp nhất ${money(a.low)}${a.lowAt ? ` (${ddmm(a.lowAt)})` : ""}. ${a.nextSale ? `Dự báo giá ${saleName(a.nextSale.name)} và lịch sử giá ${days} ngày.` : `Xem lịch sử giá ${days} ngày, nhận báo khi giảm.`}`;
  }
  if (meta.length > 160) meta = meta.slice(0, 157).replace(/\s+\S*$/, "") + "…";

  return { heading: `Nhận xét giá ${s}`, paragraphs, faqs, meta };
}

/** Vị trí giá của món trong danh mục (chỉ tính các món còn bán) */
export async function categoryStats(category: string | null, price: number): Promise<CategoryStats | null> {
  if (!category) return null;
  const [row] = await db
    .select({
      n: sql<number>`count(*)`,
      median: sql<number>`percentile_cont(0.5) within group (order by ${products.price})`,
      cheaper: sql<number>`count(*) filter (where ${products.price} < ${price})`,
    })
    .from(products)
    .where(and(eq(products.category, category), availableSql()));
  const n = Number(row?.n ?? 0);
  if (!n) return null;
  return { name: category, count: n, median: Math.round(Number(row.median)), cheaperShare: (Number(row.cheaper) / n) * 100 };
}
