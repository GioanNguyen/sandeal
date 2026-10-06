/** Hàng đợi "cập nhật ảnh hàng loạt" cho tiện ích */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

let ingest: typeof import("./ingest");
let q: typeof import("./extqueue");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  q = await import("./extqueue");
  schema = await import("@/db/schema");
});

test("món thiếu ảnh có link sản phẩm, món được quan tâm trước; món đã thử mà vẫn thiếu ảnh thì tạm bỏ qua", async () => {
  const now = new Date();
  const add = (id: string, extra: Record<string, unknown> = {}) =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Món ${id}`, price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", productUrl: `https://shopee.vn/product/9/${id}`, ...extra }, now);
  const quiet = await add("1");
  const hot = await add("2");
  await add("3", { imageUrl: "https://cf.shopee.vn/file/a.jpg" }); // đã có ảnh
  await add("4", { productUrl: null }); // không biết link sản phẩm -> không mở trang tìm kiếm
  await dbm.db.insert(schema.clicks).values({ productId: hot, platform: "shopee" });

  const r = await q.imageQueue({ now });
  assert.deepEqual(r.items.map((x) => x.id), [hot, quiet]);
  assert.equal(r.items[0].url, "https://shopee.vn/product/9/2", "link thường, không phải link affiliate");
  assert.equal(r.remaining, 3);

  assert.equal((await q.markTried([hot], now)).stillMissing, 1);
  assert.deepEqual((await q.imageQueue({ now })).items.map((x) => x.id), [quiet]);
  // Món đã có ảnh sau khi mở: không bị đánh dấu
  await dbm.db.update(schema.products).set({ imageUrl: "https://cf.shopee.vn/file/b.jpg" }).where((await import("drizzle-orm")).eq(schema.products.id, quiet));
  assert.equal((await q.markTried([quiet], now)).stillMissing, 0);
  // Sau 24 giờ thì đưa lại món đã thử
  assert.deepEqual((await q.imageQueue({ now: new Date(now.getTime() + 25 * 3_600_000) })).items.map((x) => x.id), [hot]);
});
