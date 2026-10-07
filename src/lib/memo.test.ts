/** Bộ nhớ đệm ngắn hạn: dùng chung kết quả trong thời hạn, lượt gọi trùng lúc chỉ chạy 1 lần, lỗi không bị giữ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memo, memoClear } from "./memo";

test("memo dùng chung kết quả, gộp lượt gọi trùng lúc, không giữ lỗi", async () => {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    let n = 0;
    const fn = async () => { n++; await new Promise((r) => setTimeout(r, 5)); return n; };
    const [a, b] = await Promise.all([memo("t:a", 1000, fn), memo("t:a", 1000, fn)]);
    assert.equal(a, 1); assert.equal(b, 1); assert.equal(n, 1);
    assert.equal(await memo("t:a", 1000, fn), 1, "trong thời hạn: không chạy lại");
    assert.equal(await memo("t:a", 0, fn), 2, "hết hạn: chạy lại");
    let fail = true;
    const flaky = async () => { if (fail) throw new Error("x"); return "ok"; };
    await assert.rejects(memo("t:b", 1000, flaky));
    await new Promise((r) => setTimeout(r, 0));
    fail = false;
    assert.equal(await memo("t:b", 1000, flaky), "ok", "lỗi không bị giữ lại");
    memoClear("t:");
    assert.equal(await memo("t:a", 1000, fn), 3, "xoá đệm thì chạy lại");
  } finally {
    if (saved !== undefined) process.env.NODE_TEST_CONTEXT = saved;
  }
});
