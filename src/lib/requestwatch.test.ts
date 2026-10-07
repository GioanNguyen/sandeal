/** Link chưa có dữ liệu: tên đoán từ đường dẫn, món tương tự, báo khi có lịch sử giá, đưa vào hàng đợi tiện ích */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

import { nameHintFromPath } from "./links";
import { similarKeywords } from "./requestwatch";

let ingest: typeof import("./ingest");
let lookup: typeof import("./lookup");
let rw: typeof import("./requestwatch");
let q: typeof import("./extqueue");
let observe: typeof import("./observe");
let mail: typeof import("./mail");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  lookup = await import("./lookup");
  rw = await import("./requestwatch");
  q = await import("./extqueue");
  observe = await import("./observe");
  mail = await import("./mail");
  schema = await import("@/db/schema");
});

test("tên đoán từ đường dẫn và từ khoá món tương tự", () => {
  assert.equal(nameHintFromPath("/Quạt-Tích-Điện-Mini-Để-Bàn-i.123.456"), "Quạt Tích Điện Mini Để Bàn");
  assert.equal(nameHintFromPath("/products/may-hut-bui-cam-tay-i12345-s99.html"), "may hut bui cam tay");
  assert.equal(nameHintFromPath("/product/1/2"), undefined);
  assert.deepEqual(similarKeywords("[CHÍNH HÃNG] Quạt tích điện mini 2026 freeship"), ["Quạt tích điện", "Quạt tích", "Quạt"]);
  assert.deepEqual(similarKeywords("Sữa 1kg"), ["Sữa"].filter((w) => w.length >= 3));
});

test("dán link chưa có dữ liệu: ghi tên, gợi ý món tương tự, đăng ký báo, báo khi đã có dữ liệu, có trong hàng đợi tiện ích", async () => {
  const now = new Date();
  for (const [id, name] of [["a", "Quạt tích điện mini Xiaomi"], ["b", "Quạt tích điện để bàn 3 tốc độ"], ["c", "Nồi chiên không dầu"]] as const)
    await ingest.upsertProduct({ platform: "shopee", externalId: id, name, price: 200_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", imageUrl: "https://cf.shopee.vn/file/x.jpg" }, now);

  const r = await lookup.checkLink("https://shopee.vn/Quat-tich-dien-mini-cam-tay-i.77.9001?sp_atk=1");
  assert.equal(r.status, "queued");
  if (r.status !== "queued") return;
  assert.equal(r.ref.nameHint, "Quat tich dien mini cam tay");

  const sim = await rw.similarForHint(r.ref.nameHint);
  assert.equal(sim.keyword, "Quat tich dien", "tìm không dấu vẫn ra");
  assert.deepEqual(sim.items.map((d) => d.name).sort(), ["Quạt tích điện mini Xiaomi", "Quạt tích điện để bàn 3 tốc độ"].sort());

  assert.equal(await rw.watchRequest(r.requestId, { email: "khong-hop-le" }), false);
  assert.equal(await rw.watchRequest(r.requestId, { email: "Khach@Test.vn" }), true);
  assert.equal(await rw.watchRequest(r.requestId, { email: "khach@test.vn" }), true, "đăng ký lại không bị trùng");

  // Hàng đợi tiện ích: link có người chờ được đưa lên
  const qq = await q.extQueue({ now });
  assert.equal(qq.items[0].reason, "request");
  assert.equal(qq.items[0].id, -r.requestId);
  assert.equal(qq.items[0].url, "https://shopee.vn/product/77/9001");
  assert.equal(qq.counts.request, 1);
  // Chưa có dữ liệu: chưa báo
  const start = mail.outbox.length;
  assert.equal(await rw.notifyResolvedRequests(now), 0);

  // Tiện ích mở trang và góp giá -> có sản phẩm -> báo đúng 1 lần
  const o = await observe.recordObservation({ url: "https://shopee.vn/Quat-tich-dien-mini-cam-tay-i.77.9001", name: "Quạt tích điện mini cầm tay", price: 150_000 }, "1.2.3.4", now);
  assert.equal(o.status, "created");
  assert.equal(await rw.notifyResolvedRequests(now), 1);
  const sent = mail.outbox.slice(start).filter((m) => m.to === "khach@test.vn");
  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /Quạt tích điện mini cầm tay/);
  assert.equal(await rw.notifyResolvedRequests(now), 0, "không báo lại");
  assert.equal((await q.markTried([-r.requestId], now)).stillMissing, 0, "đã có sản phẩm");
  assert.ok(!(await q.extQueue({ now })).items.some((x) => x.reason === "request"));
});
