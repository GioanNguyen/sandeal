/** Quản trị › Sản phẩm: kiểm tra tình trạng sản phẩm, ẩn/hiện */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";

let ingest: typeof import("./ingest");
let ph: typeof import("./producthealth");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  ph = await import("./producthealth");
  schema = await import("@/db/schema");
});

const DAY = 86_400_000;
const NOW = new Date();
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ids: Record<string, number> = {};

async function add(key: string, o: { name: string; price: number; originalPrice?: number; discountPct?: number; imageUrl?: string; category?: string; affiliateUrl?: string; platform?: "shopee" | "lazada" }, at = NOW) {
  ids[key] = await ingest.upsertProduct(
    {
      platform: o.platform ?? "shopee",
      externalId: `ext-${key}`,
      name: o.name,
      price: o.price,
      originalPrice: o.originalPrice,
      discountPct: o.discountPct ?? 0,
      imageUrl: "imageUrl" in o ? o.imageUrl : "https://cf.shopee.vn/file/a.jpg",
      category: "category" in o ? o.category : "Nhà cửa",
      affiliateUrl: o.affiliateUrl ?? "https://s.shopee.vn/abc",
    },
    at,
  );
}

test("đếm và lọc theo tình trạng; vấn đề tính bằng SQL khớp với tính trong code", async () => {
  await add("ok", { name: "Nồi cơm điện bình thường", price: 500_000 }, ago(20));
  await add("ok", { name: "Nồi cơm điện bình thường", price: 500_000 }, NOW);
  await add("noimg", { name: "Món thiếu ảnh", price: 100_000, imageUrl: undefined, category: undefined });
  await add("badlink", { name: "Món link mẫu", price: 100_000, affiliateUrl: "https://example.com/shopee/1" });
  await add("badprice", { name: "Món giá gạch thấp hơn giá bán", price: 300_000, originalPrice: 200_000 });
  await add("jump", { name: "Món đổi giá mạnh", price: 400_000 }, ago(3));
  await add("jump", { name: "Món đổi giá mạnh", price: 90_000 }, NOW);
  await add("gone", { name: "Món đã vắng trên sàn", price: 150_000 }, ago(10));
  await add("hide", { name: "Món sẽ bị ẩn", price: 120_000 });

  assert.equal(await ph.setHidden(ids.hide, true, "  Giá   sai  "), true);
  assert.equal(await ph.setHidden(999_999, true), false);

  const s = await ph.healthSummary(NOW);
  assert.equal(s.total, 7);
  assert.equal(s.counts.hidden, 1);
  assert.equal(s.counts.gone, 1);
  assert.equal(s.available, 5, "trừ món vắng và món ẩn");
  assert.equal(s.counts.no_image, 1);
  assert.equal(s.counts.no_category, 1);
  assert.equal(s.counts.bad_link, 1);
  assert.equal(s.counts.bad_price, 1);
  assert.equal(s.counts.price_jump, 1);
  assert.equal(s.needsCheck, 3, "đếm theo món, không cộng dồn lỗi");
  assert.deepEqual(s.platforms.map((p) => [p.platform, p.total, p.available, p.gone, p.hidden]), [["shopee", 7, 5, 1, 1]]);
  assert.ok(s.platforms[0].lastSync);

  const name = async (issue: Parameters<typeof ph.healthList>[0]) => (await ph.healthList({ ...issue, now: NOW })).list.map((r) => r.p.name).sort();
  assert.deepEqual(await name({ issue: "gone" }), ["Món đã vắng trên sàn"]);
  assert.deepEqual(await name({ issue: "price_jump" }), ["Món đổi giá mạnh"]);
  assert.deepEqual(await name({ issue: "bad_link" }), ["Món link mẫu"]);

  // Vấn đề từng dòng khớp với bộ lọc SQL
  const all = await ph.healthList({ now: NOW });
  assert.equal(all.total, 7);
  for (const i of ph.ISSUES) {
    const viaSql = (await ph.healthList({ issue: i.key, now: NOW })).list.map((r) => r.p.id).sort();
    const viaRow = all.list.filter((r) => r.issues.includes(i.key)).map((r) => r.p.id).sort();
    assert.deepEqual(viaRow, viaSql, i.key);
  }
  const hidden = all.list.find((r) => r.p.id === ids.hide)!;
  assert.equal(hidden.p.hiddenReason, "Giá sai");
  assert.ok(!hidden.issues.includes("gone"), "món ẩn không tính là vắng");
  assert.deepEqual(all.list.find((r) => r.p.id === ids.ok)!.issues, []);
});

