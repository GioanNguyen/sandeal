import { test } from "node:test";
import assert from "node:assert/strict";
import { buyAdvice } from "./advice";
import { salesBetween } from "./sales";

const DAY = 86_400_000;
const at = (s: string) => new Date(s);
const now = at("2026-09-24T05:00:00Z"); // 12h trưa 24/9 giờ VN; 10.10 còn 16 ngày

test("chưa đủ 7 ngày -> chưa kết luận", () => {
  const a = buyAdvice([{ price: 500_000, capturedAt: new Date(now.getTime() - 3 * DAY) }], 450_000, now);
  assert.equal(a.verdict, "new");
});

test("đang ở đáy, sale trước không rẻ hơn -> nên mua", () => {
  const h = [
    { price: 500_000, capturedAt: at("2026-08-01T00:00:00Z") },
    { price: 480_000, capturedAt: at("2026-09-08T17:00:00Z") }, // 9.9 giờ VN
    { price: 500_000, capturedAt: at("2026-09-10T00:00:00Z") },
    { price: 420_000, capturedAt: at("2026-09-23T00:00:00Z") },
  ];
  const a = buyAdvice(h, 420_000, now);
  assert.equal(a.verdict, "buy");
  assert.equal(a.low, 420_000);
  assert.ok(a.sales.some((s) => s.short === "9.9" && s.low === 480_000));
  assert.ok(a.cheaperThanPct > 90);
});

test("sale lớn sắp tới & dịp sale trước rẻ hơn nhiều -> nên chờ", () => {
  const h = [
    { price: 500_000, capturedAt: at("2026-08-01T00:00:00Z") },
    { price: 350_000, capturedAt: at("2026-09-08T17:00:00Z") }, // 9.9 xuống 350K
    { price: 500_000, capturedAt: at("2026-09-09T17:00:00Z") },
    { price: 470_000, capturedAt: at("2026-09-20T00:00:00Z") },
  ];
  const a = buyAdvice(h, 470_000, now);
  assert.equal(a.verdict, "wait");
  assert.match(a.title, /10\.10/);
  assert.ok(a.reasons.some((r) => r.includes("350.000")));
});

test("giá cao hơn thường ngày -> chưa nên mua", () => {
  const h = [
    { price: 300_000, capturedAt: at("2026-07-01T00:00:00Z") },
    { price: 360_000, capturedAt: at("2026-09-22T00:00:00Z") },
  ];
  const a = buyAdvice(h, 360_000, now);
  assert.equal(a.verdict, "wait");
  assert.ok(a.belowUsualPct < 0);
});

test("lịch sale trong khoảng", () => {
  const s = salesBetween(at("2026-08-01T00:00:00Z"), at("2026-11-30T00:00:00Z"));
  assert.deepEqual(s.map((e) => e.key), ["2026-08-08", "2026-09-09", "2026-10-10", "2026-11-11", "2026-11-27"]);
});
