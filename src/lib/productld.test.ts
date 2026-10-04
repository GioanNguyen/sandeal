/** Dữ liệu có cấu trúc trang sản phẩm (trang so giá) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LD_NAME_MAX, ldName, productJsonLd } from "./productld";

const base = { name: "Tai nghe Xiaomi Redmi Buds 4", url: "https://sandealgiare.com/product/x-1", sku: "shopee-1", images: ["https://a/b.jpg"], description: "d", price: 300_000, gone: false };

test("AggregateOffer (trang so giá), không khai Offer của người bán, có thương hiệu khi nhận ra", () => {
  const ld = productJsonLd({ ...base, brand: "Xiaomi" })!;
  assert.equal(ld.offers["@type"], "AggregateOffer");
  assert.deepEqual(ld.offers, { "@type": "AggregateOffer", priceCurrency: "VND", lowPrice: 300_000, highPrice: 300_000, offerCount: 1 });
  assert.deepEqual(ld.brand, { "@type": "Brand", name: "Xiaomi" });
  assert.ok(!("aggregateRating" in ld) && !("review" in ld));
  assert.equal(JSON.stringify(ld).includes("shippingDetails"), false);
  assert.equal(productJsonLd(base)!.brand, undefined);
});

test("nhiều sàn: giá thấp nhất / cao nhất / số nơi bán", () => {
  const ld = productJsonLd({ ...base, price: 300_000, otherPrices: [280_000, 300_000, 350_000] })!;
  assert.equal(ld.offers.lowPrice, 280_000);
  assert.equal(ld.offers.highPrice, 350_000);
  assert.equal(ld.offers.offerCount, 3);
});

test("món vắng trên sàn: không khai Product (Google bắt buộc có offers)", () => {
  assert.equal(productJsonLd({ ...base, gone: true }), null);
});

test("tên quá dài: cắt còn ≤ 150 ký tự ở ranh giới từ", () => {
  const long = "Quạt Mini Cầm Tay 199 Tốc Độ Gió Mini Quạt Di Động Có Dây Đeo, Tốc Độ Gió, Gấp Gọn Tiện Lợi ".repeat(3);
  const n = ldName(long);
  assert.ok(n.length <= LD_NAME_MAX, String(n.length));
  assert.ok(n.endsWith("…"));
  assert.ok(!/\s…$/.test(n));
  assert.ok(long.startsWith(n.slice(0, -1)));
  assert.equal(ldName("  Tên   ngắn  "), "Tên ngắn");
  assert.equal(productJsonLd({ ...base, name: long })!.name.length <= 150, true);
});
