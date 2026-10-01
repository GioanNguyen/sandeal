/** Tóm tắt đánh giá + cảnh báo rủi ro cho trang sản phẩm / tiện ích */
import { and, eq, min, ne } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { availableSql } from "../availability";
import { db, ensureMigrated } from "../db";
import { computeDealScore } from "../score";
import { analyzeReviews, type ReviewSummary } from "./analyze";
import { combineRisk, productFlags, type Risk } from "./risk";
import { reviewMeta, reviewsFor } from "./store";

export interface Insight {
  reviews: ReviewSummary | null;
  ai: { summary: string; pros: string[]; cons: string[]; model: string } | null;
  ratingCount: number | null;
  starCounts: number[] | null;
  risk: Risk;
}

const DAY = 86_400_000;

/** Giá rẻ nhất của cùng sản phẩm (cùng nhóm ghép) ở shop Mall, trừ chính món này */
async function mallPriceFor(p: Product): Promise<number | null> {
  if (!p.groupKey) return null;
  const [r] = await db
    .select({ v: min(products.price) })
    .from(products)
    .where(and(eq(products.groupKey, p.groupKey), eq(products.shopType, "mall"), ne(products.id, p.id), availableSql()));
  return r?.v ?? null;
}

export async function productInsight(p: Product & { prices: { price: number; capturedAt: Date }[] }, now = new Date()): Promise<Insight> {
  await ensureMigrated();
  const [rows, meta, mallPrice] = await Promise.all([reviewsFor(p.id), reviewMeta(p.id), mallPriceFor(p)]);
  const reviews = rows.length ? analyzeReviews(rows, { platformRating: p.rating, now }) : null;
  const score = computeDealScore({ price: p.price, discountPct: p.discountPct, rating: p.rating, sold: p.sold, history: p.prices, now });
  const trackedDays = Math.floor((now.getTime() - (p.prices[0]?.capturedAt ?? p.createdAt).getTime()) / DAY);
  // Số liệu sao của sàn (toàn bộ đánh giá) đáng tin hơn mẫu thu được: đặt trước để thắng khi trùng loại
  const risk = combineRisk(
    productFlags({
      price: p.price,
      discountPct: p.discountPct,
      originalPrice: p.originalPrice,
      realDropPct: p.realDropPct,
      rating: p.rating,
      sold: p.sold,
      shopType: p.shopType,
      shopRating: p.shopRating,
      trackedDays,
      inflatedBeforeSale: score.inflatedBeforeSale,
      mallPrice,
      ratingCount: meta?.ratingCount ?? null,
      starCounts: meta?.starCounts ?? null,
    }),
    reviews?.flags ?? [],
  );
  return { reviews, ai: meta?.aiSummary ?? null, ratingCount: meta?.ratingCount ?? null, starCounts: meta?.starCounts ?? null, risk };
}
