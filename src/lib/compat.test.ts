import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Mã chạy trên trình duyệt không được dùng lookbehind trong regex ((?<=…) / (?<!…)):
 * Safari/iOS < 16.4 (trình duyệt trong app Facebook, Zalo trên iPhone chưa cập nhật) báo
 * "Invalid regular expression: invalid group specifier name" và làm trắng cả trang.
 */
test("không dùng regex lookbehind trong src (trừ worker/adapters chạy trên máy chủ)", () => {
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (!["worker", "adapters"].includes(f.name)) walk(p);
      } else if (/\.tsx?$/.test(f.name) && !/\.test\.ts$/.test(f.name)) {
        fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
          if (/\(\?<[=!]/.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${p}:${i + 1}`);
        });
      }
    }
  };
  walk(path.join(process.cwd(), "src"));
  assert.deepEqual(bad, []);
});
