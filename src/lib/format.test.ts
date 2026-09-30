import { test } from "node:test";
import assert from "node:assert/strict";
import { soldText } from "./format";

test("số đã bán: 23k+, 1tr+ (làm tròn xuống)", () => {
  assert.equal(soldText(850), "850");
  assert.equal(soldText(1000), "1k+");
  assert.equal(soldText(1290), "1,2k+");
  assert.equal(soldText(9999), "9,9k+");
  assert.equal(soldText(23_456), "23k+");
  assert.equal(soldText(999_999), "999k+");
  assert.equal(soldText(1_000_000), "1tr+");
  assert.equal(soldText(1_560_000), "1,5tr+");
  assert.equal(soldText(12_300_000), "12tr+");
  assert.equal(soldText(null), "0");
});
