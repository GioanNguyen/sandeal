/** Link chết (tiện ích thấy trang "không tồn tại") và xoá hẳn món */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

let ingest: typeof import("./ingest");
let dl: typeof import("./deadlink");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");
let eq: typeof import("drizzle-orm").eq;

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  dl = await import("./deadlink");
  schema = await import("@/db/schema");
  eq = (await import("drizzle-orm")).eq;
});

const HOUR = 3_600_000;
const get = async (id: number) => (await dbm.db.select().from(schema.products).where(eq(schema.products.id, id)))[0];

test("link chết: ẩn món (giữ dữ liệu), không ẩn khi nguồn chính thức vừa thấy, nhập lại thì tự hiện", async () => {
  const now = new Date();
  const add = (id: string, at: Date, priceSource?: "api" | "ext") =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Món ${id}`, price: 50_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x" }, at, { priceSource });
  const old = await add("d1", new Date(now.getTime() - 3 * 24 * HOUR));
  const fresh = await add("d2", new Date(now.getTime() - 2 * HOUR));
  const ext = await add("d3", new Date(now.getTime() - HOUR), "ext");

  assert.equal(await dl.markDeadLink(old, now), "hidden");
  assert.equal(await dl.markDeadLink(old, now), "already");
  assert.equal(await dl.markDeadLink(fresh, now), "fresh", "API vừa thấy trong 24 giờ: giữ nguyên");
  assert.equal(await dl.markDeadLink(ext, now), "hidden", "món chỉ có giá từ tiện ích: ẩn được");
  assert.equal(await dl.markDeadLink(999_999, now), "missing");

  const p = await get(old);
  assert.equal(p.hidden, true);
  assert.equal(p.hiddenReason, dl.DEAD_LINK_REASON);
  const pts = await dbm.db.select().from(schema.pricePoints).where(eq(schema.pricePoints.productId, old));
  assert.ok(pts.length >= 1, "lịch sử giá vẫn còn");

  // Món ẩn vì lý do khác: nhập lại không tự hiện
  await dbm.db.update(schema.products).set({ hidden: true, hiddenReason: "Hàng giả / shop kém" }).where(eq(schema.products.id, fresh));
  await add("d1", now);
  await add("d2", now);
  assert.equal((await get(old)).hidden, false, "sàn còn bán (nhập lại): hiện lại");
  assert.equal((await get(old)).hiddenReason, null);
  assert.equal((await get(fresh)).hidden, true, "ẩn vì lý do khác: giữ nguyên");
});

test("xoá hẳn chỉ với món không có dữ liệu quan trọng", async () => {
  const now = new Date();
  const add = (id: string) => ingest.upsertProduct({ platform: "lazada", externalId: id, name: `Món ${id}`, price: 80_000, discountPct: 0, affiliateUrl: "https://c.lazada.vn/x" }, now);
  const free = await add("x1");
  const clicked = await add("x2");
  const watched = await add("x3");
  await dbm.db.insert(schema.clicks).values({ productId: clicked, platform: "lazada" });
  const [u] = await dbm.db.insert(schema.users).values({ email: "a@b.vn" }).returning();
  await dbm.db.insert(schema.watches).values({ userId: u.id, productId: watched, targetPrice: 70_000 });

  const b = await dl.deleteBlockers([free, clicked, watched]);
  assert.equal(dl.canDelete(b.get(free)), true);
  assert.equal(dl.canDelete(b.get(clicked)), false);
  assert.equal(dl.blockerText(b.get(clicked)!), "1 lượt bấm mua");
  assert.equal(dl.blockerText(b.get(watched)!), "1 người theo dõi giá");

  const r = await dl.deleteProduct(clicked);
  assert.equal(r.ok, false);
  assert.ok(await get(clicked), "món có lượt bấm không bị xoá");

  assert.deepEqual(await dl.deleteProduct(free), { ok: true });
  assert.equal(await get(free), undefined);
  const pts = await dbm.db.select().from(schema.pricePoints).where(eq(schema.pricePoints.productId, free));
  assert.equal(pts.length, 0, "lịch sử giá xoá theo");
  assert.equal((await dl.deleteProduct(free)).ok, false, "xoá lần 2: không tìm thấy");
});

test("xoá hẳn nhiều món: xoá món không có dữ liệu, giữ món có lượt bấm / người theo dõi kèm lý do", async () => {
  const now = new Date();
  const add = (id: string) => ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Món ${id}`, price: 30_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/y" }, now);
  const a = await add("b1");
  const b = await add("b2");
  const c = await add("b3");
  const d = await add("b4");
  await dbm.db.insert(schema.clicks).values([{ productId: c, platform: "shopee" }, { productId: c, platform: "shopee" }]);
  const [u] = await dbm.db.insert(schema.users).values({ email: "bulk@b.vn" }).returning();
  await dbm.db.insert(schema.watches).values({ userId: u.id, productId: d, targetPrice: 20_000 });

  const r = await dl.deleteProducts([a, b, c, d, a]);
  assert.deepEqual(r, { deleted: 2, kept: 2, keptBy: { "lượt bấm mua": 1, "người theo dõi giá": 1 } });
  assert.equal(await get(a), undefined);
  assert.equal(await get(b), undefined);
  assert.ok(await get(c));
  assert.ok(await get(d));
});
