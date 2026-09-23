import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSale, saleTomorrow, upcomingSales } from "./sales";

// 23/09/2026 10:00 giờ VN
const now = new Date("2026-09-23T03:00:00Z");

test("các đợt sale sắp tới theo thứ tự", () => {
  const keys = upcomingSales(now, 5).map((e) => e.key);
  assert.deepEqual(keys, ["2026-09-25", "2026-10-10", "2026-10-15", "2026-10-25", "2026-11-11"]);
});

test("đợt lớn kế tiếp là 10.10, bắt đầu 00:00 giờ VN", () => {
  const e = nextSale(now, true);
  assert.equal(e.name, "Siêu sale 10.10");
  assert.equal(e.start.toISOString(), "2026-10-09T17:00:00.000Z");
});

test("Black Friday 2026 là 27/11, nhắc tối hôm trước", () => {
  assert.ok(upcomingSales(now, 12).some((e) => e.key === "2026-11-27" && e.name === "Black Friday"));
  assert.equal(saleTomorrow(new Date("2026-10-09T13:00:00Z"))?.key, "2026-10-10"); // 20h ngày 9/10
  assert.equal(saleTomorrow(now), undefined);
});

test("đợt đang diễn ra vẫn được tính", () => {
  const during = new Date("2026-10-10T05:00:00Z"); // 12h trưa 10/10 giờ VN
  assert.equal(upcomingSales(during, 1)[0].key, "2026-10-10");
});
