/** Quản trị › Ngành hàng: hoa hồng, tỉ lệ bấm mua, tỉ lệ đặt cảnh báo theo danh mục */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";

let ingest: typeof import("./ingest");
let cs: typeof import("./categorystats");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  cs = await import("./categorystats");
  schema = await import("@/db/schema");
});

const NOW = new Date();
const h = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

test("số liệu theo ngành: hoa hồng / đơn, lượt xem, bấm mua, cảnh báo, hoa hồng ước tính / 1.000 lượt xem", async () => {
  const add = (id: string, category: string | undefined, price: number, commissionRate?: number) =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Món ${id}`, price, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", category, commissionRate }, NOW);
  const nail1 = await add("1", "Làm đẹp", 50_000, 0.2);
  const nail2 = await add("2", "Làm đẹp", 30_000, 0.1);
  const phone = await add("3", "Điện thoại", 5_000_000, 0.025);
  const none = await add("4", undefined, 100_000);

  const { productViews, clicks, watches, users, conversionItems } = schema;
  const views = (pid: number, n: number) => Array.from({ length: n }, (_, i) => ({ visitor: `v${pid}-${i}`, productId: pid, day: "d", createdAt: h(1) }));
  await dbm.db.insert(productViews).values([...views(nail1, 60), ...views(nail2, 40), ...views(phone, 20), ...views(none, 5)]);
  // lượt xem cũ hơn kỳ 30 ngày: không tính
  await dbm.db.insert(productViews).values({ visitor: "old", productId: nail1, day: "old", createdAt: h(24 * 40) });
  await dbm.db.insert(clicks).values([...Array(10)].map(() => ({ productId: nail1, platform: "shopee", createdAt: h(1) })));
  await dbm.db.insert(clicks).values([...Array(4)].map(() => ({ productId: phone, platform: "shopee", createdAt: h(1) })));
  const us = await dbm.db.insert(users).values([{ email: "a@x.vn" }, { email: "b@x.vn" }]).returning();
  await dbm.db.insert(watches).values([{ userId: us[0].id, productId: nail2, targetPrice: 1, createdAt: h(2) }, { userId: us[1].id, productId: nail2, targetPrice: 1, createdAt: h(2) }]);

  const st = await cs.categoryStats(30, NOW);
  const nail = st.rows.find((r) => r.category === "Làm đẹp")!;
  assert.equal(nail.products, 2);
  assert.equal(nail.views, 100);
  assert.equal(nail.clicks, 10);
  assert.equal(nail.watches, 2);
  assert.equal(nail.clickRate, 0.1);
  assert.equal(nail.watchRate, 0.02);
  assert.ok(Math.abs(nail.avgRate! - 0.15) < 1e-9);
  assert.equal(nail.avgCommission, (50_000 * 0.2 + 30_000 * 0.1) / 2); // 6.500đ
  assert.equal(nail.enough, true);
  // Chưa đủ đơn hàng -> tỉ lệ chốt mặc định 4%
  assert.deepEqual(st.cr, { value: cs.DEFAULT_CR, fromOrders: false });
  assert.equal(Math.round(nail.rpm!), Math.round((1000 * 10 * 0.04 * 6500) / 100)); // 2.600đ / 1.000 lượt xem
  const ph = st.rows.find((r) => r.category === "Điện thoại")!;
  assert.equal(ph.enough, false, "20 lượt xem: chưa đủ tin");
  const nc = st.rows.find((r) => r.category === cs.NO_CAT)!;
  assert.equal(nc.avgCommission, null, "không món nào có tỉ lệ hoa hồng");
  assert.equal(nc.rpm, null);
  assert.equal(st.totals.views, 125);

  // Sắp xếp theo HH/1.000 lượt xem: ngành đủ dữ liệu lên trước
  assert.equal(cs.sortCategories(st.rows, "rpm")[0].category, "Làm đẹp");
  assert.equal(cs.sortCategories(st.rows, "commission")[0].category, "Điện thoại", "hoa hồng mỗi đơn cao nhất");
  assert.equal(cs.sortCategories(st.rows, "commission").at(-1)!.category, cs.NO_CAT);

  // Đủ đơn hàng: dùng tỉ lệ chốt thật (≥100 lượt bấm, ≥5 đơn)
  await dbm.db.insert(clicks).values([...Array(90)].map(() => ({ productId: nail2, platform: "shopee", createdAt: h(1) })));
  await dbm.db.insert(conversionItems).values([...Array(6)].map((_, i) => ({ source: "api", orderId: `o${i}`, lineKey: "#1", platform: "shopee", purchasedAt: h(3), status: "completed" })));
  await dbm.db.insert(conversionItems).values({ source: "api", orderId: "huy", lineKey: "#1", platform: "shopee", purchasedAt: h(3), status: "cancelled" });
  const st2 = await cs.categoryStats(30, NOW);
  assert.deepEqual(st2.cr, { value: 6 / 104, fromOrders: true });
});
