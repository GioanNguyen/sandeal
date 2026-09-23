import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDealScore, median } from "./score";

const now = new Date("2026-09-23T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("giảm thật so với trung vị 30 ngày cho điểm cao", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ price: 1_000_000, capturedAt: daysAgo(25 - i) }));
  const r = computeDealScore({ price: 600_000, discountPct: 40, rating: 4.8, sold: 5000, history, now });
  assert.equal(r.realDropPct, 40);
  assert.equal(r.inflatedBeforeSale, false);
  assert.ok(r.score > 65, `score=${r.score}`);
});

test("nâng giá rồi 'giảm' về giá cũ bị phạt", () => {
  const history = [
    ...Array.from({ length: 10 }, (_, i) => ({ price: 500_000, capturedAt: daysAgo(13 - i) })),
    { price: 900_000, capturedAt: daysAgo(3) },
    { price: 900_000, capturedAt: daysAgo(2) },
  ];
  const r = computeDealScore({ price: 500_000, discountPct: 45, rating: 4.5, sold: 100, history, now });
  assert.equal(r.inflatedBeforeSale, true);
  assert.ok(r.score < 40, `score=${r.score}`);
});

test("chưa đủ lịch sử thì dùng một nửa mức giảm khai", () => {
  const r = computeDealScore({ price: 100, discountPct: 50, history: [{ price: 100, capturedAt: daysAgo(1) }], now });
  assert.equal(r.realDropPct, 25);
});
