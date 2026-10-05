/** Chất lượng chỉ mục: trang mỏng noindex, sitemap/IndexNow chỉ gồm trang index được */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

import { productNoindexReason, SEO_RULES, categoryIndexable, topicIndexable } from "./seoquality";

let ingest: typeof import("./ingest");
let seo: typeof import("./seoquality");
let sm: typeof import("./sitemaps");
let ph: typeof import("./producthealth");

before(async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  seo = await import("./seoquality");
  sm = await import("./sitemaps");
  ph = await import("./producthealth");
});

const DAY = 86_400_000;
const NOW = new Date();
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

test("quy tắc noindex trang sản phẩm", () => {
  const base = { hidden: false, imageUrl: "https://cf.shopee.vn/a.jpg", lastSeenAt: ago(1), createdAt: ago(3), points: 1 };
  assert.equal(productNoindexReason(base, NOW), null, "có ảnh: index");
  assert.equal(productNoindexReason({ ...base, hidden: true }, NOW), "hidden");
  assert.equal(productNoindexReason({ ...base, lastSeenAt: ago(SEO_RULES.productGoneDays + 1) }, NOW), "gone_long");
  assert.equal(productNoindexReason({ ...base, imageUrl: null }, NOW), "bare", "chưa ảnh, 1 mức giá, mới 3 ngày");
  assert.equal(productNoindexReason({ ...base, imageUrl: null, points: 3 }, NOW), null, "đủ mức giá");
  assert.equal(productNoindexReason({ ...base, imageUrl: null, createdAt: ago(20) }, NOW), null, "theo dõi đủ lâu");
  assert.equal(categoryIndexable(SEO_RULES.categoryMin - 1), false);
  assert.equal(topicIndexable(5, 3), false, "mới theo dõi vài ngày");
  assert.equal(topicIndexable(5, 30), true);
});

const add = (id: string, name: string, extra: Record<string, unknown> = {}, at = NOW) =>
  ingest.upsertProduct({ platform: "shopee", externalId: id, name, price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", category: "Sắc Đẹp", ...extra }, at);

test("sitemap và báo cáo SEO chỉ tính trang index được; danh mục mỏng bị bỏ khỏi sitemap", async () => {
  const good = await add("1", "Kem chống nắng có ảnh", { imageUrl: "https://cf.shopee.vn/a.jpg" });
  const bare = await add("2", "Son môi chưa ảnh");
  const old = await add("3", "Sữa rửa mặt nhập lâu rồi", {}, ago(30));
  await add("3", "Sữa rửa mặt nhập lâu rồi", {}, NOW);
  const hidden = await add("4", "Món đã ẩn", { imageUrl: "https://cf.shopee.vn/b.jpg" });
  await ph.setHiddenMany([hidden], true, "thử");
  for (let i = 0; i < 2; i++) await add(`t${i}`, `Ốp lưng mẫu ${i}`, { imageUrl: "https://cf.shopee.vn/c.jpg", category: "Điện Thoại & Phụ Kiện" });
  // Món chưa ảnh nhưng giá đổi 3 lần: đủ dữ liệu
  for (const [i, price] of [90_000, 80_000, 85_000].entries()) await add("5", "Phấn phủ giá đổi", { price }, new Date(NOW.getTime() - (3 - i) * 3_600_000));

  const r = await seo.seoReport(NOW);
  assert.equal(r.products.total, 7);
  assert.equal(r.products.indexable, 5, "trừ món đã ẩn và món mỏng");
  assert.deepEqual(Object.fromEntries(r.products.reasons.map((x) => [x.key, x.n])), { hidden: 1, gone_long: 0, bare: 1 });
  const cats = Object.fromEntries(r.categories.map((c) => [c.name, c.indexable]));
  assert.equal(cats["Điện Thoại & Phụ Kiện"], false, "2 món < ngưỡng");

  const files = await sm.sitemapFiles();
  const urls = (await sm.sitemapUrls("products-1.xml"))!.map((u) => u.loc);
  assert.equal(urls.length, 5);
  const has = (id: number) => urls.some((u) => u.endsWith(`-${id}`));
  assert.ok(has(good) && has(old), "món chưa ảnh nhưng theo dõi đủ lâu vẫn vào");
  assert.ok(!has(bare), "món mỏng không vào sitemap");
  assert.ok(!has(hidden));
  assert.ok(files.some((f) => f.name === "products-1.xml"));
  const catUrls = (await sm.sitemapUrls("categories.xml"))!.map((u) => u.loc);
  assert.ok(!catUrls.some((u) => u.includes("dien-thoai")), "danh mục mỏng không vào sitemap");
});
