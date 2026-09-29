/** Giá gạch từ tiện ích: đọc cạnh giá bán, chỉ ghi khi món chưa có giá gốc, lần sau không cập nhật */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

const require = createRequire(import.meta.url);
require("../../extension/extract.js");
type El = { tagName: string; textContent: string; children: El[]; parentElement: El | null; strike?: boolean; querySelectorAll: (s: string) => El[]; contains: (e: El) => boolean };
const X = (globalThis as unknown as {
  SanDealExtract: {
    firstVnd: (t: string) => number;
    pickStrike: (v: number[], p: number) => number | undefined;
    strikeFromDocument: (doc: unknown, price: number) => number | undefined;
    fromData: (ld: unknown[], meta: Record<string, string>, href: string, title?: string) => Record<string, unknown> | null;
  };
}).SanDealExtract;

/** DOM giả tối thiểu: h("div", [..]) / h("span", "₫1.000", true) (true = gạch ngang) */
function h(tag: string, kids: El[] | string, strike = false): El {
  const children = typeof kids === "string" ? [] : kids;
  const el: El = {
    tagName: tag.toUpperCase(),
    children,
    parentElement: null,
    strike,
    get textContent() { return typeof kids === "string" ? kids : children.map((c) => c.textContent).join(""); },
    querySelectorAll: () => { const out: El[] = []; const walk = (e: El) => e.children.forEach((c) => { out.push(c); walk(c); }); walk(el); return out; },
    contains: (e: El) => { for (let x: El | null = e; x; x = x.parentElement) if (x === el) return true; return false; },
  };
  children.forEach((c) => (c.parentElement = el));
  return el;
}
const docOf = (body: El) => ({ querySelectorAll: () => body.querySelectorAll("*"), defaultView: { getComputedStyle: (e: El) => ({ textDecorationLine: e.strike ? "line-through" : "none" }) } });

test("tiện ích: đọc giá gạch cạnh giá bán", () => {
  assert.equal(X.firstVnd("₫1.079.000"), 1_079_000);
  assert.equal(X.firstVnd("₫29.900 - ₫39.000"), 29_900);
  assert.equal(X.pickStrike([1_500_000, 1_500_000], 1_079_000), 1_500_000);
  assert.equal(X.pickStrike([1_500_000, 1_400_000], 1_079_000), undefined, "nhiều giá gạch khác nhau -> bỏ");
  assert.equal(X.pickStrike([99_000_000], 1_079_000), undefined, "giảm hơn 80% -> bỏ");

  const page = h("body", [
    h("div", [
      h("div", [h("span", "₫"), h("span", "1.079.000")]),
      h("div", "₫1.500.000", true),
      h("div", "-28%"),
    ]),
    // Sản phẩm gợi ý bên dưới, ở xa: không được lấy nhầm
    h("section", [h("div", [h("div", [h("div", [h("div", [h("span", "₫2.000.000", true)])])])])]),
  ]);
  assert.equal(X.strikeFromDocument(docOf(page), 1_079_000), 1_500_000);
  // Không có giá gạch gần giá bán
  const plain = h("body", [h("div", [h("div", [h("span", "₫1.079.000")]), h("div", "Đã bán 6k")])]);
  assert.equal(X.strikeFromDocument(docOf(plain), 1_079_000), undefined);
  // Trang lỗi: không làm hỏng việc góp giá
  assert.equal(X.strikeFromDocument({ querySelectorAll: () => { throw new Error("x"); } }, 1000), undefined);
});

test("tiện ích: đọc ảnh phụ, số sao, danh mục cấp 1", () => {
  const URL0 = "https://shopee.vn/Vot-pickleball-i.1286901283.28407466123";
  const ld = [
    { "@type": "BreadcrumbList", itemListElement: [
      { position: 3, name: "Pickleball" }, { position: 1, name: "Shopee" }, { position: 2, name: "Thể Thao & Du Lịch" },
      { position: 4, name: "Vợt pickleball Facolos" } ] },
    { "@type": "Product", name: "Vợt pickleball Facolos", url: URL0,
      image: ["https://down-vn.img.susercontent.com/file/a", "https://down-vn.img.susercontent.com/file/b", "https://down-vn.img.susercontent.com/file/a"],
      offers: { price: "1079000", priceCurrency: "VND" }, aggregateRating: { ratingValue: "4.9", ratingCount: "812" } },
  ];
  const d = X.fromData(ld, {}, URL0, "Vợt pickleball Facolos | Shopee Việt Nam")!;
  assert.equal(d.image, "https://down-vn.img.susercontent.com/file/a");
  assert.deepEqual(d.images, ["https://down-vn.img.susercontent.com/file/b"]);
  assert.equal(d.rating, 4.9);
  assert.equal(d.category, "Thể Thao & Du Lịch");
});

