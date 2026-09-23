import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";

process.env.DATABASE_URL = "memory://";
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

let server: https.Server;
let port = 0;
const received: string[] = [];

before(async () => {
  // Máy chủ push giả (HTTPS tự ký) chỉ dùng trong test
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj /CN=127.0.0.1`, { stdio: "ignore" });
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  server = https.createServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, (req, res) => {
    received.push(req.url!);
    res.statusCode = req.url === "/gone" ? 410 : 201;
    req.resume();
    req.on("end", () => res.end());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as { port: number }).port;
});
after(() => server.close());

test("gửi thông báo đẩy và tự xoá thiết bị đã huỷ", async () => {
  const dbm = await import("./db");
  const schema = await import("@/db/schema");
  const { sendPush } = await import("./push");
  await dbm.ensureMigrated();
  const [u] = await dbm.db.insert(schema.users).values({ email: "push@test.vn" }).returning();
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const sub = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
  await dbm.db.insert(schema.pushSubscriptions).values([
    { endpoint: `https://127.0.0.1:${port}/ok`, userId: u.id, ...sub },
    { endpoint: `https://127.0.0.1:${port}/gone`, userId: u.id, ...sub },
  ]);
  const n = await sendPush(u.id, { title: "Giảm giá", body: "x", url: "/" });
  assert.equal(n, 1);
  assert.deepEqual(received.sort(), ["/gone", "/ok"]);
  const left = await dbm.db.select().from(schema.pushSubscriptions);
  assert.deepEqual(left.map((s) => s.endpoint), [`https://127.0.0.1:${port}/ok`]);
});
