import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductUrl, refFromInput } from "./links";

test("nhận link Shopee", () => {
  assert.deepEqual(parseProductUrl("https://shopee.vn/Tai-nghe-Bluetooth-ANC-i.123456.7890123?sp_atk=abc"), {
    platform: "shopee", shopId: "123456", externalId: "7890123", url: "https://shopee.vn/product/123456/7890123",
  });
  assert.equal(parseProductUrl("shopee.vn/product/11/22")?.externalId, "22");
});

test("nhận link Lazada, TikTok", () => {
  assert.equal(parseProductUrl("https://www.lazada.vn/products/noi-chien-khong-dau-i2468013579-s13579.html?spm=x")?.externalId, "2468013579");
  assert.equal(parseProductUrl("https://shop.tiktok.com/view/product/1729384756123?region=VN")?.platform, "tiktok");
});

test("link lạ bị từ chối", () => {
  assert.equal(parseProductUrl("https://tiki.vn/abc-p123.html"), null);
  assert.equal(parseProductUrl("không phải link"), null);
});

test("mở link rút gọn qua chuyển hướng, chặn host lạ", async () => {
  const fake = (async (url: string) => {
    const map: Record<string, string> = {
      "https://s.shopee.vn/abc": "https://shopee.vn/universal-link/x",
      "https://vt.tiktok.com/zz": "https://evil.example/redirect",
    };
    return new Response(null, { status: 302, headers: { location: url === "https://s.shopee.vn/abc" ? "https://shopee.vn/San-pham-i.5.6" : map[url] } });
  }) as unknown as typeof fetch;
  assert.equal((await refFromInput("https://s.shopee.vn/abc", fake))?.externalId, "6");
  assert.equal(await refFromInput("https://vt.tiktok.com/zz", fake), null);
});

test("link sản phẩm thường cho quản trị: ưu tiên link nguồn, suy từ mã, không có thì tìm theo tên", async () => {
  const { plainProductUrl } = await import("./links");
  assert.deepEqual(plainProductUrl({ platform: "shopee", externalId: "222", name: "x", productUrl: "https://shopee.vn/product/111/222", affiliateUrl: "https://s.shopee.vn/abc" }), { url: "https://shopee.vn/product/111/222", exact: true });
  assert.deepEqual(plainProductUrl({ platform: "shopee", externalId: "222", name: "x", affiliateUrl: "https://shopee.vn/Ao-thun-i.111.222" }), { url: "https://shopee.vn/product/111/222", exact: true });
  assert.deepEqual(plainProductUrl({ platform: "lazada", externalId: "998877", name: "x", affiliateUrl: "https://c.lazada.vn/t/abc" }), { url: "https://www.lazada.vn/products/i998877.html", exact: true });
  assert.deepEqual(plainProductUrl({ platform: "tiktok", externalId: "17293847", name: "x", affiliateUrl: "https://vt.tiktok.com/x" }), { url: "https://shop.tiktok.com/view/product/17293847", exact: true });
  const s = plainProductUrl({ platform: "shopee", externalId: "222", name: "Ốp lưng iPhone 15", affiliateUrl: "https://s.shopee.vn/abc" });
  assert.equal(s.exact, false);
  assert.equal(s.url, "https://shopee.vn/search?keyword=%E1%BB%90p%20l%C6%B0ng%20iPhone%2015");
});