test("máy chủ: giá gạch chỉ ghi lần đầu", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { recordObservation, cleanObservation } = await import("./observe");
  const { upsertProduct } = await import("./ingest");
  const q = await import("./queries");
  const t0 = new Date("2026-09-27T05:00:00Z");
  const H = 3_600_000;
  const URL1 = "https://shopee.vn/Vot-pickleball-i.1286901283.28407466123";

  assert.equal(cleanObservation({ url: URL1, price: 100_000, originalPrice: 90_000 })?.originalPrice, undefined, "giá gốc thấp hơn giá bán");
  assert.equal(cleanObservation({ url: URL1, price: 100_000, originalPrice: 900_000 })?.originalPrice, undefined, "giảm quá 80%");

  // Món mới từ tiện ích: có giá gạch
  const a = await recordObservation({ url: URL1, name: "Vợt pickleball Facolos", price: 1_079_000, originalPrice: 1_500_000 }, "1.1.1.1", t0);
  let p = (await q.getProduct(a.productId!))!;
  assert.equal(p.originalPrice, 1_500_000);
  assert.equal(p.discountPct, 28);
  // Lần sau giá gạch khác: giữ giá gốc cũ, chỉ cập nhật giá bán
  await recordObservation({ url: URL1, name: "Vợt pickleball Facolos", price: 999_000, originalPrice: 2_000_000 }, "2.2.2.2", new Date(t0.getTime() + H));
  p = (await q.getProduct(a.productId!))!;
  assert.equal(p.price, 999_000);
  assert.equal(p.originalPrice, 1_500_000);
  assert.equal(p.discountPct, 33);

  // Món nhập từ CSV (chưa có giá gốc, nguồn còn mới): bổ sung giá gạch + ảnh
  const csvId = await upsertProduct({ platform: "shopee", externalId: "2608753400", name: "Kính cường lực", price: 29_900, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x" }, t0);
  const URL2 = "https://shopee.vn/product/89827191/2608753400";
  const r = await recordObservation({ url: URL2, name: "Kính cường lực", price: 29_900, originalPrice: 59_000, image: "https://down-vn.img.susercontent.com/file/k" }, "3.3.3.3", new Date(t0.getTime() + H));
  assert.equal(r.status, "ignored");
  let c = (await q.getProduct(csvId))!;
  assert.equal(c.originalPrice, 59_000);
  assert.equal(c.discountPct, 49);
  assert.equal(c.imageUrl, "https://down-vn.img.susercontent.com/file/k");
  assert.equal(c.price, 29_900, "không đè giá nguồn còn mới");
  // Món CSV: bổ sung danh mục, ảnh phụ, số sao; danh mục đã có thì giữ, số sao cập nhật
  await recordObservation({ url: URL2, name: "Kính cường lực", price: 29_900, rating: 4.8, category: "Điện Thoại & Phụ Kiện", images: ["https://down-vn.img.susercontent.com/file/k2", "https://evil.com/x.png"] }, "7.7.7.7", new Date(t0.getTime() + 2 * H));
  c = (await q.getProduct(csvId))!;
  assert.equal(c.category, "Điện Thoại & Phụ Kiện");
  assert.deepEqual(c.images, ["https://down-vn.img.susercontent.com/file/k2"]);
  assert.equal(c.rating, 4.8);
  await recordObservation({ url: URL2, name: "Kính cường lực", price: 29_900, rating: 4.7, category: "Khác" }, "8.8.8.8", new Date(t0.getTime() + 2 * H));
  c = (await q.getProduct(csvId))!;
  assert.equal(c.category, "Điện Thoại & Phụ Kiện");
  assert.equal(c.rating, 4.7);
  // Đã có giá gốc: lần góp sau không đổi
  await recordObservation({ url: URL2, name: "Kính cường lực", price: 29_900, originalPrice: 45_000 }, "4.4.4.4", new Date(t0.getTime() + 2 * H));
  c = (await q.getProduct(csvId))!;
  assert.equal(c.originalPrice, 59_000);

  // Giá người dùng thấy lệch giá đang lưu: không lấy giá gạch (có thể thuộc phân loại khác)
  const otherId = await upsertProduct({ platform: "shopee", externalId: "15902920246", name: "Tất nam", price: 23_700, discountPct: 0, affiliateUrl: "https://s.shopee.vn/y" }, t0);
  await recordObservation({ url: "https://shopee.vn/product/570199605/15902920246", name: "Tất nam", price: 30_000, originalPrice: 50_000 }, "5.5.5.5", new Date(t0.getTime() + H));
  assert.equal((await q.getProduct(otherId))!.originalPrice, null);
  await dbm.closeDb();
});