test("lọc theo ảnh: đã có ảnh, chưa có ảnh, ảnh lỗi (tải không được khi lập chỉ mục tìm bằng ảnh)", async () => {
  const [ok] = await dbm.db.select().from(schema.products).where((await import("drizzle-orm")).eq(schema.products.id, ids.badlink));
  // Ảnh của món "link mẫu" tải lỗi 2 lần
  await dbm.db.insert(schema.productEmbeddings).values({ productId: ids.badlink, imageUrl: ok.imageUrl!, model: "m", vec: null, failures: 2 });
  // Món khác đã có vector (ảnh tốt); một món từng lỗi nhưng đã đổi ảnh khác -> không tính lỗi
  await dbm.db.insert(schema.productEmbeddings).values({ productId: ids.badprice, imageUrl: "https://cf.shopee.vn/file/cu.jpg", model: "m", vec: null, failures: 3 });
  const list = async (image: "co" | "chua" | "loi") => (await ph.healthList({ image, now: NOW })).list.map((r) => r.p.id).sort();
  assert.deepEqual(await list("loi"), [ids.badlink]);
  assert.deepEqual(await list("chua"), [ids.noimg]);
  const co = await list("co");
  assert.equal(co.length, 5);
  assert.ok(!co.includes(ids.badlink) && !co.includes(ids.noimg) && co.includes(ids.badprice));
  // Kết hợp với ô tìm
  assert.deepEqual((await ph.healthList({ image: "loi", q: "link mẫu", now: NOW })).list.map((r) => r.p.id), [ids.badlink]);
  assert.equal((await ph.healthList({ image: "loi", q: "nồi cơm", now: NOW })).total, 0);
  const s = await ph.healthSummary(NOW);
  assert.equal(s.counts.bad_image, 1);
  const row = (await ph.healthList({ q: String(ids.badlink), now: NOW })).list[0];
  assert.ok(row.issues.includes("bad_image") && !row.issues.includes("no_image"));
});

test("tìm theo tên, mã món, link trang Săn Deal", async () => {
  assert.deepEqual((await ph.healthList({ q: "giá gạch", now: NOW })).list.map((r) => r.p.id), [ids.badprice]);
  assert.deepEqual((await ph.healthList({ q: String(ids.jump), now: NOW })).list.map((r) => r.p.id), [ids.jump]);
  assert.deepEqual((await ph.healthList({ q: `https://sandealgiare.com/product/mon-doi-gia-manh-${ids.jump}`, now: NOW })).list.map((r) => r.p.id), [ids.jump]);
  assert.equal((await ph.healthList({ q: "100%_", now: NOW })).total, 0, "ký tự đặc biệt không làm lỗi truy vấn");
});

test("món bị ẩn: không có trong danh sách deal; hiện lại thì có lại", async () => {
  const { availableSql } = await import("./availability");
  const { eq, and } = await import("drizzle-orm");
  const visible = async () => (await dbm.db.select({ id: schema.products.id }).from(schema.products).where(and(availableSql(), eq(schema.products.id, ids.hide)))).length;
  assert.equal(await visible(), 0);
  await ph.setHidden(ids.hide, false);
  assert.equal(await visible(), 1);
  const [row] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, ids.hide));
  assert.equal(row.hiddenReason, null);
  assert.equal(row.hiddenAt, null);
});

