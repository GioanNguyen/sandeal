import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaption, priceK, shareUrl } from "./social";

const p = {
  id: 7, platform: "shopee", name: "Tai nghe <ANC>", category: "Điện tử", price: 600_000, originalPrice: 1_200_000, realDropPct: 40,
} as unknown as Parameters<typeof buildCaption>[0];

test("nội dung bài đăng: tiêu đề nổi bật, số liệu thật, voucher, link và cảnh báo giá", () => {
  const link = shareUrl("https://sandeal.vn", 7, "facebook");
  assert.equal(link, "https://sandeal.vn/product/7?utm_source=facebook&utm_medium=social");
  const c = buildCaption(p, link, { variant: 0, voucher: { code: "SALE50", price: 550_000 } });
  assert.match(c, /^🔥 DEAL SỐC SHOPEE/);
  assert.match(c, /Giảm thật 40% so với giá thường ngày \(bớt 400K\)/);
  assert.match(c, /Giá: 1tr → 600K/);
  assert.match(c, /Voucher: nhập SALE50 còn 550K/);
  assert.match(c, /Xem deal: https:\/\/sandeal\.vn/);
  assert.match(c, /#dientu/);
  assert.match(c, /kiểm tra lại trên sàn/);
  const h = buildCaption(p, link, { html: true });
  assert.match(h, /<b>Tai nghe &lt;ANC&gt;<\/b>/);
  assert.match(h, /<s>1tr<\/s> → <b>600K<\/b>/);
  assert.notEqual(buildCaption(p, link, { variant: 0 }).split("\n")[0], buildCaption(p, link, { variant: 1 }).split("\n")[0]);
  assert.match(buildCaption(p, link, { recordLow: true }), /^🏆 GIÁ THẤP KỶ LỤC/);
  assert.equal(priceK(1_250_000), "1,25tr");
  assert.equal(priceK(329_000), "329K");
});
