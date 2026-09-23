import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { ProductInput, VoucherInput } from "@/adapters/types";
import { pricePoints, products, vouchers } from "@/db/schema";
import { db } from "./db";
import { computeDealScore } from "./score";
import { parseDiscount } from "./voucher";

/** Ghi sản phẩm/voucher vào DB (dùng chung cho worker và tính năng dán link) */
const DAY = 86_400_000;

export async function upsertProduct(p: ProductInput, now = new Date()) {
  const data = {
    name: p.name,
    imageUrl: p.imageUrl ?? null,
    shopName: p.shopName ?? null,
    category: p.category ?? null,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    discountPct: p.discountPct,
    rating: p.rating ?? null,
    sold: p.sold ?? null,
    commissionRate: p.commissionRate ?? null,
    affiliateUrl: p.affiliateUrl,
    lastSeenAt: now,
  };
  const [row] = await db
    .insert(products)
    .values({ platform: p.platform, externalId: p.externalId, createdAt: now, ...data })
    .onConflictDoUpdate({ target: [products.platform, products.externalId], set: data })
    .returning({ id: products.id });

  const [last] = await db
    .select({ price: pricePoints.price })
    .from(pricePoints)
    .where(eq(pricePoints.productId, row.id))
    .orderBy(desc(pricePoints.capturedAt))
    .limit(1);
  // Chỉ ghi lịch sử khi giá đổi (hoặc lần đầu)
  if (!last || last.price !== p.price) {
    await db.insert(pricePoints).values({ productId: row.id, price: p.price, capturedAt: now });
  }

  const since = new Date(now.getTime() - 30 * DAY);
  const history = await db
    .select({ price: pricePoints.price, capturedAt: pricePoints.capturedAt })
    .from(pricePoints)
    .where(and(eq(pricePoints.productId, row.id), gte(pricePoints.capturedAt, since)));
  // Giá trước mốc 30 ngày vẫn còn hiệu lực đến khi đổi
  const [before] = await db
    .select({ price: pricePoints.price })
    .from(pricePoints)
    .where(and(eq(pricePoints.productId, row.id), lt(pricePoints.capturedAt, since)))
    .orderBy(desc(pricePoints.capturedAt))
    .limit(1);
  if (before) history.push({ price: before.price, capturedAt: since });

  const r = computeDealScore({ price: p.price, discountPct: p.discountPct, rating: p.rating, sold: p.sold, history, now });
  await db.update(products).set({ dealScore: r.score, realDropPct: r.realDropPct }).where(eq(products.id, row.id));
  return row.id;
}

export async function upsertVoucher(v: VoucherInput) {
  const data = {
    platform: v.platform,
    code: v.code ?? null,
    title: v.title,
    description: v.description ?? null,
    discountText: v.discountText ?? null,
    minSpend: v.minSpend ?? null,
    startAt: v.startAt ?? null,
    endAt: v.endAt ?? null,
    affiliateUrl: v.affiliateUrl,
    ...(() => {
      // Nguồn không cho sẵn loại/giá trị giảm thì đọc từ mô tả
      const parsed = parseDiscount(`${v.title} ${v.discountText ?? ""}`);
      return {
        discountType: v.discountType ?? parsed.type,
        discountValue: v.discountValue ?? parsed.value,
        maxDiscount: v.maxDiscount ?? parsed.max,
      };
    })(),
    updatedAt: new Date(),
  };
  await db
    .insert(vouchers)
    .values({ source: v.source, externalId: v.externalId, ...data })
    .onConflictDoUpdate({ target: [vouchers.source, vouchers.externalId], set: data });
}

