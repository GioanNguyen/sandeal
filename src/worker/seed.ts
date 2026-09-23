/** Tạo 30 ngày lịch sử giá giả + đơn hàng mẫu. Chỉ dùng khi chạy thử (hãy tắt `npm run dev` trước nếu dùng PGlite). */
import { sql } from "drizzle-orm";
import { mockAdapter, mockProducts } from "@/adapters/mock";
import { db, ensureMigrated } from "@/lib/db";
import { syncConversions } from "./conversions";
import { upsertProduct, upsertVoucher } from "./sync";

export async function seed() {
  await ensureMigrated();
  await db.execute(sql`truncate clicks, conversions, watches, price_points, products, vouchers restart identity cascade`);
  const now = Date.now();
  for (let day = 30; day >= 0; day -= 2) {
    for (const p of mockProducts()) await upsertProduct(p, new Date(now - day * 86_400_000));
  }
  for (const v of await mockAdapter.fetchVouchers!()) await upsertVoucher(v);
  if ((process.env.SOURCES || "mock").includes("mock")) await syncConversions();
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from products`)).rows as { n: number }[];
  console.log(`[seed] xong: ${n} sản phẩm`);
}

if (process.argv[1]?.endsWith("seed.ts")) seed().then(() => process.exit(0));
