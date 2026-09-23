/** Chuẩn hoá mã giảm giá & tính tổ hợp mã tốt nhất cho giỏ hàng */

export type DiscountType = "percent" | "fixed" | "freeship" | "cashback";

export interface ParsedDiscount {
  type: DiscountType | null;
  value: number | null; // % (percent/cashback) hoặc số tiền (fixed/freeship)
  max: number | null; // trần giảm tối đa
}

const money = (s: string) => {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|đ|d|vnđ)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  const u = (m[2] ?? "").toLowerCase();
  if (u === "k" || u === "nghìn" || u === "ngàn") return n * 1000;
  if (u === "tr" || u === "triệu") return n * 1_000_000;
  return n;
};

/** Đọc "Giảm 10% tối đa 100K", "Giảm 50K đơn từ 300K", "Freeship Xtra", "Hoàn xu 15%" */
export function parseDiscount(text: string): ParsedDiscount {
  const t = text.toLowerCase();
  const maxM = t.match(/(?:tối đa|toi da|max)\s*([\d.,]+\s*(?:k|nghìn|ngàn|tr|triệu|đ)?)/);
  const max = maxM ? money(maxM[1]) : null;
  const pct = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (/hoàn xu|hoan xu|cashback|hoàn tiền/.test(t)) return { type: "cashback", value: pct ? Number(pct[1].replace(",", ".")) : null, max };
  if (/freeship|miễn phí vận chuyển|free ship|mien phi van chuyen/.test(t)) {
    const v = t.replace(/đơn\s*(từ|tối thiểu)[^,;]*/g, "").match(/(?:giảm|tối đa)?\s*([\d.,]+\s*(?:k|nghìn|ngàn|đ))/);
    return { type: "freeship", value: v ? money(v[1]) : null, max };
  }
  if (pct) return { type: "percent", value: Number(pct[1].replace(",", ".")), max };
  const fixed = t.replace(/đơn\s*(từ|tối thiểu|toi thieu)\s*[\d.,]+\s*(k|nghìn|ngàn|tr|triệu|đ)?/g, "").match(/([\d.,]+\s*(?:k|nghìn|ngàn|tr|triệu|đ))/);
  if (fixed) return { type: "fixed", value: money(fixed[1]), max: null };
  return { type: null, value: null, max: null };
}

export interface CalcVoucher {
  id: number | string;
  title: string;
  code?: string | null;
  platform: string;
  type: DiscountType;
  value: number | null;
  max: number | null;
  minSpend: number | null;
}

export interface Cart {
  platform: string;
  subtotal: number;
  shipping: number;
}

export interface Plan {
  vouchers: CalcVoucher[];
  discount: number;
  shipSaved: number;
  cashback: number;
  payNow: number;
  effective: number; // trả ngay trừ hoàn xu
}

/** Số tiền 1 mã mang lại cho giỏ (0 nếu không đủ điều kiện) */
export function voucherGain(v: CalcVoucher, cart: Cart): { discount: number; shipSaved: number; cashback: number } {
  const zero = { discount: 0, shipSaved: 0, cashback: 0 };
  if (cart.subtotal <= 0 || v.platform !== cart.platform || cart.subtotal < (v.minSpend ?? 0)) return zero;
  const cap = (x: number) => (v.max ? Math.min(x, v.max) : x);
  switch (v.type) {
    case "percent":
      return { ...zero, discount: Math.round(cap((cart.subtotal * (v.value ?? 0)) / 100)) };
    case "fixed":
      return { ...zero, discount: Math.min(cart.subtotal, v.value ?? 0) };
    case "freeship":
      return { ...zero, shipSaved: Math.min(cart.shipping, v.value ?? v.max ?? cart.shipping) };
    case "cashback":
      return { ...zero, cashback: Math.round(cap((cart.subtotal * (v.value ?? 0)) / 100)) };
  }
}

/**
 * Tìm tổ hợp tốt nhất theo quy tắc phổ biến của sàn:
 * tối đa 1 mã giảm giá/hoàn xu của sàn + 1 mã freeship.
 */
export function bestPlan(cart: Cart, list: CalcVoucher[]): Plan {
  const usable = list.filter((v) => {
    const g = voucherGain(v, cart);
    return g.discount + g.shipSaved + g.cashback > 0;
  });
  const discountGroup: (CalcVoucher | null)[] = [null, ...usable.filter((v) => v.type !== "freeship")];
  const shipGroup: (CalcVoucher | null)[] = [null, ...usable.filter((v) => v.type === "freeship")];
  let best: Plan | null = null;
  for (const a of discountGroup) {
    for (const b of shipGroup) {
      const chosen = [a, b].filter((x): x is CalcVoucher => !!x);
      let discount = 0, shipSaved = 0, cashback = 0;
      for (const v of chosen) {
        const g = voucherGain(v, cart);
        discount += g.discount;
        shipSaved += g.shipSaved;
        cashback += g.cashback;
      }
      const payNow = Math.max(0, cart.subtotal - discount) + Math.max(0, cart.shipping - shipSaved);
      const plan = { vouchers: chosen, discount, shipSaved, cashback, payNow, effective: payNow - cashback };
      if (!best || plan.effective < best.effective || (plan.effective === best.effective && plan.payNow < best.payNow)) best = plan;
    }
  }
  return best!;
}
