import type { Product } from "@/db/schema";
import { siteUrl } from "./mail";
import { calcVouchers, compareOffers, getProduct } from "./queries";
import { timeWeightedMedian } from "./score";
import { bestPlan } from "./voucher";

export type Verdict = "good" | "wait" | "new";

/** Tóm tắt một sản phẩm cho Xem nhanh và tiện ích trình duyệt */
export async function productSummary(id: number) {
  const p = await getProduct(id);
  if (!p) return null;
  const prices = p.prices.map((x) => x.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const usual = p.prices.length ? timeWeightedMedian(p.prices, new Date()) : p.price;
  const trackedDays = p.prices.length ? (Date.now() - p.prices[0].capturedAt.getTime()) / 86_400_000 : 0;
  const verdict: Verdict = trackedDays < 7 ? "new" : p.price <= low || p.realDropPct >= 10 ? "good" : "wait";
  const [offers, vs] = await Promise.all([compareOffers(p as Product), calcVouchers(p.platform)]);
  const plan = bestPlan({ platform: p.platform, subtotal: p.price, shipping: 30_000 }, vs);
  const site = siteUrl();
  return {
    product: {
      id: p.id,
      name: p.name,
      platform: p.platform,
      imageUrl: p.imageUrl,
      shopName: p.shopName,
      rating: p.rating,
      sold: p.sold,
      price: p.price,
      originalPrice: p.originalPrice,
      low90: low,
      usual,
      realDropPct: p.realDropPct,
      dealScore: Math.round(p.dealScore),
      verdict,
      trackedDays: Math.floor(trackedDays),
      history: p.prices.map((x) => [x.capturedAt.getTime(), x.price] as [number, number]),
      afterCodes: p.price - plan.discount - plan.cashback,
      codes: plan.vouchers.map((v) => v.code ?? v.title),
    },
    offers: offers.map((o) => ({ id: o.id, platform: o.platform, price: o.price, detail: `${site}/product/${o.id}` })),
    links: {
      detail: `${site}/product/${p.id}`,
      watch: `${site}/product/${p.id}#theo-doi`,
      calc: `${site}/tinh-gia?p=${p.id}`,
      buy: `${site}/go/${p.id}`,
    },
  };
}
export type Summary = NonNullable<Awaited<ReturnType<typeof productSummary>>>;
