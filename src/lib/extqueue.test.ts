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

  const r = await q.extQueue({ now });
  assert.deepEqual(r.items.map((x) => x.id), [hot, quiet]);
  assert.ok(r.items.every((x) => x.reason === "image"));
  assert.equal(r.items[0].url, "https://shopee.vn/product/9/2", "link thường, không phải link affiliate");
  assert.equal(r.remaining, 3);

  assert.equal((await q.markTried([hot], now)).stillMissing, 1);
  assert.deepEqual((await q.extQueue({ now })).items.map((x) => x.id), [quiet]);
  // Món đã có ảnh sau khi mở: không bị đánh dấu
  await dbm.db.update(schema.products).set({ imageUrl: "https://cf.shopee.vn/file/b.jpg" }).where((await import("drizzle-orm")).eq(schema.products.id, quiet));
  assert.equal((await q.markTried([quiet], now)).stillMissing, 0);
  // Sau 24 giờ thì đưa lại món đã thử
  assert.deepEqual((await q.extQueue({ now: new Date(now.getTime() + 25 * 3_600_000) })).items.map((x) => x.id), [hot]);
});

test("giá cũ: chỉ món khách đang quan tâm, kèm số ngày; tóm tắt theo ngành; nhắc nhập CSV trong trang Hôm nay", async () => {
  const now = new Date();
  const day = 86_400_000;
  const old = new Date(now.getTime() - 5 * day);
  const add = (id: string, at: Date, extra: Record<string, unknown> = {}) =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Giá cũ ${id}`, price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", productUrl: `https://shopee.vn/product/9/${id}`, imageUrl: "https://cf.shopee.vn/file/x.jpg", category: "Sắc Đẹp", ...extra }, at);
  const watched = await add("50", old);
  await add("51", old); // không ai quan tâm -> không đưa vào
  await add("52", new Date(now.getTime() - 90 * day)); // vắng quá lâu -> thôi
  const [u] = await dbm.db.insert(schema.users).values({ email: "x@test.vn" }).returning();
  await dbm.db.insert(schema.watches).values({ userId: u.id, productId: watched, targetPrice: 90_000 });

  const r = await q.extQueue({ now });
  const it = r.items.find((x) => x.id === watched);
  assert.equal(it?.reason, "price");
  assert.equal(it?.staleDays, 5);
  assert.ok(!r.items.some((x) => x.name === "Giá cũ 51" || x.name === "Giá cũ 52"));
  assert.ok(r.counts.price >= 1);

  const sum = await q.stalePriceSummary(now);
  assert.deepEqual(sum.byCategory[0], { category: "Sắc Đẹp", n: sum.total });

  const todo = await import("./todo");
  const list = await todo.todoList(new Date(now.getTime() + 4 * day));
  assert.ok(list.some((x) => x.key === "csv-stale"), "lâu chưa nhập CSV");
  assert.ok(list.some((x) => x.key === "stale-price" && /Sắc Đẹp/.test(x.why)));

  // Mở lại trang (góp giá) -> giá mới, không còn trong hàng đợi
  await add("50", now);
  assert.equal((await q.markTried([watched], now)).stillMissing, 0);
  assert.ok(!(await q.extQueue({ now })).items.some((x) => x.id === watched));
});
