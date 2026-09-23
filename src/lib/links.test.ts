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
