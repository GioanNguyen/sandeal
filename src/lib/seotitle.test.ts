import { test } from "node:test";
import assert from "node:assert/strict";
import { priceShort, productTitle, titleName } from "./seotitle";

test("giá ngắn", () => {
  assert.equal(priceShort(500), "500đ");
  assert.equal(priceShort(9_000), "9K");
  assert.equal(priceShort(9_500), "9,5K");
  assert.equal(priceShort(189_000), "189K");
  assert.equal(priceShort(1_000_000), "1tr");
  assert.equal(priceShort(1_250_000), "1,25tr");
  assert.equal(priceShort(12_500_000), "12,5tr");
});

test("tên gọn: bỏ ngoặc, phần sau |, không cắt giữa chữ", () => {
  assert.equal(titleName("[CHÍNH HÃNG] Quạt tích điện mini cầm tay | Bảo hành 12 tháng"), "Quạt tích điện mini cầm tay");
  const long = "Khăn giấy rút treo tường Topgia 1000 tờ làm từ bột gỗ thiên nhiên siêu dai";
  const t = titleName(long);
  assert.ok(t.length <= 40, t);
  assert.ok(long.startsWith(t));
  assert.ok(!t.endsWith(" "));
});

test("tiêu đề: giảm thật đi trước, giá luôn trong ~60 ký tự đầu", () => {
  const base = { name: "Quạt tích điện mini cầm tay 3 tốc độ pin 4000mAh siêu mát [CHÍNH HÃNG]", price: 189_000, platformLabel: "Shopee", gone: false };
  const a = productTitle({ ...base, realDropPct: 32.4 });
  assert.match(a, /189K, giảm thật 32% – Lịch sử giá Shopee$/);
  assert.ok(a.indexOf("189K") < 55, a);
  const b = productTitle({ ...base, realDropPct: 0, advice: { verdict: "wait", trackedDays: 20, nextSale: { name: "11.11 – Siêu sale", days: 14 } } });
  assert.match(b, /189K: mua hay chờ 11\.11\? – Lịch sử giá Shopee$/);
  const c = productTitle({ ...base, realDropPct: 2, advice: { verdict: "consider", trackedDays: 20, nextSale: null } });
  assert.match(c, /189K, có đang rẻ thật\? – Lịch sử giá Shopee$/);
  const d = productTitle({ ...base, realDropPct: 40, gone: true });
  assert.match(d, / – Lịch sử giá Shopee, báo khi có lại$/);
  assert.ok(!d.includes("189K"));
});
