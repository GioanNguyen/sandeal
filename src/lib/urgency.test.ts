import { test } from "node:test";
import assert from "node:assert/strict";
import { levelOf } from "./urgency";

test("mức khẩn cấp theo thời gian còn lại", () => {
  const h = 3_600_000;
  assert.equal(levelOf(-1), "ended");
  assert.equal(levelOf(0.5 * h), "critical");
  assert.equal(levelOf(2 * h), "urgent");
  assert.equal(levelOf(10 * h), "soon");
  assert.equal(levelOf(30 * h), "calm");
});
