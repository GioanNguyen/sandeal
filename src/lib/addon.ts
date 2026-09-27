/**
 * "Mua kèm cho đủ mã": món đang xem chưa đủ đơn tối thiểu của một mã giảm của sàn,
 * gợi ý món thứ 2 (đang bán, ưu tiên cùng shop) để đạt điều kiện. Chỉ gợi ý khi phần tiết kiệm là thật:
 * so sánh giá phải trả tốt nhất (đã áp mã, gồm phí ship ước tính) khi mua riêng từng món với khi gộp đơn.
 */
import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { availableSql } from "./availability";
import { db } from "./db";
import { bestPlan, type CalcVoucher } from "./voucher";

/** Phí ship ước tính mỗi shop (giống máy tính giá trên trang sản phẩm) */
export const SHIP_EST = 30_000;
/** Chỉ gợi ý khi còn thiếu không quá mức này */
const MAX_GAP = 300_000;

export interface AddOn {
  item: Product;
  voucher: CalcVoucher;
  sameShop: boolean;
  /** Giá phải trả khi gộp 2 món vào 1 đơn (sau mã, gồm ship) */
  together: number;
  /** Giá phải trả khi mua riêng từng món (mỗi món dùng mã tốt nhất của nó) */
  separate: number;
  /** separate - together */
  save: number;
}

const pay = (platform: string, subtotal: number, shops: number, list: CalcVoucher[]) =>
  bestPlan({ platform, subtotal, shipping: SHIP_EST * shops }, list).effective;

/** Mã giảm tiền (không tính freeship/hoàn xu) mà món này chưa đủ đơn tối thiểu, còn thiếu không quá MAX_GAP */
export function reachableVouchers(p: Pick<Product, "platform" | "price">, list: CalcVoucher[]) {
  return list.filter(
    (v) => v.platform === p.platform && (v.type === "percent" || v.type === "fixed") && v.minSpend != null && v.minSpend > p.price && v.minSpend - p.price <= MAX_GAP,
  );
}

/** Chọn tối đa `limit` món mua kèm có lợi nhất (thuần tính toán, dễ kiểm thử) */
export function pickAddOns(p: Product, candidates: Product[], list: CalcVoucher[], limit = 3): AddOn[] {
  const targets = reachableVouchers(p, list);
  if (!targets.length) return [];
  const alone = pay(p.platform, p.price, 1, list);
  const out: AddOn[] = [];
  for (const item of candidates) {
    if (item.id === p.id || item.platform !== p.platform || (p.groupKey && item.groupKey === p.groupKey)) continue;
    const sameShop = !!p.shopName && item.shopName === p.shopName;
    const shops = sameShop ? 1 : 2;
    const total = p.price + item.price;
    // Cách áp mã tốt nhất khi gộp đơn phải thật sự dùng một mã mà món đang xem chưa đủ điều kiện
    const plan = bestPlan({ platform: p.platform, subtotal: total, shipping: SHIP_EST * shops }, list);
    const voucher = plan.vouchers.find((v) => targets.includes(v));
    if (!voucher) continue;
    // Món thêm không đắt hơn nhiều so với phần còn thiếu của đúng mã đó (tránh gợi ý mua thêm đồ đắt để đủ mã nhỏ)
    const gap = (voucher.minSpend ?? 0) - p.price;
    if (item.price > gap + Math.max(100_000, gap * 0.5)) continue;
    const together = plan.effective;
    const separate = alone + pay(p.platform, item.price, 1, list);
    const save = separate - together;
    // Phần nhờ mã (không tính phần gộp phí ship): gộp đơn mà không có mã vừa đạt điều kiện thì trả bao nhiêu
    const byVoucher = pay(p.platform, total, shops, list.filter((v) => !targets.includes(v))) - together;
    // Mã phải góp ít nhất 10K, và tổng tiết kiệm ít nhất 10K và 5% giá món thêm mới đáng gợi ý
    if (byVoucher < 10_000 || save < 10_000 || save < item.price * 0.05) continue;
    out.push({ item, voucher, sameShop, together, separate, save });
  }
  // Cùng shop trước (không mất thêm phí ship), rồi tiết kiệm nhiều, rồi món giảm thật sâu
  return out
    .sort((a, b) => Number(b.sameShop) - Number(a.sameShop) || b.save - a.save || b.item.realDropPct - a.item.realDropPct)
    .slice(0, limit);
}

/** Lấy món ứng viên từ DB rồi chọn */
export async function addOnsFor(p: Product, list: CalcVoucher[], limit = 3): Promise<AddOn[]> {
  const targets = reachableVouchers(p, list);
  if (!targets.length) return [];
  const minGap = Math.min(...targets.map((v) => v.minSpend! - p.price));
  const maxGap = Math.max(...targets.map((v) => v.minSpend! - p.price));
  const base = and(
    eq(products.platform, p.platform),
    ne(products.id, p.id),
    gte(products.price, minGap),
    // Món thêm không nên đắt hơn phần còn thiếu quá nhiều (mua thêm đồ không cần)
    lte(products.price, maxGap + 150_000),
    availableSql(),
    p.groupKey ? sql`coalesce(${products.groupKey}, '') <> ${p.groupKey}` : undefined,
  );
  const [sameShop, others] = await Promise.all([
    p.shopName
      ? db.select().from(products).where(and(base, eq(products.shopName, p.shopName))).orderBy(desc(products.realDropPct)).limit(12)
      : Promise.resolve([] as Product[]),
    db.select().from(products).where(and(base, gte(products.realDropPct, 10), p.category ? eq(products.category, p.category) : undefined)).orderBy(desc(products.dealScore)).limit(12),
  ]);
  const seen = new Set<number>();
  const cands = [...sameShop, ...others].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  return pickAddOns(p, cands, list, limit);
}
