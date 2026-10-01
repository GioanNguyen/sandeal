import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOT_SCRIPT } from "./boot";

test("script khởi động đúng cú pháp, đủ 2 phần (kiểu xem + giao diện)", () => {
  assert.doesNotThrow(() => new Function(BOOT_SCRIPT));
  assert.match(BOOT_SCRIPT, /getItem\("sd-view"\)==="list"\)d\.dataset\.view="list";/);
  assert.match(BOOT_SCRIPT, /getItem\("sd-theme"\)/);
});
