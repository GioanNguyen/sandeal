import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaption, shareUrl } from "./social";

const p = {
  id: 7, platform: "shopee", name: "Tai nghe <ANC>", category: "Điện tử", price: 600_000, originalPrice: 1_200_000, realDropPct: 40,
} as unknown as Parameters<typeof buildCaption>[0];

test("nội dung bài đăng có số liệu thật, link và cảnh báo giá", () => {
  const link = shareUrl("https://sandeal.vn", 7, "facebook");
  assert.equal(link, "https://sandeal.vn/product/7?utm_source=facebook&utm_medium=social");
  const c = buildCaption(p, link, { variant: 1 });
  assert.match(c, /Rẻ hơn thường ngày 400\.000/);
  assert.match(c, /Giá: 600\.000/);
  assert.match(c, /#dientu/);
  assert.match(c, /kiểm tra lại trên sàn/);
  const h = buildCaption(p, link, { html: true });
  assert.match(h, /<b>Tai nghe &lt;ANC&gt;<\/b>/);
  assert.notEqual(buildCaption(p, link, { variant: 0 }).split("\n")[0], c.split("\n")[0]);
});