test("link sản phẩm thường: lưu khi nguồn có, lần đồng bộ sau thiếu thì giữ link cũ", async () => {
  const { eq } = await import("drizzle-orm");
  const base = { platform: "shopee" as const, externalId: "555", name: "Món có link thường", price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x" };
  const id = await ingest.upsertProduct({ ...base, productUrl: "https://shopee.vn/product/9/555" }, NOW);
  await ingest.upsertProduct(base, NOW);
  const [row] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, id));
  assert.equal(row.productUrl, "https://shopee.vn/product/9/555");
  const { mapShopeeNode } = await import("../adapters/shopee");
  assert.equal(mapShopeeNode({ itemId: 7, shopId: 3, productName: "a", priceMin: "1000" } as never).productUrl, "https://shopee.vn/product/3/7");
});

test("số lượt xem / bấm mua / theo dõi đúng từng món, sắp xếp theo lượt xem và bấm mua", async () => {
  const { productViews, clicks, watches, users } = schema;
  const d = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
  // ok: 3 khách xem (1 lượt cũ hơn 7 ngày không tính), 2 bấm mua; jump: 1 xem, 5 bấm mua; 1 người theo dõi món ok
  await dbm.db.insert(productViews).values([
    { visitor: "a", productId: ids.ok, day: "d1", createdAt: d(1) },
    { visitor: "b", productId: ids.ok, day: "d1", createdAt: d(2) },
    { visitor: "c", productId: ids.ok, day: "d1", createdAt: d(3) },
    { visitor: "old", productId: ids.ok, day: "d0", createdAt: d(24 * 9) },
    { visitor: "a", productId: ids.jump, day: "d1", createdAt: d(1) },
  ]);
  await dbm.db.insert(clicks).values([
    ...[1, 2].map(() => ({ productId: ids.ok, platform: "shopee", createdAt: d(1) })),
    ...[1, 2, 3, 4, 5].map(() => ({ productId: ids.jump, platform: "shopee", createdAt: d(1) })),
  ]);
  const [u] = await dbm.db.insert(users).values({ email: "w@x.vn" }).returning();
  await dbm.db.insert(watches).values({ userId: u.id, productId: ids.ok, targetPrice: 1 });

  const byViews = (await ph.healthList({ sort: "views", now: NOW })).list;
  assert.equal(byViews[0].p.id, ids.ok);
  assert.deepEqual([byViews[0].views7, byViews[0].clicks7, byViews[0].watchers], [3, 2, 1]);
  const j = byViews.find((r) => r.p.id === ids.jump)!;
  assert.deepEqual([j.views7, j.clicks7, j.watchers], [1, 5, 0]);
  assert.ok(j.issues.includes("price_jump"), "cờ giá đổi mạnh đúng cho từng dòng");
  assert.equal((await ph.healthList({ sort: "clicks", now: NOW })).list[0].p.id, ids.jump);
  const zero = byViews.find((r) => r.p.id === ids.badprice)!;
  assert.deepEqual([zero.views7, zero.clicks7, zero.watchers], [0, 0, 0]);
});

test("lọc theo danh mục: danh sách danh mục kèm số món, lọc đúng danh mục và món chưa có danh mục", async () => {
  const cats = await ph.categoryOptions();
  assert.equal(cats[0].name, "Nhà cửa", "danh mục nhiều món nhất đứng đầu");
  assert.ok(cats.every((c) => c.name && c.n > 0));
  const nha = await ph.healthList({ category: "Nhà cửa", now: NOW });
  assert.equal(nha.total, cats[0].n);
  assert.ok(nha.list.every((r) => r.p.category === "Nhà cửa"));
  const none = await ph.healthList({ category: ph.NO_CATEGORY, now: NOW });
  assert.ok(none.list.length > 0 && none.list.every((r) => !r.p.category));
  assert.deepEqual((await ph.healthList({ category: "Nhà cửa", q: "giá gạch", now: NOW })).list.map((r) => r.p.id), [ids.badprice], "kết hợp với ô tìm");
  assert.equal((await ph.healthList({ category: "Không có", now: NOW })).total, 0);
});
