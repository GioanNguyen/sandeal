/** Góp giá từ tiện ích: đọc dữ liệu trang đúng sản phẩm, chống dữ liệu sai, không đè nguồn API còn mới */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

const require = createRequire(import.meta.url);
require("../../extension/extract.js");
const X = (globalThis as unknown as {
  SanDealExtract: {
    fromData: (ld: unknown[], meta: Record<string, string>, href: string, title?: string) => { name: string; price: number; image?: string; rating?: number } | null;
    money: (v: unknown) => number;
    nameMatchesTitle: (name: string, title: string) => boolean;
  };
}).SanDealExtract;

const SHOPEE = "https://shopee.vn/Tai-nghe-Bluetooth-X-i.111.222333";

test("tiện ích: đọc JSON-LD đúng sản phẩm đang xem", () => {
  const T = "Tai nghe Bluetooth X | Shopee Việt Nam";
  const ld = [{ "@context": "https://schema.org", "@type": "Product", name: "Tai nghe Bluetooth X", image: ["https://down-vn.img.susercontent.com/file/abc"], url: SHOPEE,
    offers: { "@type": "AggregateOffer", lowPrice: "259000", highPrice: "299000", priceCurrency: "VND", availability: "http://schema.org/InStock" }, aggregateRating: { ratingValue: "4.8" } }];
  assert.deepEqual(X.fromData(ld, {}, SHOPEE, T), { name: "Tai nghe Bluetooth X", price: 259000, image: "https://down-vn.img.susercontent.com/file/abc", rating: 4.8 });
  // Trang một-trang còn dữ liệu của sản phẩm trước: không khớp mã -> không gửi
  assert.equal(X.fromData(ld, {}, "https://shopee.vn/Khac-i.111.999999", "Khác | Shopee"), null);
  // JSON-LD không ghi url: chỉ nhận khi tên khớp tiêu đề tab
  const noUrl = [{ "@type": "Product", name: "Tai nghe Bluetooth X", offers: { price: 150000, priceCurrency: "VND" } }];
  assert.equal(X.fromData(noUrl, { canonical: SHOPEE }, SHOPEE, T)?.price, 150000);
  assert.equal(X.fromData(noUrl, {}, SHOPEE, "Sản phẩm khác | Shopee"), null, "không có gì chứng minh đúng sản phẩm");
  // Hết hàng / khác tiền tệ: không gửi
  assert.equal(X.fromData([{ ...ld[0], offers: { price: 1, availability: "https://schema.org/OutOfStock" } }], {}, SHOPEE, T), null);
  assert.equal(X.fromData([{ ...ld[0], offers: { price: 10, priceCurrency: "USD" } }], {}, SHOPEE, T), null);
  // @graph + thẻ meta dự phòng + giá viết kiểu "129.000"
  assert.equal(X.fromData([{ "@graph": [{ "@type": "WebPage" }, ld[0]] }], {}, SHOPEE, T)?.price, 259000);
  assert.equal(X.fromData([], { "og:url": SHOPEE, "og:title": "Tai nghe Bluetooth X", "product:price:amount": "129.000", "product:price:currency": "VND" }, SHOPEE, T)?.price, 129000);
  assert.equal(X.money("129000.00"), 129000);
});

test("tiện ích: chuyển sang sản phẩm khác trên Shopee (trang không tải lại) không đọc nhầm dữ liệu cũ", () => {
  // Đang ở iPhone, nhưng JSON-LD/meta vẫn của món trước (ốp lưng 33.900đ); canonical và tiêu đề đã đổi sang iPhone
  const IPHONE = "https://shopee.vn/Apple-iPhone-17-Pro-Max-256GB-Chinh-hang-ZP-A-i.308461157.42568221380";
  const title = "Apple iPhone 17 Pro Max 256GB Chính hãng ZP/A | Shopee Việt Nam";
  const stale = [{ "@type": "Product", name: "Ốp lưng silicon trong suốt", url: "https://shopee.vn/Op-lung-i.555.777", offers: { price: "33900", priceCurrency: "VND" } }];
  const meta = { canonical: IPHONE, "og:url": "https://shopee.vn/Op-lung-i.555.777", "og:title": "Ốp lưng silicon trong suốt", "product:price:amount": "33900" };
  assert.equal(X.fromData(stale, meta, IPHONE, title), null);
  // JSON-LD không có url nhưng tên là của món cũ -> không khớp tiêu đề -> bỏ
  assert.equal(X.fromData([{ "@type": "Product", name: "Ốp lưng silicon trong suốt", offers: { price: "33900" } }], { canonical: IPHONE }, IPHONE, title), null);
  // Khi dữ liệu mới đã tải: nhận đúng giá iPhone
  const fresh = [{ "@type": "Product", name: "Apple iPhone 17 Pro Max 256GB Chính hãng ZP/A", url: IPHONE, offers: { "@type": "AggregateOffer", lowPrice: "35390000", highPrice: "35590000", priceCurrency: "VND" } }];
  assert.equal(X.fromData(fresh, { canonical: IPHONE }, IPHONE, title)?.price, 35_390_000);
  assert.equal(X.nameMatchesTitle("Apple iPhone 17 Pro Max 256GB Chính hãng ZP/A", title), true);
});

