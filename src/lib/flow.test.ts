/** Kiểm thử tích hợp trên Postgres nhúng trong RAM (PGlite) */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SMTP_URL = "";

let m: {
  db: typeof import("./db");
  schema: typeof import("@/db/schema");
  sync: typeof import("@/worker/sync");
  auth: typeof import("./auth");
  mail: typeof import("./mail");
  rl: typeof import("./ratelimit");
  q: typeof import("./queries");
  notify: typeof import("@/worker/notify");
  orm: typeof import("drizzle-orm");
};

before(async () => {
  m = {
    db: await import("./db"),
    schema: await import("@/db/schema"),
    sync: await import("@/worker/sync"),
    auth: await import("./auth"),
    mail: await import("./mail"),
    rl: await import("./ratelimit"),
    q: await import("./queries"),
    notify: await import("@/worker/notify"),
    orm: await import("drizzle-orm"),
  };
  await m.db.ensureMigrated();
});

const base = { platform: "shopee" as const, externalId: "x1", name: "Tai nghe test", discountPct: 30, affiliateUrl: "https://aff/x1", category: "Điện tử" };

test("upsert sản phẩm: chỉ ghi lịch sử khi giá đổi, tính điểm deal", async () => {
  const day = 86_400_000, t0 = Date.now() - 20 * day;
  for (let i = 0; i < 10; i++) await m.sync.upsertProduct({ ...base, price: 1_000_000 }, new Date(t0 + i * day));
  const id = await m.sync.upsertProduct({ ...base, price: 600_000 }, new Date());
  const p = await m.q.getProduct(id);
  assert.ok(p);
  assert.equal(p.prices.length, 2, "giá không đổi thì không ghi thêm điểm");
  assert.equal(p.realDropPct, 40);
  assert.ok(p.dealScore > 45, `score=${p.dealScore}`);
  const { items, total } = await m.q.listDeals({ q: "tai nghe", minDrop: 30 });
  assert.equal(total, 1);
  assert.equal(items[0].low30, 600_000);
  const cats = await m.q.listCategories();
  assert.deepEqual(cats.map((c) => c.slug), ["dien-tu"]);
});

test("đăng nhập bằng link: tạo user, session, watch đang chờ; link chỉ dùng 1 lần", async () => {
  const [p] = (await m.q.listDeals({})).items;
  const token = await m.auth.sendLoginLink("a@b.vn", { productId: p.id, targetPrice: 650_000, productName: p.name });
  assert.match(m.mail.outbox.at(-1)!.html, /\/auth\/verify\?token=/);
  const r = await m.auth.consumeLoginToken(token);
  assert.ok(r);
  assert.equal(r.user.email, "a@b.vn");
  assert.equal(r.addedProductId, p.id);
  assert.equal(await m.auth.consumeLoginToken(token), null, "token dùng lại phải bị từ chối");
  assert.equal(await m.auth.consumeLoginToken("sai"), null);
});

test("email báo giá có link huỷ hợp lệ, không gửi lặp trong 24h", async () => {
  const before = m.mail.outbox.length;
  assert.equal(await m.notify.notifyWatchers(), 1);
  const mail = m.mail.outbox.at(-1)!;
  assert.equal(m.mail.outbox.length, before + 1);
  const [, w, s] = mail.html.match(/unsubscribe\?w=(\d+)&amp;s=([\w-]+)|unsubscribe\?w=(\d+)&s=([\w-]+)/)!.filter(Boolean);
  assert.ok(m.auth.verifyUnsubscribeSig(Number(w), s));
  assert.ok(!m.auth.verifyUnsubscribeSig(Number(w), "x".repeat(s.length)));
  assert.equal(await m.notify.notifyWatchers(), 0);
});

test("giới hạn tần suất", async () => {
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await m.rl.allow("t:key", 3, 60));
  assert.deepEqual(results, [true, true, true, false]);
});

test("voucher: chỉ hiện mã còn hạn", async () => {
  const d = (n: number) => new Date(Date.now() + n * 86_400_000);
  await m.sync.upsertVoucher({ source: "t", externalId: "1", platform: "shopee", title: "Còn hạn", affiliateUrl: "#", endAt: d(1) });
  await m.sync.upsertVoucher({ source: "t", externalId: "2", platform: "shopee", title: "Hết hạn", affiliateUrl: "#", endAt: d(-1) });
  const vs = await m.q.listActiveVouchers();
  assert.deepEqual(vs.map((v) => v.title), ["Còn hạn"]);
});
