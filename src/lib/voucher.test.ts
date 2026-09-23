import { test } from "node:test";
import assert from "node:assert/strict";
import { bestPlan, parseDiscount, type CalcVoucher } from "./voucher";

test("đọc mô tả mã", () => {
  assert.deepEqual(parseDiscount("Giảm 10% tối đa 100K"), { type: "percent", value: 10, max: 100000 });
  assert.deepEqual(parseDiscount("Giảm 50K đơn từ 300K"), { type: "fixed", value: 50000, max: null });
  assert.equal(parseDiscount("Freeship Xtra toàn quốc").type, "freeship");
  assert.deepEqual(parseDiscount("Hoàn xu 15% ngành Điện tử"), { type: "cashback", value: 15, max: null });
  assert.equal(parseDiscount("50.000đ").value, 50000);
});

const v = (id: number, type: CalcVoucher["type"], value: number | null, max: number | null, minSpend: number, platform = "shopee"): CalcVoucher => ({
  id, title: String(id), platform, type, value, max, minSpend,
});

test("chọn tổ hợp tốt nhất: 1 mã giảm + 1 freeship, đúng điều kiện đơn tối thiểu", () => {
  const list = [
    v(1, "fixed", 50_000, null, 300_000),
    v(2, "percent", 10, 100_000, 200_000),
    v(3, "freeship", null, 30_000, 0),
    v(4, "fixed", 200_000, null, 2_000_000), // chưa đủ đơn
    v(5, "percent", 50, null, 0, "lazada"), // khác sàn
  ];
  const p = bestPlan({ platform: "shopee", subtotal: 800_000, shipping: 25_000 }, list);
  assert.deepEqual(p.vouchers.map((x) => x.id).sort(), [2, 3]); // 10% = 80K > 50K
  assert.equal(p.discount, 80_000);
  assert.equal(p.shipSaved, 25_000);
  assert.equal(p.payNow, 720_000);
});

test("trần giảm và hoàn xu", () => {
  const p = bestPlan({ platform: "shopee", subtotal: 2_000_000, shipping: 0 }, [v(1, "percent", 10, 100_000, 0), v(2, "cashback", 15, 150_000, 0)]);
  assert.equal(p.vouchers[0].id, 2); // hoàn 150K > giảm 100K
  assert.equal(p.cashback, 150_000);
  assert.equal(p.effective, 1_850_000);
});
