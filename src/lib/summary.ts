import { productPath } from "@/lib/slug";
import type { Product } from "@/db/schema";
import { siteUrl } from "./mail";
import { isSampleProduct } from "./sample";
import { calcVouchers, compareOffers, getProduct } from "./queries";
import { timeWeightedMedian } from "./score";
import { bestPlan } from "./voucher";
import { buyAdvice } from "./advice";
import { categorySaleDrop } from "./saleforecast";
import { productInsight } from "./reviews";
import { RISK_LABEL } from "./reviews/risk";

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
  const forecast = buyAdvice(p.prices, p.price, new Date(), {
    category: p.category ? { name: p.category, drop: await categorySaleDrop(p.category) } : undefined,
  }).forecast;
  const site = siteUrl();
  const ins = await productInsight(p);
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
      /** Ước tính giá ở đợt sale lớn sắp tới (null khi không đủ dữ liệu) */
      forecast,
      /** Lần cuối Săn Deal cập nhật giá sản phẩm này (ms) */
      priceAt: p.lastSeenAt.getTime(),
      /** Dữ liệu mẫu (SOURCES=mock) – không phải giá thật trên sàn */
      sample: isSampleProduct(p),
    },
    /** Cảnh báo rủi ro + tóm tắt đánh giá (gọn cho tiện ích / Xem nhanh) */
    insight: {
      risk: { level: ins.risk.level, label: RISK_LABEL[ins.risk.level], flags: ins.risk.flags.slice(0, 3).map((f) => ({ level: f.level, title: f.title })) },
      reviews: ins.reviews?.count
        ? { count: ins.reviews.count, summary: ins.ai?.summary || ins.reviews.headline, ai: !!ins.ai, pros: (ins.ai?.pros.length ? ins.ai.pros : ins.reviews.pros).slice(0, 3), cons: (ins.ai?.cons.length ? ins.ai.cons : ins.reviews.cons).slice(0, 3) }
        : null,
    },
    offers: offers.map((o) => ({ id: o.id, platform: o.platform, price: o.price, detail: `${site}${productPath(o)}` })),
    links: {
      detail: `${site}${productPath(p)}`,
      watch: `${site}${productPath(p)}#theo-doi`,
      calc: `${site}/tinh-gia?p=${p.id}`,
      buy: `${site}/go/${p.id}`,
      reviews: `${site}${productPath(p)}#danh-gia`,
    },
  };
}
export type Summary = NonNullable<Awaited<ReturnType<typeof productSummary>>>;
