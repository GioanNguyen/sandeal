import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryDropFrom, saleDrop, saleForecast } from "./saleforecast";
import { buyAdvice } from "./advice";

const at = (s: string) => new Date(`${s}T12:00:00+07:00`);
const NOW = at("2026-10-01"); // còn 9 ngày tới 10.10
const sale99 = { start: new Date("2026-09-08T17:00:00Z"), end: new Date("2026-09-09T16:59:59Z") };

/** Giá 200k từ 1/8, 9.9 xuống `low`, 10/9 về 200k */
const hist = (low: number, from = "2026-08-01") => [
  { price: 200_000, capturedAt: at(from) },
  { price: low, capturedAt: new Date("2026-09-08T17:30:00Z") },
  { price: 200_000, capturedAt: at("2026-09-10") },
];

test("mức giảm của 1 món trong đợt sale", () => {
  assert.equal(saleDrop(hist(170_000), sale99), 0.15);
  assert.equal(saleDrop(hist(170_000, "2026-09-05"), sale99), null, "theo dõi chưa đủ 7 ngày trước sale");
  assert.equal(saleDrop([{ price: 200_000, capturedAt: at("2026-08-01") }], sale99), 0, "giá không đổi -> giảm 0");
});

test("mức giảm trung vị của danh mục, cần ≥ 5 món", () => {
  const hs = [hist(180_000), hist(170_000), hist(160_000), hist(190_000), hist(200_000)];
  assert.deepEqual(categoryDropFrom(hs, NOW), { ref: "9.9", median: 0.1, n: 5 });
  assert.equal(categoryDropFrom(hs.slice(0, 4), NOW), null);
});

test("ước tính giá ở 10.10", () => {
  // Món có dữ liệu riêng ở 9.9: giảm 15% -> dự kiến 170k, rẻ hơn 30k
  const a = buyAdvice(hist(170_000), 200_000, NOW);
  assert.equal(a.forecast?.sale, "10.10");
  assert.equal(a.forecast?.days, 9);
  assert.equal(a.forecast?.basis, "own");
  assert.equal(a.forecast?.expected, 170_000);
  assert.equal(a.forecast?.save, 30_000);
  // Món mới nhập (chưa có lịch sử) -> dùng số liệu danh mục
  const fresh = buyAdvice([{ price: 82_000, capturedAt: at("2026-09-30") }], 82_000, NOW, { category: { name: "Thời trang", drop: { ref: "9.9", median: 0.12, n: 8 } } });
  assert.equal(fresh.verdict, "new");
  assert.equal(fresh.forecast?.basis, "category");
  assert.equal(fresh.forecast?.expected, 72_000);
  assert.match(fresh.forecast!.basisText, /8 món Thời trang ở 9\.9/);
  // Đang giảm sâu hơn mức sale thường thấy -> không hứa rẻ thêm
  const low = saleForecast({ price: 150_000, usual: 200_000, nextSale: { name: "Siêu sale 10.10", days: 9 }, ownDrops: [{ ref: "9.9", drop: 0.15 }] });
  assert.equal(low?.save, 0);
  // Không có sale lớn trong 21 ngày / không có số liệu -> không ước tính
  assert.equal(buyAdvice(hist(170_000), 200_000, at("2026-10-12")).forecast, null);
  assert.equal(buyAdvice([{ price: 1, capturedAt: at("2026-09-30") }], 100_000, NOW).forecast, null);
});
