/** Trang danh sách của sàn: thêm / cập nhật nhiều món một lần, chọn trang cần quét theo nhu cầu thật */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

let ingest: typeof import("./ingest");
let ls: typeof import("./listing");
let q: typeof import("./extqueue");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");
let eq: typeof import("drizzle-orm").eq;

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  ls = await import("./listing");
  q = await import("./extqueue");
  schema = await import("@/db/schema");
  eq = (await import("drizzle-orm")).eq;
});

const HOUR = 3_600_000;
const get = async (externalId: string) => (await dbm.db.select().from(schema.products).where(eq(schema.products.externalId, externalId)))[0];

test("một trang danh sách: món mới được thêm (có ảnh, link sản phẩm), món đã có cập nhật giá, dữ liệu hỏng bị bỏ", async () => {
  const now = new Date();
  // Món đã có (nguồn tiện ích, giá 3 ngày trước)
  await ingest.upsertProduct({ platform: "shopee", externalId: "6001", name: "Quạt tích điện mini Xiaomi", price: 200_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/a" }, new Date(now.getTime() - 72 * HOUR), { priceSource: "ext" });
  const r = await ls.recordListing(
    [
      { url: "https://shopee.vn/Quat-tich-dien-mini-Xiaomi-i.55.6001", name: "Quạt tích điện mini Xiaomi", price: 179_000, image: "https://down-vn.img.susercontent.com/file/a_tn" },
      { url: "https://shopee.vn/Quat-de-ban-i.55.6002", name: "Quạt để bàn 3 tốc độ", price: 250_000, originalPrice: 320_000, image: "https://down-vn.img.susercontent.com/file/b_tn" },
      { url: "https://shopee.vn/Quat-de-ban-i.55.6002", name: "trùng", price: 1 },
      { url: "https://shopee.vn/search?keyword=x", name: "không phải sản phẩm", price: 10_000 },
      { url: "https://shopee.vn/Mon-gia-hong-i.55.6003", name: "Món giá hỏng", price: 3 },
    ],
    { observer: "listing:test" },
    now,
  );
  assert.equal(r.total, 4, "link trùng chỉ tính 1 lần");
  assert.equal(r.updated, 1);
  assert.equal(r.created, 1);
  assert.equal(r.invalid, 2);
  assert.equal((await get("6001")).price, 179_000);
  const neu = await get("6002");
  assert.equal(neu.name, "Quạt để bàn 3 tốc độ");
  assert.equal(neu.originalPrice, 320_000);
  assert.match(neu.imageUrl ?? "", /susercontent/);
  assert.equal(neu.affiliateUrl, "https://shopee.vn/product/55/6002");
});

test("trang cần quét: Flash Sale, từ khoá khách tìm không ra, loại hàng được quan tâm; quét xong thì chờ tới lượt sau", async () => {
  const now = new Date();
  await dbm.db.insert(schema.searchLog).values([
    { q: "máy hút bụi cầm tay", results: 0, createdAt: now },
    { q: "máy hút bụi cầm tay", results: 0, createdAt: now },
    { q: "nồi cơm điện", results: 0, createdAt: now },
    { q: "quạt", results: 12, createdAt: now }, // có kết quả: không cần
    { q: "https://shopee.vn/abc", results: 0, createdAt: now }, // link dán nhầm
    { q: "ab", results: 0, createdAt: now }, // quá ngắn
  ]);
  const p = await get("6001");
  await dbm.db.insert(schema.clicks).values({ productId: p.id, platform: "shopee" });

  const all = await ls.candidateTargets(now);
  assert.deepEqual(all.map((t) => t.key), ["flash:shopee", "search:máy hút bụi cầm tay", "search:nồi cơm điện", "topic:quạt tích điện"]);
  assert.equal(all[1].url, "https://shopee.vn/search?keyword=m%C3%A1y%20h%C3%BAt%20b%E1%BB%A5i%20c%E1%BA%A7m%20tay");

  const t1 = await ls.listingTargets(now, 3);
  assert.equal(t1.due, 4);
  assert.deepEqual(t1.items.map((t) => t.kind), ["flash", "search", "search"]);

  // Hàng đợi tiện ích: trang danh sách đi đầu
  const qq = await q.extQueue({ now });
  assert.equal(qq.items[0].reason, "listing");
  assert.equal(qq.items[0].listKey, "flash:shopee");
  assert.equal(qq.counts.listing, 4);

  await ls.markListingDone("flash:shopee", { created: 3, updated: 10, total: 40 }, now);
  await ls.markListingDone("search:máy hút bụi cầm tay", { created: 20, updated: 0, total: 40 }, now);
  await ls.markListingDone("không hợp lệ", {}, now);
  const t2 = await ls.listingTargets(new Date(now.getTime() + HOUR), 10);
  assert.deepEqual(t2.items.map((t) => t.key), ["search:nồi cơm điện", "topic:quạt tích điện"]);
  // Flash Sale quét lại sau 12 giờ, từ khoá sau 3 ngày
  assert.ok((await ls.listingTargets(new Date(now.getTime() + 13 * HOUR), 10)).items.some((t) => t.key === "flash:shopee"));
  assert.ok(!(await ls.listingTargets(new Date(now.getTime() + 13 * HOUR), 10)).items.some((t) => t.key === "search:máy hút bụi cầm tay"));
  assert.deepEqual(await ls.listingSummary(now), { pages: 2, created: 23, updated: 10 });
});
