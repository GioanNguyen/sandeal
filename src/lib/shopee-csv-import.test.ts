/** Nhập file CSV Shopee Affiliate vào DB: tạo món mới, lần sau cập nhật giá, giữ ảnh đã có */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SMTP_URL = "";

const HEAD = "Mã sản phẩm,Tên sản phẩm,Giá,Doanh thu,Tên cửa hàng,Tỉ lệ hoa hồng,Hoa hồng,Link sản phẩm,Link ưu đãi";
const row = (price: string, comm: string) =>
  `28407466123,Vợt pickleball Facolos Colorful 16mm,"${price}",6k+,Facolos Pickleball,13%,${comm},https://shopee.vn/product/1286901283/28407466123,https://s.shopee.vn/5q8Xo0ertj`;

test("nhập CSV Shopee vào DB", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { products, pricePoints } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { importShopeeCsv } = await import("./shopee-csv");

  const r1 = await importShopeeCsv(`${HEAD}\n${row("1,1tr", "₫140.270")}\n`, new Date(Date.now() - 86_400_000));
  assert.deepEqual({ ...r1, skipped: r1.skipped.length }, { imported: 1, created: 1, updated: 0, noImage: 1, skipped: 0 });
  const [p1] = await dbm.db.select().from(products).where(eq(products.externalId, "28407466123"));
  assert.equal(p1.price, 1_079_000);
  assert.equal(p1.affiliateUrl, "https://s.shopee.vn/5q8Xo0ertj");
  assert.equal(p1.commissionRate, 0.13);

  // Ảnh có từ nguồn khác (tiện ích) -> lần nhập sau giữ nguyên, giá mới vào lịch sử
  await dbm.db.update(products).set({ imageUrl: "https://down-vn.img.susercontent.com/file/a", originalPrice: 1_500_000 }).where(eq(products.id, p1.id));
  const r2 = await importShopeeCsv(`${HEAD}\n${row("999,0k", "₫129.870")}\n`);
  assert.equal(r2.updated, 1);
  assert.equal(r2.noImage, 0);
  const [p2] = await dbm.db.select().from(products).where(eq(products.id, p1.id));
  assert.equal(p2.price, 999_000);
  assert.equal(p2.imageUrl, "https://down-vn.img.susercontent.com/file/a");
  assert.equal(p2.discountPct, 33);
  const hist = await dbm.db.select().from(pricePoints).where(eq(pricePoints.productId, p1.id));
  assert.equal(hist.length, 2);
  await dbm.closeDb();
});
