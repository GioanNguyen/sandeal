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
});

test("xoá dữ liệu mẫu: chỉ xoá mock, giữ dữ liệu thật", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { products, vouchers, conversions, clicks, users } = await import("@/db/schema");
  const { upsertProduct, upsertVoucher } = await import("./ingest");
  const { clearMockData } = await import("./clear-mock");
  const mockId = await upsertProduct({ platform: "shopee", externalId: "mock-shopee-1", name: "Tai nghe mẫu", price: 100_000, discountPct: 0, affiliateUrl: "https://example.com" });
  await upsertVoucher({ source: "mock", externalId: "v1", platform: "shopee", title: "Giảm 50K", affiliateUrl: "https://example.com" });
  await dbm.db.insert(conversions).values({ source: "mock", externalId: "mock-1-1", platform: "shopee", orderAmount: 1, commission: 1, status: "pending", purchasedAt: new Date() });
  await dbm.db.insert(clicks).values({ productId: mockId, platform: "shopee" });
  await dbm.db.insert(users).values({ email: "demo1@sandeal.local" });

  process.env.SOURCES = "mock";
  await assert.rejects(clearMockData(), /Nguồn mẫu vẫn đang bật/);
  process.env.SOURCES = "none";
  const r = await clearMockData();
  assert.deepEqual({ ...r, searches: 0 }, { products: 1, clicks: 1, vouchers: 1, conversions: 1, users: 1, searches: 0 });
  const left = await dbm.db.select().from(products);
  assert.ok(left.length > 0 && left.every((p) => !p.externalId.startsWith("mock-")), "sản phẩm thật (từ CSV) còn nguyên");
  assert.equal((await dbm.db.select().from(vouchers)).length, 0);
  const { enabledAdapters } = await import("@/adapters");
  assert.equal(enabledAdapters().length, 0);
  await dbm.closeDb();
});
