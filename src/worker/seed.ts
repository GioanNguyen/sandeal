/** Tạo 30 ngày lịch sử giá giả + đơn hàng mẫu. Chỉ dùng khi chạy thử (hãy tắt `npm run dev` trước nếu dùng PGlite). */
import { desc, sql } from "drizzle-orm";
import { clicks, posts, products, productViews, searchLog, users, votes } from "@/db/schema";
import { vnDay } from "@/lib/discovery";
import { mockAdapter, mockProducts } from "@/adapters/mock";
import { closeDb, db, ensureMigrated } from "@/lib/db";
import { syncConversions } from "./conversions";
import { groupProducts } from "./grouping";
import { upsertProduct, upsertVoucher } from "./sync";

export async function seed() {
  await ensureMigrated();
  await db.execute(sql`truncate search_log, product_views, clicks, conversions, watches, sent_deals, posts, votes, product_requests, price_points, products, vouchers restart identity cascade`);
  const now = Date.now();
  for (let day = 30; day >= 0; day -= 2) {
    const list = mockProducts();
    for (let i = 0; i < list.length; i++) {
      // Lần cập nhật cuối rải đều trong ~2 ngày để dữ liệu mẫu giống thật (không phải mọi giá cùng đổi một lúc)
      const jitter = day === 0 ? ((i * 37) % 48) * 3_600_000 + ((i * 13) % 60) * 60_000 : 0;
      await upsertProduct(list[i], new Date(now - day * 86_400_000 - jitter));
    }
  }
  // Lần đồng bộ gần nhất (giống worker chạy mỗi 2 giờ): mọi sản phẩm vừa được kiểm tra giá trong 2 giờ qua
  await db.execute(sql`update products set last_seen_at = now() - (id % 12) * interval '9 minutes'`);
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
  // Từ khoá mẫu cho "Đang được tìm nhiều"
  const searches: [string, number][] = [["tai nghe", 9], ["nồi chiên", 7], ["kem chống nắng", 6], ["sạc dự phòng", 5], ["serum", 4], ["bàn phím", 3], ["giày chạy bộ", 2]];
  for (const [q, times] of searches) {
    for (let k = 0; k < times; k++) await db.insert(searchLog).values({ q, results: 3, createdAt: new Date(now - ((k * 7) % 72) * 3_600_000) });
  }

  // Lượt xem ẩn danh mẫu: mỗi khách xem vài món, thường cùng danh mục (để có "Người xem món này cũng xem")
  const all = await db.select({ id: products.id, category: products.category }).from(products);
  const cats = [...new Set(all.map((p) => p.category))];
  for (let v = 0; v < 60; v++) {
    const cat = cats[v % cats.length];
    const pool = all.filter((p) => p.category === cat);
    const extra = all[(v * 13) % all.length];
    const picks = [...pool.filter((_, i) => (i + v) % 3 !== 0).slice(0, 4), extra];
    const at = new Date(now - (v % 20) * 86_400_000 - 2 * 3_600_000);
    for (const p of picks) await db.insert(productViews).values({ visitor: `demo-${v}`, productId: p.id, day: vnDay(at), createdAt: at }).onConflictDoNothing();
  }

  // Dữ liệu mẫu cho "người xem trong 1 giờ qua": vài khách xem mấy món điểm cao trong giờ vừa rồi
  const hot = await db.select({ id: products.id }).from(products).orderBy(desc(products.dealScore)).limit(6);
  for (let i = 0; i < hot.length; i++) {
    for (let v = 0; v < 14 - i * 2; v++) {
      const t = new Date(now - ((v * 7 + i * 3) % 55) * 60_000);
      await db.insert(productViews).values({ visitor: `live-${i}-${v}`, productId: hot[i].id, day: vnDay(t), createdAt: t, lastSeenAt: t }).onConflictDoNothing();
    }
  }

  const [{ n }] = (await db.execute(sql`select count(*)::int as n from products`)).rows as { n: number }[];
  console.log(`[seed] xong: ${n} sản phẩm`);
}

if (process.argv[1]?.endsWith("seed.ts")) seed()
    .then(closeDb)
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
