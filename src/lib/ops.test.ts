/** Vận hành: ghi lại việc định kỳ, báo quản trị viên (chống báo lặp), việc cần làm, tin tóm tắt buổi sáng */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";
process.env.ADMIN_EMAILS = "admin@test.vn";
delete process.env.TELEGRAM_BOT_TOKEN;

let ops: typeof import("./ops");
let todo: typeof import("./todo");
let wd: typeof import("../worker/watchdog");
let mail: typeof import("./mail");
let ingest: typeof import("./ingest");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ops = await import("./ops");
  todo = await import("./todo");
  wd = await import("../worker/watchdog");
  mail = await import("./mail");
  ingest = await import("./ingest");
  schema = await import("@/db/schema");
});

const H = 3_600_000;
const mails = (from: number) => mail.outbox.slice(from).filter((m) => m.to === "admin@test.vn");

test("lỗi liên tiếp đủ số lần thì báo 1 lần (không lặp trong 12 giờ), chạy lại được thì báo đã ổn", async () => {
  const t0 = new Date("2026-10-05T01:00:00Z");
  const start = mail.outbox.length;
  await ops.recordJob("sync", { ok: false, error: "Shopee API: hết hạn mức" }, t0);
  assert.equal(mails(start).length, 0, "lỗi 1 lần chưa báo (sync cần 2 lần)");
  await ops.recordJob("sync", { ok: false, error: "Shopee API: hết hạn mức" }, new Date(t0.getTime() + 2 * H));
  assert.equal(mails(start).length, 1);
  assert.match(mails(start)[0].subject, /Đồng bộ giá.*bị lỗi/);
  await ops.recordJob("sync", { ok: false, error: "x" }, new Date(t0.getTime() + 4 * H));
  assert.equal(mails(start).length, 1, "không báo lặp trong 12 giờ");
  assert.equal((await ops.openAlerts()).length, 1);
  await ops.recordJob("sync", { ok: true, summary: "10 món" }, new Date(t0.getTime() + 6 * H));
  assert.equal(mails(start).length, 2);
  assert.match(mails(start)[1].subject, /chạy lại bình thường/);
  assert.equal((await ops.openAlerts()).length, 0);
  const st = (await ops.jobStates()).find((j) => j.name === "sync")!;
  assert.equal(st.state?.fails, 0);
  assert.equal(st.state?.summary, "10 món");
  assert.equal(st.state?.lastError, "x", "giữ lỗi gần nhất để xem lại");
});

test("trackJob ghi kết quả và vẫn ném lỗi như cũ", async () => {
  await assert.rejects(ops.trackJob("images", async () => { throw new Error("hỏng"); }), /hỏng/);
  assert.equal((await ops.jobStates()).find((j) => j.name === "images")?.state?.fails, 1);
  assert.equal(await ops.trackJob("images", async () => 5, (n) => `${n} ảnh`), 5);
  assert.equal((await ops.jobStates()).find((j) => j.name === "images")?.state?.summary, "5 ảnh");
});

test("nơi nhận báo: Telegram tài khoản quản trị đã liên kết, không có thì email", async () => {
  assert.deepEqual(await ops.adminTelegramChats(), [], "chưa có bot token");
  process.env.TELEGRAM_BOT_TOKEN = "t";
  const [u] = await dbm.db.insert(schema.users).values({ email: "admin@test.vn" }).returning();
  await dbm.db.insert(schema.subscriptions).values({ userId: u.id, telegramChatId: "12345" });
  const [other] = await dbm.db.insert(schema.users).values({ email: "khach@test.vn" }).returning();
  await dbm.db.insert(schema.subscriptions).values({ userId: other.id, telegramChatId: "999" });
  assert.deepEqual(await ops.adminTelegramChats(), ["12345"], "chỉ tài khoản quản trị");
  process.env.ADMIN_TELEGRAM_CHAT_ID = "777";
  assert.deepEqual(await ops.adminTelegramChats(), ["777"]);
  delete process.env.ADMIN_TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

test("canh chừng: đồng bộ đứng quá 6 giờ thì báo; việc cần làm; tin tóm tắt mỗi sáng 1 lần", async () => {
  const now = new Date("2026-10-06T01:30:00Z"); // 8h30 sáng VN
  const start = mail.outbox.length;
  // Lần đồng bộ thành công gần nhất: test trước (t0 + 6h = 07:00Z ngày 05) -> đã 18 giờ
  const fired = await wd.runWatchdog(now);
  assert.ok(fired.includes("sync-stale"));
  assert.ok(mails(start).some((m) => /chưa được đồng bộ/.test(m.subject)));

  // Việc cần làm: món link hỏng (gấp) và món thiếu ảnh
  await ingest.upsertProduct({ platform: "shopee", externalId: "a", name: "Món link hỏng", price: 100_000, discountPct: 0, affiliateUrl: "https://example.com/x" }, now);
  await ingest.upsertProduct({ platform: "shopee", externalId: "b", name: "Món thiếu ảnh", price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/b", category: "Sắc Đẹp" }, now);
  await dbm.db.insert(schema.socialPosts).values({ channel: "facebook", productId: (await dbm.db.select().from(schema.products))[0].id, postedAt: new Date(now.getTime() - H), error: "Error validating access token (#190)" });
  const list = await todo.todoList(now);
  const keys = list.map((x) => x.key);
  assert.ok(keys.includes("bad-link") && keys.includes("no-image") && keys.includes("fb-error") && keys.includes("rev-first"));
  assert.equal(list[0].level, "high", "việc gấp lên đầu");
  assert.ok(keys.indexOf("no-image") > keys.indexOf("bad-link"));

  // Bài đăng lỗi -> báo kèm gợi ý token
  const s2 = mail.outbox.length;
  assert.ok((await wd.runWatchdog(new Date(now.getTime() + 60_000))).includes("social-error"));
  assert.match(mails(s2).map((m) => m.html).join(" "), /token Facebook/);

  // Tin tóm tắt: trước giờ hẹn không gửi; sau đó gửi 1 lần/ngày
  const s3 = mail.outbox.length;
  assert.equal(await wd.runDailyBrief(new Date("2026-10-05T23:30:00Z")), false, "6h30 sáng VN: chưa tới 8h");
  assert.deepEqual(await wd.runDailyBrief(now), ["email"]);
  assert.equal(await wd.runDailyBrief(new Date(now.getTime() + H)), false, "đã gửi hôm nay");
  const brief = mails(s3);
  assert.equal(brief.length, 1);
  assert.match(brief[0].html, /Việc cần làm/);
  assert.match(brief[0].html, /link mua không hợp lệ/);
  assert.ok((await wd.runDailyBrief(now, { force: true })) !== false, "gửi thử luôn được");
});
