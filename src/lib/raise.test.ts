/** "Ai nâng giá trước sale": phân loại món, tỉ lệ theo shop/danh mục */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

const DAY = 86_400_000;

test("phân loại món tăng giá trước mốc", async () => {
  const { classifyRaise } = await import("./salepages");
  const ref = Date.UTC(2026, 10, 10, 17); // 0h 11/11 giờ VN
  const pts = (raiseTo: number | null) => [
    { price: 100_000, at: ref - 40 * DAY },
    ...(raiseTo ? [{ price: raiseTo, at: ref - 7 * DAY }] : []),
    { price: 95_000, at: ref + 1 * 3_600_000 },
  ];
  const up = classifyRaise(pts(120_000), ref, ref + DAY)!;
  assert.equal(up.base, 100_000);
  assert.equal(up.peak, 120_000);
  assert.equal(up.raised, true);
  assert.equal(up.saleLow, 95_000);
  assert.equal(classifyRaise(pts(105_000), ref, null)!.raised, false, "tăng 5% chưa tính");
  assert.equal(classifyRaise([{ price: 1, at: ref - 10 * DAY }], ref, null), null, "theo dõi chưa đủ 20 ngày");
});

test("tỉ lệ theo shop, chỉ nhóm đủ mẫu", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { upsertProduct } = await import("./ingest");
  const { raiseReport } = await import("./salepages");
  const now = new Date("2026-10-30T05:00:00Z"); // trước 11.11
  const mk = async (id: string, shop: string, raise: boolean) => {
    const p = { platform: "shopee" as const, externalId: id, name: `Món ${id}`, shopName: shop, category: "Nhà cửa", discountPct: 0, affiliateUrl: "https://s.shopee.vn/x" };
    await upsertProduct({ ...p, price: 100_000 }, new Date(now.getTime() - 40 * DAY));
    if (raise) await upsertProduct({ ...p, price: 125_000 }, new Date(now.getTime() - 5 * DAY));
  };
  for (let i = 0; i < 4; i++) await mk(`a${i}`, "Shop A", i < 3); // 3/4 tăng
  for (let i = 0; i < 6; i++) await mk(`b${i}`, "Shop B", false); // 0/6
  await mk("c0", "Shop C", true); // 1 món: không đủ mẫu
  const { sale11 } = { sale11: { key: "2026-11-11", name: "Siêu sale 11.11", kind: "double" as const, start: new Date("2026-11-10T17:00:00Z"), end: new Date("2026-11-11T16:59:59Z"), note: "" } };
  const r = await raiseReport(sale11, now);
  assert.equal(r.past, false);
  assert.equal(r.total, 11);
  assert.equal(r.raised.length, 4);
  assert.deepEqual(r.byShop.map((g) => [g.label, g.raised, g.total]), [["Shop A", 3, 4], ["Shop B", 0, 6]]);
  assert.deepEqual(r.byCategory.map((g) => [g.label, g.raised, g.total]), [["Nhà cửa", 4, 11]]);
  await dbm.closeDb();
});
