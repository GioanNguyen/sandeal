import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { mapATCoupon } from "./accesstrade";
import { mapLazadaItem, signLazada } from "./lazada";
import { mapShopeeConversion, mapShopeeNode, signShopee } from "./shopee";
import { mapTikTokProduct, signTikTok } from "./tiktok";
import { slugify } from "@/lib/slug";

test("chữ ký Shopee = sha256(appId + ts + payload + secret)", () => {
  const h = createHash("sha256").update("1231700000000{}sec").digest("hex");
  assert.equal(signShopee("123", "sec", "{}", 1700000000), `SHA256 Credential=123, Timestamp=1700000000, Signature=${h}`);
});

test("chữ ký Lazada: path + key/value sắp xếp, HMAC in hoa", () => {
  const expect = createHmac("sha256", "s").update("/a/bapp_key1timestamp2").digest("hex").toUpperCase();
  assert.equal(signLazada("/a/b", { timestamp: "2", app_key: "1" }, "s"), expect);
});

test("chữ ký TikTok: bỏ sign/access_token, bọc secret", () => {
  const expect = createHmac("sha256", "s").update("s/p" + "app_key1timestamp2" + "{}" + "s").digest("hex");
  assert.equal(signTikTok("/p", { timestamp: "2", app_key: "1", sign: "x", access_token: "y" }, "{}", "s"), expect);
});

test("map dữ liệu các sàn", () => {
  const s = mapShopeeNode({ itemId: 9, productName: "A", priceMin: "80000", priceDiscountRate: 20, offerLink: "https://s.shopee.vn/x" });
  assert.equal(s.originalPrice, 100000);
  assert.equal(s.affiliateUrl, "https://s.shopee.vn/x");
  const l = mapLazadaItem({ productId: 1, productName: "B", discountPrice: 50, originalPrice: 100, totalCommissionRate: 8 });
  assert.equal(l?.discountPct, 50);
  assert.equal(l?.commissionRate, 0.08);
  const t = mapTikTokProduct({ id: "7", title: "C", sales_price: { minimum_amount: "90000" }, original_price: { minimum_amount: "120000" }, commission: { rate: 1500 } });
  assert.equal(t?.discountPct, 25);
  assert.equal(t?.commissionRate, 0.15);
  const v = mapATCoupon({ id: 1, merchant: "lazada", name: "Giảm 10%", discount_percentage: 10, aff_link: "https://go" });
  assert.equal(v?.platform, "lazada");
  assert.equal(mapATCoupon({ id: 2, merchant: "tiki", aff_link: "x" }), null);
  const c = mapShopeeConversion({ conversionId: 1, purchaseTime: 1700000000, totalCommission: "5000", orders: [{ orderId: "o", orderStatus: "COMPLETED", items: [{ itemPrice: "100000", qty: 2 }] }] });
  assert.equal(c.orderAmount, 200000);
  assert.equal(c.status, "completed");
});

test("slug tiếng Việt", () => {
  assert.equal(slugify("Làm đẹp & Sức khoẻ"), "lam-dep-suc-khoe");
  assert.equal(slugify("Điện tử"), "dien-tu");
});
