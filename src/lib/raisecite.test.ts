/** Báo cáo nâng giá trước sale: câu phát hiện chính, câu trích dẫn, CSV */
import { test } from "node:test";
import assert from "node:assert/strict";
import { raiseCsv, raiseSummary } from "./raisecite";

const prod = (id: number) => ({ id, name: `Món ${id}`, platform: "shopee" }) as never;
const report = (opts: { total: number; raised: number; saleLows?: (number | null)[] }) => {
  const raised = Array.from({ length: opts.raised }, (_, i) => ({ product: prod(i), base: 100, peak: 120 + i, raised: true, saleLow: opts.saleLows?.[i] ?? null }));
  return {
    ref: new Date(),
    past: true,
    total: opts.total,
    raised,
    rate: opts.raised / opts.total,
    byShop: [{ key: "s", label: "Shop, A", platform: "shopee", total: 5, raised: 2, rate: 0.4 }],
    byCategory: [
      { key: "a", label: "Sắc Đẹp", total: 10, raised: 5, rate: 0.5 },
      { key: "b", label: "Nhà Cửa", total: 4, raised: 1, rate: 0.25 },
    ],
    byPlatform: [
      { key: "shopee", label: "Shopee", platform: "shopee", total: 20, raised: 5, rate: 0.25 },
      { key: "lazada", label: "Lazada", platform: "lazada", total: 12, raised: 1, rate: 1 / 12 },
    ],
  } as unknown as Parameters<typeof raiseSummary>[0];
};

test("phát hiện chính và câu trích dẫn có số liệu, nguồn, ngày", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  const r = report({ total: 32, raised: 6, saleLows: [130, 125, 90, 140, null, 100] });
  const s = raiseSummary(r, { title: "11.11", upcoming: false, url: "https://sandealgiare.com/nang-gia/11-11-2026", host: "sandealgiare.com", now });
  assert.equal(s.enough, true);
  assert.match(s.findings[0], /^19% trong 32 sản phẩm .* tăng giá từ 8% trở lên trong 14 ngày trước 11\.11\.$/);
  assert.match(s.findings[1], /\+22%/, "trung vị mức tăng");
  assert.equal(s.notCheaper?.of, 5);
  assert.equal(s.notCheaper?.n, 4, "ngày sale vẫn đắt hơn 95% giá cũ");
  assert.ok(s.findings.some((f) => /Sắc Đẹp \(50%, 5\/10 món\)/.test(f)));
  assert.ok(s.findings.some((f) => /Theo sàn: Shopee 25%, Lazada 8%/.test(f)));
  assert.match(s.citation, /^Theo số liệu của Săn Deal \(sandealgiare\.com\) cập nhật ngày 12\/11\/2026, 19% trong 32 sản phẩm/);
  assert.match(s.citation, /Nguồn: https:\/\/sandealgiare\.com\/nang-gia\/11-11-2026$/);

  const few = raiseSummary(report({ total: 6, raised: 2 }), { title: "12.12", upcoming: true, url: "u", host: "h" });
  assert.equal(few.enough, false);
  assert.deepEqual(few.findings, []);
  assert.equal(few.citation, "");
});

test("CSV: có BOM, ghi chú nguồn, tổng + theo sàn/danh mục/shop, ô có dấu phẩy được bọc ngoặc kép", () => {
  const csv = raiseCsv(report({ total: 32, raised: 6 }), { title: "11.11", url: "https://x/nang-gia/11-11-2026", now: new Date("2026-11-12T05:00:00Z") });
  assert.ok(csv.startsWith("﻿# Săn Deal"));
  const lines = csv.trim().split("\n");
  assert.ok(lines.includes("nhom,ten,san,so_mon_tang_gia,tong_so_mon,ti_le_phan_tram"));
  assert.ok(lines.includes("tong,11.11,,6,32,18.8"));
  assert.ok(lines.includes("danh_muc,Sắc Đẹp,,5,10,50"));
  assert.ok(lines.includes('shop,"Shop, A",shopee,2,5,40'));
  assert.ok(lines.some((l) => l.startsWith("san,Lazada,lazada,1,12,")));
});
