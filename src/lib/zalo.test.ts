/** Zalo OA: mã liên kết, khung 7 ngày, chữ ký webhook, liên kết qua webhook, chỉ gửi khi còn trong khung */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.ZALO_APP_ID = "app1";
process.env.ZALO_APP_SECRET = "sec";
process.env.ZALO_OA_ID = "123";
process.env.ZALO_REFRESH_TOKEN = "r0";
process.env.ZALO_WEBHOOK_SECRET = "whsec";

const DAY = 86_400_000;

test("mã liên kết và khung 7 ngày", async () => {
  const z = await import("./zalo");
  const c = z.newLinkCode();
  assert.match(c, /^[A-HJ-KM-NP-Z2-9]{6}$/);
  assert.equal(z.linkCodeIn(`Mã của tôi: ${c.toLowerCase()} nhé`), c);
  assert.equal(z.linkCodeIn("xin chào"), null);
  const now = new Date("2026-10-01T00:00:00Z");
  assert.equal(z.zaloWindowOpen(new Date(now.getTime() - 6 * DAY), now), true);
  assert.equal(z.zaloWindowOpen(new Date(now.getTime() - 7 * DAY), now), false);
  assert.equal(z.zaloWindowOpen(null, now), false);
  const raw = '{"event_name":"follow"}';
  const mac = createHash("sha256").update(`app1${raw}1700whsec`).digest("hex");
  assert.equal(z.verifyZaloSignature(raw, `mac=${mac}`, 1700), true);
  assert.equal(z.verifyZaloSignature(raw, "mac=abc", 1700), false);
});

test("liên kết qua webhook rồi gửi báo giá trong khung 7 ngày", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { users, subscriptions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const z = await import("./zalo");
  const { POST } = await import("@/app/api/zalo/webhook/route");

  const sent: { to: string; text: string }[] = [];
  let refreshes = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body?: unknown }) => {
    if (String(url).includes("oauth.zaloapp.com")) {
      refreshes++;
      return new Response(JSON.stringify({ access_token: `a${refreshes}`, refresh_token: `r${refreshes}`, expires_in: "90000" }));
    }
    const b = JSON.parse(String(init.body));
    sent.push({ to: b.recipient.user_id, text: b.message.text });
    return new Response(JSON.stringify({ error: 0, message: "Success" }));
  }) as unknown as typeof fetch;

  const call = async (ev: object) => {
    const raw = JSON.stringify({ timestamp: "1700", ...ev });
    const mac = createHash("sha256").update(`app1${raw}1700whsec`).digest("hex");
    return POST(new Request("http://x/api/zalo/webhook", { method: "POST", body: raw, headers: { "x-zevent-signature": `mac=${mac}` } }));
  };

  try {
    const [u] = await dbm.db.insert(users).values({ email: "a@b.c" }).returning();
    await dbm.db.insert(subscriptions).values({ userId: u.id, zaloLinkCode: "ABC234" });

    // Chữ ký sai -> từ chối
    const bad = await POST(new Request("http://x", { method: "POST", body: '{"timestamp":"1"}', headers: { "x-zevent-signature": "mac=0" } }));
    assert.equal(bad.status, 401);

    await call({ event_name: "user_send_text", sender: { id: "Z1" }, message: { text: "abc234" } });
    const [s] = await dbm.db.select().from(subscriptions).where(eq(subscriptions.userId, u.id));
    assert.equal(s.zaloUserId, "Z1");
    assert.equal(s.zaloLinkCode, null);
    assert.match(sent.at(-1)!.text, /Đã kết nối/);

    // Còn trong khung: gửi được; refresh token mới được lưu lại
    assert.equal(await z.notifyZalo(u.id, "Giảm giá!"), true);
    assert.equal(sent.at(-1)!.text, "Giảm giá!");
    assert.equal(refreshes, 1, "dùng lại access token còn hạn");

    // Gần hết khung: nhắc trả lời "ok"
    const in6 = new Date(Date.now() + 5 * DAY);
    assert.equal(await z.notifyZalo(u.id, "Giảm nữa", in6), true);
    assert.match(sent.at(-1)!.text, /Trả lời "ok"/);
    // Quá 7 ngày: không gửi
    assert.equal(await z.notifyZalo(u.id, "Quá hạn", new Date(Date.now() + 8 * DAY)), false);

    // Người dùng nhắn "ok" -> gia hạn
    await dbm.db.update(subscriptions).set({ zaloLastSeenAt: new Date(Date.now() - 10 * DAY) }).where(eq(subscriptions.userId, u.id));
    await call({ event_name: "user_send_text", sender: { id: "Z1" }, message: { text: "OK" } });
    assert.match(sent.at(-1)!.text, /Đã gia hạn/);
    assert.equal(await z.notifyZalo(u.id, "Lại giảm"), true);

    // Người lạ nhắn -> hướng dẫn liên kết
    await call({ event_name: "follow", follower: { id: "Z9" } });
    assert.equal(sent.at(-1)!.to, "Z9");
    assert.match(sent.at(-1)!.text, /Kết nối Zalo/);
  } finally {
    globalThis.fetch = orig;
    await dbm.closeDb();
  }
});
