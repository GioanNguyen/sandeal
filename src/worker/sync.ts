import { enabledAdapters } from "@/adapters";
import type { ProductInput, VoucherInput } from "@/adapters/types";
import { prisma } from "@/lib/db";
import { computeDealScore } from "@/lib/score";
import { notifyWatchers } from "./notify";

const DAY = 86_400_000;

export async function upsertProduct(p: ProductInput, now = new Date()) {
  const existing = await prisma.product.findUnique({
    where: { platform_externalId: { platform: p.platform, externalId: p.externalId } },
    include: { prices: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  const data = {
    name: p.name,
    imageUrl: p.imageUrl,
    shopName: p.shopName,
    category: p.category,
    price: p.price,
    originalPrice: p.originalPrice,
    discountPct: p.discountPct,
    rating: p.rating,
    sold: p.sold,
    commissionRate: p.commissionRate,
    affiliateUrl: p.affiliateUrl,
    lastSeenAt: now,
  };

  const product = existing
    ? await prisma.product.update({ where: { id: existing.id }, data })
    : await prisma.product.create({ data: { platform: p.platform, externalId: p.externalId, ...data } });

  // Chỉ ghi lịch sử khi giá đổi (hoặc lần đầu)
  if (!existing || existing.prices[0]?.price !== p.price) {
    await prisma.pricePoint.create({ data: { productId: product.id, price: p.price, capturedAt: now } });
  }

  const history = await prisma.pricePoint.findMany({
    where: { productId: product.id, capturedAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    select: { price: true, capturedAt: true },
  });
  // Giá đầu kỳ vẫn có hiệu lực nếu chưa đổi: lấy thêm điểm cuối trước mốc 30 ngày
  const before = await prisma.pricePoint.findFirst({
    where: { productId: product.id, capturedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
    orderBy: { capturedAt: "desc" },
  });
  if (before) history.push({ price: before.price, capturedAt: new Date(now.getTime() - 30 * DAY) });

  const r = computeDealScore({ price: p.price, discountPct: p.discountPct, rating: p.rating, sold: p.sold, history, now });
  await prisma.product.update({ where: { id: product.id }, data: { dealScore: r.score, realDropPct: r.realDropPct } });
  return product.id;
}

export async function upsertVoucher(v: VoucherInput) {
  const { source, externalId, ...rest } = v;
  await prisma.voucher.upsert({
    where: { source_externalId: { source, externalId } },
    create: v,
    update: rest,
  });
}

export async function runSync() {
  const started = Date.now();
  let products = 0;
  let vouchers = 0;
  for (const adapter of enabledAdapters()) {
    try {
      const ps = (await adapter.fetchProducts?.()) ?? [];
      for (const p of ps) await upsertProduct(p);
      const vs = (await adapter.fetchVouchers?.()) ?? [];
      for (const v of vs) await upsertVoucher(v);
      products += ps.length;
      vouchers += vs.length;
      console.log(`[sync] ${adapter.name}: ${ps.length} sản phẩm, ${vs.length} voucher`);
    } catch (err) {
      console.error(`[sync] ${adapter.name} lỗi:`, err);
    }
  }
  const sent = await notifyWatchers();
  console.log(`[sync] xong ${products} sản phẩm, ${vouchers} voucher, ${sent} email trong ${Date.now() - started}ms`);
}

// Chạy trực tiếp: npm run sync
if (process.argv[1]?.endsWith("sync.ts")) {
  runSync().finally(() => prisma.$disconnect());
}
