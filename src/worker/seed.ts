/** Tạo 30 ngày lịch sử giá giả để thử biểu đồ và điểm deal. Chỉ dùng khi chạy thử. */
import { mockAdapter, mockProducts } from "@/adapters/mock";
import { prisma } from "@/lib/db";
import { upsertProduct, upsertVoucher } from "./sync";

async function main() {
  await prisma.pricePoint.deleteMany();
  await prisma.watch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.voucher.deleteMany();

  const now = Date.now();
  for (let day = 30; day >= 0; day -= 2) {
    for (const p of mockProducts()) {
      await upsertProduct(p, new Date(now - day * 86_400_000));
    }
  }
  for (const v of (await mockAdapter.fetchVouchers!())) await upsertVoucher(v);
  console.log(`[seed] ${await prisma.product.count()} sản phẩm, ${await prisma.pricePoint.count()} điểm giá`);
}

main().finally(() => prisma.$disconnect());
