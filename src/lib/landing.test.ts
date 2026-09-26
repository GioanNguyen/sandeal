/** Trang đích nhóm 14: tổng kết đợt sale & trang "Giá … hôm nay" tính đúng từ lịch sử giá */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");
let salepages: typeof import("./salepages");
let pricepages: typeof import("./pricepages");
let sales: typeof import("./sales");

const DAY = 86_400_000;

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  schema = await import("@/db/schema");
  salepages = await import("./salepages");
  pricepages = await import("./pricepages");
  sales = await import("./sales");
});

async function product(name: string, ext: string, price: number, points: [number, number][]) {
  const [p] = await dbm.db
    .insert(schema.products)
    .values({ platform: "shopee", externalId: ext, name, price, affiliateUrl: `https://shopee.vn/x-i.1.${ext}`, category: "Điện tử" })
    .returning();
  for (const [at, v] of points) await dbm.db.insert(schema.pricePoints).values({ productId: p.id, price: v, capturedAt: new Date(at) });
  return p;
}

test("tổng kết sale: phân biệt giảm thật, tăng-trước-giảm-sau và không đổi", async () => {
  const now = new Date("2026-10-20T05:00:00Z");
  const e = sales.salesBetween(new Date("2026-10-01"), new Date("2026-10-31")).find((x) => x.name.includes("10.10"))!;
  const s = e.start.getTime();
  // Giảm thật: 100K suốt tháng, ngày sale 80K
  await product("Loa bluetooth A", "1", 80_000, [[s - 40 * DAY, 100_000], [s + 2 * 3_600_000, 80_000]]);
  // Tăng trước giảm sau: 100K, tăng 130K 7 ngày trước sale, ngày sale "giảm" về 100K
  await product("Loa bluetooth B", "2", 100_000, [[s - 40 * DAY, 100_000], [s - 7 * DAY, 130_000], [s + 3_600_000, 100_000]]);
  // Không đổi
  await product("Loa bluetooth C", "3", 100_000, [[s - 40 * DAY, 100_000]]);
  // Mới theo dõi 5 ngày trước sale -> không đủ dữ liệu, bị loại
  await product("Loa bluetooth D", "4", 50_000, [[s - 5 * DAY, 90_000], [s + 3_600_000, 50_000]]);

  const r = await salepages.saleReport(e, now);
  assert.equal(r.total, 3);
  assert.deepEqual(r.real.map((x) => x.product.name), ["Loa bluetooth A"]);
  assert.deepEqual(r.fake.map((x) => x.product.name), ["Loa bluetooth B"]);
  assert.equal(r.fake[0].peakBefore, 130_000);
  assert.equal(r.same, 1);
});

test("slug đợt sale: ngày đôi dạng 10-10-2026, Black Friday có tên", () => {
  const list = sales.salesBetween(new Date("2026-10-01"), new Date("2026-11-30"));
  const slugs = list.map(salepages.saleSlug);
  assert.ok(slugs.includes("10-10-2026"));
  assert.ok(slugs.includes("11-11-2026"));
  assert.ok(slugs.some((x) => x.startsWith("black-friday-")));
});

test("trang giá: gom loại sản phẩm theo tên, rẻ nhất & thấp nhất lịch sử đúng", async () => {
  const topics = await pricepages.priceTopics();
  const loa = topics.find((t) => t.slug === "loa-bluetooth");
  assert.ok(loa, "có trang Giá loa");
  const d = await pricepages.getPriceTopic("loa-bluetooth");
  assert.ok(d);
  assert.equal(d.now.min, 50_000);
  assert.equal(d.now.max, 100_000);
  assert.ok(d.daily.length > 0);
  assert.ok(d.cheapest[0].price <= d.cheapest[d.cheapest.length - 1].price);
});

test("thẻ deal: số tiền vừa giảm và bảng giá theo sàn lấy từ dữ liệu thật", async () => {
  const q = await import("./queries");
  const now = Date.now();
  const [a] = await dbm.db.insert(schema.products).values({ platform: "shopee", externalId: "g1", name: "Quạt mini A", price: 150_000, affiliateUrl: "https://shopee.vn/x-i.1.9", groupKey: "quat-mini" }).returning();
  await dbm.db.insert(schema.products).values({ platform: "lazada", externalId: "g2", name: "Quạt mini A", price: 170_000, affiliateUrl: "https://lazada.vn/x-i9.html", groupKey: "quat-mini" });
  await dbm.db.insert(schema.pricePoints).values([
    { productId: a.id, price: 200_000, capturedAt: new Date(now - 5 * DAY) },
    { productId: a.id, price: 150_000, capturedAt: new Date(now - 2 * 3_600_000) },
  ]);
  const [row] = await q.enrichDeals([a]);
  assert.equal(row.droppedBy, 50_000);
  assert.ok(row.droppedAt && now - row.droppedAt.getTime() < 3 * 3_600_000);
  assert.deepEqual(row.offers?.map((o) => [o.platform, o.price]), [["shopee", 150_000], ["lazada", 170_000]]);
});
