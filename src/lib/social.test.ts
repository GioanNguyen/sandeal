import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaption, buildDigestCaption, priceK, shareUrl } from "./social";

const p = {
  id: 7, platform: "shopee", name: "Tai nghe <ANC>", category: "Điện tử", price: 600_000, originalPrice: 1_200_000, realDropPct: 40,
} as unknown as Parameters<typeof buildCaption>[0];

test("nội dung bài đăng: tiêu đề nổi bật, số liệu thật, voucher, link và cảnh báo giá", () => {
  const link = shareUrl("https://sandeal.vn", p, "facebook");
  assert.equal(link, "https://sandeal.vn/product/tai-nghe-anc-7?utm_source=facebook&utm_medium=social");
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

test("bài tổng hợp Facebook: nhiều sản phẩm, giá thật, giờ lấy giá, lời nhắc kiểm tra", () => {
  const q = { ...p, id: 8, name: "Nồi chiên B", price: 1_290_000, realDropPct: 3, lastSeenAt: new Date("2026-09-27T04:00:00Z") } as typeof p;
  const c = buildDigestCaption(
    [
      { product: { ...p, lastSeenAt: new Date("2026-09-27T05:00:00Z") } as typeof p, link: "https://x/a", voucher: { code: "SALE50", price: 550_000 } },
      { product: q, link: "https://x/b" },
    ],
    { pageName: "Săn Deal Hot" },
  );
  assert.match(c, /^🔥 DEAL ĐÁNG CHÚ Ý HÔM NAY\n\nHôm nay, Săn Deal Hot giới thiệu/);
  assert.match(c, /🛍️ Tai nghe <ANC>\n💰 Giá hiện tại: 600\.000\s₫ \(giảm thật 40% so với giá thường ngày\)\n🎟 Nhập mã SALE50 còn 550\.000\s₫\n🔗 https:\/\/x\/a/);
  assert.match(c, /💰 Giá hiện tại: 1\.290\.000\s₫\n🔗 https:\/\/x\/b/, "giảm dưới 5% thì không ghi % giảm");
  assert.match(c, /Giá cập nhật lúc 11:00 27\/09/, "lấy giờ cũ nhất trong các món");
  assert.match(c, /kiểm tra giá cuối cùng trước khi đặt hàng/);
});
