/** Lượt bấm mua / lượt xem từ thiết bị quản trị viên không được tính */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

let ingest: typeof import("./ingest");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  schema = await import("@/db/schema");
});

test("thiết bị có cookie sd_staff: bấm mua vẫn chuyển sang sàn nhưng không ghi lượt bấm; khách thường thì ghi", async () => {
  const go = await import("../app/go/[id]/route");
  const id = await ingest.upsertProduct({ platform: "shopee", externalId: "st1", name: "Món thử", price: 10_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/abc" }, new Date());
  const count = async () => (await dbm.db.select().from(schema.clicks)).filter((c) => c.productId === id).length;
  const call = (cookie?: string) =>
    go.GET(new Request(`https://sandealgiare.com/go/${id}`, { headers: { "user-agent": "Mozilla/5.0", ...(cookie ? { cookie } : {}) } }), { params: Promise.resolve({ id: String(id) }) });

  const staff = await call("sd_ch=facebook; sd_staff=1");
  assert.equal(staff.status, 302);
  assert.equal(staff.headers.get("location"), "https://s.shopee.vn/abc");
  assert.equal(await count(), 0, "quản trị viên bấm thử: không tính");

  const guest = await call("sd_ch=facebook");
  assert.equal(guest.status, 302);
  assert.equal(await count(), 1, "khách thật: tính");
  assert.doesNotMatch(guest.headers.get("set-cookie") ?? "", /sd_staff/, "khách không bị gắn cookie quản trị");
  // Khách được gắn mã ẩn danh sd_vid để đếm số người bấm; bấm lại cùng máy: thêm lượt, không thêm người
  const vid = guest.headers.get("set-cookie")?.match(/sd_vid=([\w-]+)/)?.[1];
  assert.ok(vid, "gắn mã khách ẩn danh");
  await call(`sd_ch=facebook; sd_vid=${vid}`);
  const rows = (await dbm.db.select().from(schema.clicks)).filter((c) => c.productId === id);
  assert.equal(rows.length, 2);
  assert.deepEqual([...new Set(rows.map((r) => r.visitor))], [vid]);

  // Không tính: bot xem trước link, tải trước trang, yêu cầu HEAD – nhưng vẫn chuyển sang sàn
  const bot = await go.GET(new Request(`https://sandealgiare.com/go/${id}`, { headers: { "user-agent": "facebookexternalhit/1.1" } }), { params: Promise.resolve({ id: String(id) }) });
  const pre = await go.GET(new Request(`https://sandealgiare.com/go/${id}`, { headers: { "user-agent": "Mozilla/5.0 (iPhone) Safari/604.1", "sec-purpose": "prefetch" } }), { params: Promise.resolve({ id: String(id) }) });
  const head = await go.GET(new Request(`https://sandealgiare.com/go/${id}`, { method: "HEAD", headers: { "user-agent": "Mozilla/5.0 (iPhone) Safari/604.1" } }), { params: Promise.resolve({ id: String(id) }) });
  for (const r of [bot, pre, head]) assert.equal(r.headers.get("location"), "https://s.shopee.vn/abc");
  assert.equal(await count(), 2, "bot / tải trước / HEAD không tính");
});
