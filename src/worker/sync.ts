import { and, desc, eq, gte, lt } from "drizzle-orm";
import { enabledAdapters } from "@/adapters";
import type { ProductInput, VoucherInput } from "@/adapters/types";
import { pricePoints, products, vouchers } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { computeDealScore } from "@/lib/score";
import { notifyWatchers } from "./notify";
import { postHotDealsToTelegram } from "./telegram";
import { syncConversions } from "./conversions";

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
    updatedAt: new Date(),
  };
  await db
    .insert(vouchers)
    .values({ source: v.source, externalId: v.externalId, ...data })
    .onConflictDoUpdate({ target: [vouchers.source, vouchers.externalId], set: data });
}

export interface SyncReport {
  products: number;
  vouchers: number;
  emails: number;
  telegram: number;
  conversions: number;
  errors: string[];
  ms: number;
}

export async function runSync(): Promise<SyncReport> {
  await ensureMigrated();
  const started = Date.now();
  const report: SyncReport = { products: 0, vouchers: 0, emails: 0, telegram: 0, conversions: 0, errors: [], ms: 0 };
  for (const adapter of enabledAdapters()) {
    try {
      const ps = (await adapter.fetchProducts?.()) ?? [];
      for (const p of ps) await upsertProduct(p);
      const vs = (await adapter.fetchVouchers?.()) ?? [];
      for (const v of vs) await upsertVoucher(v);
      report.products += ps.length;
      report.vouchers += vs.length;
      console.log(`[sync] ${adapter.name}: ${ps.length} sản phẩm, ${vs.length} voucher`);
    } catch (err) {
      report.errors.push(`${adapter.name}: ${(err as Error).message}`);
      console.error(`[sync] ${adapter.name} lỗi:`, err);
    }
  }
  for (const [key, job] of [
    ["emails", notifyWatchers],
    ["telegram", postHotDealsToTelegram],
    ["conversions", syncConversions],
  ] as const) {
    try {
      report[key] = await job();
    } catch (err) {
      report.errors.push(`${key}: ${(err as Error).message}`);
      console.error(`[sync] ${key} lỗi:`, err);
    }
  }
  report.ms = Date.now() - started;
  console.log(`[sync] xong`, report);
  return report;
}

// Chạy trực tiếp: npm run sync
if (process.argv[1]?.endsWith("sync.ts")) {
  runSync().then(() => process.exit(0));
}
