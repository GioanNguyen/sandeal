import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAddOns, reachableVouchers } from "./addon";
import type { CalcVoucher } from "./voucher";
import type { Product } from "@/db/schema";

const mk = (id: number, price: number, extra: Partial<Product> = {}) =>
  ({ id, platform: "shopee", name: `Món ${id}`, price, shopName: "Shop A", groupKey: null, realDropPct: 10, ...extra }) as Product;
const V: CalcVoucher[] = [
  { id: 1, title: "Giảm 50K đơn từ 300K", code: "SHOPEE50K", platform: "shopee", type: "fixed", value: 50_000, max: null, minSpend: 300_000 },
  { id: 2, title: "Freeship", platform: "shopee", type: "freeship", value: 30_000, max: null, minSpend: 0 },
  { id: 3, title: "Lazada 10%", platform: "lazada", type: "percent", value: 10, max: 100_000, minSpend: 200_000 },
];

test("mua kèm cho đủ mã: chỉ gợi ý khi gộp đơn rẻ hơn thật, cùng shop trước", () => {
  const p = mk(1, 220_000);
  assert.deepEqual(reachableVouchers(p, V).map((v) => v.id), [1], "chỉ mã giảm tiền cùng sàn, món chưa đủ đơn");
  assert.equal(reachableVouchers(mk(9, 350_000), V).length, 0, "đã đủ đơn thì không cần mua kèm");

  const r = pickAddOns(p, [mk(2, 80_000), mk(3, 90_000, { shopName: "Shop B" }), mk(4, 40_000), mk(5, 90_000, { platform: "lazada" })], V);
  assert.deepEqual(r.map((x) => x.item.id), [2, 3], "món 4 chưa đủ đơn 300K, món 5 khác sàn");
  const [a, b] = r;
  assert.equal(a.sameShop, true);
  // Mua riêng: 220K + 80K, mỗi đơn freeship -> 300K; gộp: 300K - 50K = 250K (freeship) -> tiết kiệm 50K
  assert.equal(a.separate, 300_000);
  assert.equal(a.together, 250_000);
  assert.equal(a.save, 50_000);
  // Khác shop: 2 lần ship (60K) nhưng chỉ 1 mã freeship 30K -> gộp 310K - 50K + 30K ship = 290K; riêng 310K
  assert.equal(b.sameShop, false);
  assert.equal(b.save, 20_000);

  // Cùng nhóm sản phẩm (cùng món) hoặc tiết kiệm quá ít thì bỏ
  assert.equal(pickAddOns(mk(1, 220_000, { groupKey: "g" }), [mk(6, 90_000, { groupKey: "g" })], V).length, 0);
  // Món thêm quá đắt so với phần còn thiếu (thiếu 80K mà gợi ý món 250K) thì bỏ
  assert.equal(pickAddOns(p, [mk(7, 250_000)], V).length, 0);
  const small: CalcVoucher[] = [{ ...V[0], value: 5_000 }];
  assert.equal(pickAddOns(p, [mk(2, 90_000)], small).length, 0, "tiết kiệm dưới 10K không đáng gợi ý");
});
