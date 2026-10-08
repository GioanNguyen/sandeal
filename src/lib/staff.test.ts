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
  assert.equal(guest.headers.get("set-cookie"), null, "khách không bị gắn cookie quản trị");
});