test("máy chủ: ghi nhận giá góp, chống spam và giá bất thường", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { recordObservation, cleanObservation } = await import("./observe");
  const q = await import("./queries");
  const av = await import("./availability");
  const { upsertProduct } = await import("./ingest");
  const t0 = new Date("2026-09-27T05:00:00Z");
  const H = 3_600_000;

  assert.equal(cleanObservation({ url: "https://example.com/x", price: 1000 }), null, "không phải link sàn");
  assert.equal(cleanObservation({ url: SHOPEE, price: 5 }), null, "giá vô lý");
  assert.equal(cleanObservation({ url: SHOPEE, price: 99000, image: "https://evil.com/a.png" })?.image, undefined, "ảnh ngoài máy chủ ảnh của sàn bị bỏ");

  const obs = { url: SHOPEE, name: "Tai nghe Bluetooth X", price: 259000, image: "https://down-vn.img.susercontent.com/file/abc" };
  const a = await recordObservation(obs, "1.1.1.1", t0);
  assert.equal(a.status, "created");
  const p = (await q.getProduct(a.productId!))!;
  assert.equal(p.priceSource, "ext");
  assert.equal(p.affiliateUrl, "https://shopee.vn/product/111/222333");
  assert.equal((await recordObservation({ ...obs, price: 250000 }, "1.1.1.1", new Date(t0.getTime() + 10 * 60_000))).status, "dup", "cùng người trong 30 phút");

  // Tên trùng hẳn món khác cùng sàn (dữ liệu còn sót khi chuyển trang): không tạo món mới
  const stale = await recordObservation({ url: "https://shopee.vn/iPhone-i.308461157.42568221380", name: "Tai nghe Bluetooth X", price: 33900 }, "9.9.9.9", t0);
  assert.equal(stale.status, "invalid");

  // Giá lệch nhỏ: áp ngay; lệch > 50%: chờ người thứ 2
  assert.equal((await recordObservation({ ...obs, price: 239000 }, "2.2.2.2", new Date(t0.getTime() + H))).status, "updated");
  assert.equal((await q.getProduct(a.productId!))!.price, 239000);
  assert.equal((await recordObservation({ ...obs, price: 9000 }, "3.3.3.3", new Date(t0.getTime() + 2 * H))).status, "pending");
  assert.equal((await q.getProduct(a.productId!))!.price, 239000, "một người báo giá lạ không đổi giá");
  assert.equal((await recordObservation({ ...obs, price: 9100 }, "4.4.4.4", new Date(t0.getTime() + 3 * H))).status, "updated", "người thứ 2 xác nhận (±2%)");
  assert.equal((await q.getProduct(a.productId!))!.price, 9100);

  // Món từ API còn mới (≤ 24h): không đè
  const apiId = await upsertProduct({ platform: "lazada", externalId: "555", name: "Nồi chiên", price: 900000, discountPct: 0, affiliateUrl: "https://aff/555" }, t0);
  const r = await recordObservation({ url: "https://www.lazada.vn/products/noi-chien-i555.html", name: "x", price: 800000 }, "5.5.5.5", new Date(t0.getTime() + H));
  assert.equal(r.status, "ignored");
  assert.equal((await q.getProduct(apiId))!.price, 900000);
  // Quá 24h: nhận giá, giữ link tiếp thị và tên từ API, nguồn giá đổi sang "ext"
  const r2 = await recordObservation({ url: "https://www.lazada.vn/products/noi-chien-i555.html", name: "tên khác", price: 850000 }, "6.6.6.6", new Date(t0.getTime() + 30 * H));
  assert.equal(r2.status, "updated");
  const api = (await q.getProduct(apiId))!;
  assert.equal(api.price, 850000);
  assert.equal(api.affiliateUrl, "https://aff/555");
  assert.equal(api.name, "Nồi chiên");
  assert.equal(api.priceSource, "ext");

  // Món nguồn "ext" không bị coi là "không còn thấy trên sàn"
  assert.equal(av.isUnavailable({ ...p, lastSeenAt: new Date(t0.getTime() - 30 * 24 * H) }, await av.platformLatest()), false);
});
