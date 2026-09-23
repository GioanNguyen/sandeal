/** Tạo 30 ngày lịch sử giá giả + đơn hàng mẫu. Chỉ dùng khi chạy thử (hãy tắt `npm run dev` trước nếu dùng PGlite). */
import { desc, sql } from "drizzle-orm";
import { clicks, posts, products, users, votes } from "@/db/schema";
import { mockAdapter, mockProducts } from "@/adapters/mock";
import { db, ensureMigrated } from "@/lib/db";
import { syncConversions } from "./conversions";
import { groupProducts } from "./grouping";
import { upsertProduct, upsertVoucher } from "./sync";

export async function seed() {
  await ensureMigrated();
  await db.execute(sql`truncate clicks, conversions, watches, sent_deals, posts, votes, product_requests, price_points, products, vouchers restart identity cascade`);
  const now = Date.now();
  for (let day = 30; day >= 0; day -= 2) {
    const list = mockProducts();
    for (let i = 0; i < list.length; i++) {
      // Lần cập nhật cuối rải đều trong ~2 ngày để dữ liệu mẫu giống thật (không phải mọi giá cùng đổi một lúc)
      const jitter = day === 0 ? ((i * 37) % 48) * 3_600_000 + ((i * 13) % 60) * 60_000 : 0;
      await upsertProduct(list[i], new Date(now - day * 86_400_000 - jitter));
    }
  }
  for (const v of await mockAdapter.fetchVouchers!()) await upsertVoucher(v);
  if ((process.env.SOURCES || "mock").includes("mock")) await syncConversions();
  await groupProducts();

  // Lượt bấm mua mẫu trong 24 giờ (để thấy nhãn "lượt bấm mua")
  const popular = await db.select({ id: products.id, platform: products.platform }).from(products).orderBy(desc(products.dealScore)).limit(10);
  for (let i = 0; i < popular.length; i++) {
    const n = Math.max(0, 12 - i * 2);
    for (let k = 0; k < n; k++) {
      await db.insert(clicks).values({ productId: popular[i].id, platform: popular[i].platform, createdAt: new Date(now - ((k * 97) % 23) * 3_600_000) });
    }
  }

  // Cộng đồng mẫu: vài người dùng demo chia sẻ và bình chọn deal
  const names = ["Thợ săn Sài Gòn", "Mẹ bỉm săn sale", "Dev ghiền deal", "Cô Ba Hà Nội"];
  const demo = [];
  for (let i = 0; i < names.length; i++) {
    const [u] = await db
      .insert(users)
      .values({ email: `demo${i + 1}@sandeal.local`, name: names[i] })
      .onConflictDoUpdate({ target: users.email, set: { name: names[i] } })
      .returning();
    demo.push(u);
  }
  const top = await db.select().from(products).orderBy(desc(products.dealScore)).limit(8);
  const notes = ["Rẻ hơn hẳn tháng trước, áp thêm mã freeship", "Giá thấp nhất 30 ngày, shop Mall", "Đang flash sale, nhanh tay", "", "Mua rồi, hàng ổn", "Combo mã 10% còn rẻ nữa"];
  for (let i = 0; i < top.length; i++) {
    const author = demo[i % demo.length];
    await db.insert(posts).values({ userId: author.id, productId: top[i].id, note: notes[i % notes.length], createdAt: new Date(now - i * 5 * 3_600_000) });
    for (const u of demo) {
      const v = (u.id + i) % 5 === 0 ? -1 : (u.id * 7 + i) % 3 === 0 ? 0 : 1;
      if (v) await db.insert(votes).values({ userId: u.id, productId: top[i].id, value: v });
    }
  }
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from products`)).rows as { n: number }[];
  console.log(`[seed] xong: ${n} sản phẩm`);
}

if (process.argv[1]?.endsWith("seed.ts")) seed().then(() => process.exit(0));
