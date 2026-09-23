/** Kiểm thử tích hợp các tính năng: dán link, so sánh giá, bản tin, nhắc sale */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SMTP_URL = "";
process.env.SOURCES = "mock";

let lookup: typeof import("./lookup");
let ingest: typeof import("./ingest");
let q: typeof import("./queries");
let grouping: typeof import("@/worker/grouping");
let digest: typeof import("@/worker/digest");
let mail: typeof import("./mail");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  lookup = await import("./lookup");
  ingest = await import("./ingest");
  q = await import("./queries");
  grouping = await import("@/worker/grouping");
  digest = await import("@/worker/digest");
  mail = await import("./mail");
  schema = await import("@/db/schema");
});

test("dán link: tra cứu mới, lần sau tìm thấy sẵn, link lạ bị từ chối", async () => {
  const r1 = await lookup.checkLink("https://shopee.vn/Tai-nghe-i.111.222333");
  assert.equal(r1.status, "found");
  assert.ok(r1.status === "found" && r1.isNew);
  const r2 = await lookup.checkLink("shopee.vn/product/111/222333");
  assert.ok(r2.status === "found" && !r2.isNew && r1.status === "found" && r2.productId === r1.productId);
  assert.equal((await lookup.checkLink("https://tiki.vn/x-p1.html")).status, "invalid");
});

test("dán link khi nguồn chưa hỗ trợ: xếp hàng rồi worker xử lý sau", async () => {
  process.env.SOURCES = "accesstrade";
  const r = await lookup.checkLink("https://www.lazada.vn/products/abc-i999888777.html");
  assert.equal(r.status, "queued");
  process.env.SOURCES = "mock";
  assert.equal(await lookup.retryProductRequests(), 1);
  const again = await lookup.checkLink("https://www.lazada.vn/products/abc-i999888777.html");
  assert.ok(again.status === "found" && !again.isNew);
});

test("so sánh giá: gom nhóm khác sàn, rẻ nhất lên đầu", async () => {
  const base = { name: "Máy lọc không khí mini X1", discountPct: 10, affiliateUrl: "#", category: "Gia dụng" };
  const a = await ingest.upsertProduct({ ...base, platform: "shopee", externalId: "c1", price: 900_000 });
  await ingest.upsertProduct({ ...base, platform: "lazada", externalId: "c2", price: 750_000, name: "Máy lọc không khí mini X1 chính hãng" });
  await ingest.upsertProduct({ ...base, platform: "tiktok", externalId: "c3", price: 820_000 });
  assert.ok((await grouping.groupProducts()) >= 1);
  const p = (await q.getProduct(a))!;
  const offers = await q.compareOffers(p);
  assert.deepEqual(offers.map((o) => o.platform), ["lazada", "tiktok", "shopee"]);
  const gaps = await q.biggestGaps();
  const g = gaps.find((x) => x.offers.some((o) => o.id === a))!;
  assert.equal(g.save, 150_000);
});

test("bản tin theo sở thích: gửi đúng deal, không gửi lại trong ngày, không trùng deal", async () => {
  const [u] = await dbm.db.insert(schema.users).values({ email: "fan@test.vn" }).returning();
  const day = 86_400_000;
  const now = new Date("2026-09-23T02:30:00Z"); // 9h30 giờ VN
  for (let i = 0; i < 10; i++) {
    await ingest.upsertProduct({ platform: "shopee", externalId: "d1", name: "Kem chống nắng SPF50 test", discountPct: 30, affiliateUrl: "#", price: 300_000 }, new Date(now.getTime() - (20 - i) * day));
  }
  await ingest.upsertProduct({ platform: "shopee", externalId: "d1", name: "Kem chống nắng SPF50 test", discountPct: 30, affiliateUrl: "#", price: 200_000 }, now);
  await dbm.db.insert(schema.subscriptions).values({ userId: u.id, keywords: "kem chống nắng", minDrop: 20, emailDigest: true });

  const before = mail.outbox.length;
  assert.equal(await digest.runDigests(now), 1);
  const m = mail.outbox.at(-1)!;
  assert.equal(mail.outbox.length, before + 1);
  assert.equal(m.to, "fan@test.vn");
  assert.match(m.html, /Kem chống nắng SPF50 test/);
  assert.match(m.html, /unsubscribe\?t=digest/);
  assert.equal(await digest.runDigests(new Date(now.getTime() + 3_600_000)), 0, "không gửi 2 lần/ngày");
  assert.equal(await digest.runDigests(new Date(now.getTime() + day)), 0, "hôm sau không gửi lại deal cũ");
  assert.equal(await digest.runDigests(new Date("2026-09-22T20:00:00Z")), 0, "3h sáng: chưa tới giờ gửi");
});

test("nhắc sale: 20h tối hôm trước, mỗi đợt một lần", async () => {
  const [u] = await dbm.db.insert(schema.users).values({ email: "sale@test.vn" }).returning();
  await dbm.db.insert(schema.subscriptions).values({ userId: u.id, saleReminder: true });
  const eve = new Date("2026-10-09T13:30:00Z"); // 20h30 ngày 9/10 giờ VN
  assert.equal(await digest.runSaleReminders(new Date("2026-10-09T10:00:00Z")), 0, "17h: chưa nhắc");
  assert.equal(await digest.runSaleReminders(eve), 1);
  assert.match(mail.outbox.at(-1)!.subject, /10\.10/);
  assert.equal(await digest.runSaleReminders(new Date(eve.getTime() + 3_600_000)), 0);
});
