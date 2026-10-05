/** Nhu cầu khách: từ khoá tìm trên site, tìm không dấu, Search Console */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

import { demandKey, demandStatus, rising } from "./demand";
import { isUnaccented, stripVn } from "./textsearch";
import { gscConfig, gscOpportunities, serviceJwt } from "./gsc";

let ingest: typeof import("./ingest");
let demand: typeof import("./demand");
let disc: typeof import("./discovery");
let q: typeof import("./queries");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  demand = await import("./demand");
  disc = await import("./discovery");
  q = await import("./queries");
  schema = await import("@/db/schema");
});

const DAY = 86_400_000;

test("gộp cách gõ, phân loại, bỏ dấu", () => {
  assert.equal(demandKey("Quạt  Mini"), demandKey("quat mini"));
  assert.equal(demandKey("Đèn ngủ"), "den ngu");
  assert.equal(demandStatus(0), "missing");
  assert.equal(demandStatus(2), "thin");
  assert.equal(demandStatus(30), "covered");
  assert.equal(isUnaccented("quat mini"), true);
  assert.equal(isUnaccented("quạt mini"), false);
  assert.equal(isUnaccented("den"), true);
  assert.equal(isUnaccented("đen"), false);
  assert.equal(stripVn("Quạt Tích Điện ỔN"), "Quat Tich Dien ON");
  assert.equal(rising({ searches: 6, prev: 2 } as never), true);
  assert.equal(rising({ searches: 3, prev: 2 } as never), false);
});

test("tìm không dấu vẫn ra món có dấu; có dấu thì so đúng dấu", async () => {
  const now = new Date();
  await ingest.upsertProduct({ platform: "shopee", externalId: "m1", name: "Quạt Tích Điện Mini Để Bàn", price: 150_000, discountPct: 0, affiliateUrl: "https://e.com", category: "Thiết Bị Điện Gia Dụng" }, now);
  await ingest.upsertProduct({ platform: "shopee", externalId: "m2", name: "Đèn ngủ cảm ứng", price: 90_000, discountPct: 0, affiliateUrl: "https://e.com" }, now);
  assert.equal((await q.listDeals({ q: "quat tich dien" })).total, 1);
  assert.equal((await q.listDeals({ q: "QUAT MINI" })).total, 0, "không liền nhau thì không khớp");
  assert.equal((await q.listDeals({ q: "den ngu" })).total, 1, "đ -> d");
  assert.equal((await q.listDeals({ q: "quạt tích" })).total, 1);
  assert.equal((await q.listDeals({ q: "quát" })).total, 0, "có dấu: so đúng dấu");
  const s = await disc.suggest("quat");
  assert.equal(s.products[0]?.name, "Quạt Tích Điện Mini Để Bàn");
});

test("báo cáo nhu cầu: gộp có/không dấu, không ra kết quả, đang tăng, trang riêng có sẵn", async () => {
  const now = new Date();
  const log = (text: string, results: number, daysAgo: number) =>
    dbm.db.insert(schema.searchLog).values({ q: text, results, createdAt: new Date(now.getTime() - daysAgo * DAY) });
  for (const d of [1, 2, 3]) await log("máy hút bụi cầm tay", 0, d);
  await log("may hut bui cam tay", 0, 1);
  await log("may hut bui cam tay", 0, 40); // kỳ trước
  for (const d of [1, 2]) await log("nồi chiên", 2, d);
  for (const d of [1, 1, 2, 3, 4]) await log("thiết bị điện gia dụng", 12, d);
  await log("quat mini", 0, 2);
  await log("quat mini", 3, 1); // lần gần nhất đã ra kết quả

  const r = await demand.demandReport(30, now);
  const by = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  const hb = by["may hut bui cam tay"];
  assert.equal(hb.searches, 4, "gộp 2 cách gõ");
  assert.equal(hb.q, "máy hút bụi cầm tay", "hiện cách gõ có dấu");
  assert.equal(hb.status, "missing");
  assert.equal(hb.prev, 1);
  assert.equal(demand.rising(hb), true);
  assert.equal(by["noi chien"].status, "thin");
  assert.equal(by["quat mini"].status, "thin", "theo lần tìm gần nhất");
  assert.equal(by["thiet bi dien gia dung"].landing?.href, "/danh-muc/thiet-bi-dien-gia-dung");
  assert.equal(r.rows[0].key, "thiet bi dien gia dung", "nhiều lượt nhất trước");
  assert.equal(r.totals.zeroSearches, 5);
  assert.equal(r.totals.searches, 4 + 2 + 5 + 2);
});

test("Search Console: JWT ký đúng, lọc cơ hội", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  assert.equal(gscConfig({ GSC_SITE: "sc-domain:a.vn", GSC_CLIENT_EMAIL: "x@y.iam.gserviceaccount.com" }), null);
  const c = gscConfig({ GSC_SITE: "sc-domain:a.vn", GSC_CLIENT_EMAIL: "x@y.iam.gserviceaccount.com", GSC_PRIVATE_KEY: pem.replace(/\n/g, "\\n") })!;
  assert.ok(c);
  const jwt = serviceJwt(c, Date.UTC(2026, 9, 5));
  const [h, b, sig] = jwt.split(".");
  const ok = createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  assert.ok(ok, "chữ ký hợp lệ");
  const claims = JSON.parse(Buffer.from(b.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  assert.equal(claims.iss, "x@y.iam.gserviceaccount.com");
  assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");

  const row = (query: string, impressions: number, ctr: number, position: number) => ({ query, page: "https://a.vn/x", clicks: Math.round(impressions * ctr), impressions, ctr, position });
  const opp = gscOpportunities([row("gần top", 200, 0.01, 8), row("top ít bấm", 300, 0.01, 2), row("top tốt", 300, 0.2, 1.5), row("ít hiện", 5, 0, 9), row("quá xa", 500, 0, 45)]);
  assert.deepEqual(opp.map((o) => `${o.query}:${o.kind}`), ["top ít bấm:lowctr", "gần top:near"]);
});
