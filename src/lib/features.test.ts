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
  const rows = await q.enrichDeals(offers);
  const shopee = rows.find((r) => r.platform === "shopee")!;
  const lazada = rows.find((r) => r.platform === "lazada")!;
  assert.deepEqual(shopee.cheaperElsewhere && [shopee.cheaperElsewhere.platform, shopee.cheaperElsewhere.price], ["lazada", 750_000]);
  assert.equal(lazada.cheaperElsewhere, null);
  assert.equal(lazada.cheapestAcross, 3);
  assert.ok(Array.isArray(shopee.spark) && shopee.spark.length >= 1);
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

test("thẻ deal: giá sau mã giảm & nhãn giá thấp kỷ lục", async () => {
  const list = [
    { id: 1, title: "Giảm 50K đơn từ 300K", code: "A50", platform: "shopee", type: "fixed" as const, value: 50_000, max: null, minSpend: 300_000 },
    { id: 2, title: "Giảm 10% tối đa 40K", code: "B10", platform: "shopee", type: "percent" as const, value: 10, max: 40_000, minSpend: 0 },
    { id: 3, title: "Freeship", code: null, platform: "shopee", type: "freeship" as const, value: 30_000, max: null, minSpend: 0 },
  ];
  assert.deepEqual(q.bestVoucherFor({ platform: "shopee", price: 350_000 }, list), { price: 300_000, save: 50_000, code: "A50", title: "Giảm 50K đơn từ 300K" });
  assert.equal(q.bestVoucherFor({ platform: "shopee", price: 200_000 }, list)?.code, "B10"); // chưa đủ 300K
  assert.equal(q.bestVoucherFor({ platform: "lazada", price: 500_000 }, list), null); // khác sàn
  assert.equal(q.bestVoucherFor({ platform: "shopee", price: 5_000 }, list), null); // giảm < 1.000đ thì bỏ

  const day = 86_400_000, now = Date.now();
  const mk = (id: string) => ({ platform: "tiktok" as const, externalId: id, name: `Đèn học ${id}`, discountPct: 0, affiliateUrl: "#" });
  // Theo dõi 40 ngày, hôm nay lập đáy mới -> có nhãn
  await ingest.upsertProduct({ ...mk("r1"), price: 500_000 }, new Date(now - 40 * day));
  await ingest.upsertProduct({ ...mk("r1"), price: 420_000 }, new Date(now - 20 * day));
  await ingest.upsertProduct({ ...mk("r1"), price: 480_000 }, new Date(now - 10 * day));
  const r1 = await ingest.upsertProduct({ ...mk("r1"), price: 380_000 }, new Date(now - day));
  // Quay lại mức đáy cũ (không phải đáy mới) -> không gắn nhãn
  await ingest.upsertProduct({ ...mk("r2"), price: 500_000 }, new Date(now - 40 * day));
  await ingest.upsertProduct({ ...mk("r2"), price: 380_000 }, new Date(now - 20 * day));
  await ingest.upsertProduct({ ...mk("r2"), price: 480_000 }, new Date(now - 10 * day));
  const r2 = await ingest.upsertProduct({ ...mk("r2"), price: 380_000 }, new Date(now - day));
  // Mới theo dõi 5 ngày -> chưa đủ lâu
  await ingest.upsertProduct({ ...mk("r3"), price: 500_000 }, new Date(now - 5 * day));
  const r3 = await ingest.upsertProduct({ ...mk("r3"), price: 300_000 }, new Date(now - day));
  const rows = await q.dealsByIds([r1, r2, r3]);
  const by = (id: number) => rows.find((r) => r.id === id)!;
  assert.equal(by(r1).recordLow, true);
  assert.equal(by(r1).allTimeLow, 380_000);
  assert.equal(by(r2).recordLow, false);
  assert.equal(by(r3).recordLow, false);
});

test("khám phá: từ khoá hot, gợi ý, người xem cũng xem, rẻ hơn, chip lọc", async () => {
  const d = await import("./discovery");
  assert.equal(d.normalizeQuery("  Tai   NGHE "), "tai nghe");
  assert.equal(d.normalizeQuery("https://shopee.vn/abc"), null);
  assert.equal(d.normalizeQuery("a"), null);
  assert.equal(d.normalizeQuery("<script>"), null);

  for (let i = 0; i < 3; i++) await d.logSearch("Quạt mini", 4);
  await d.logSearch("quạt mini", 0); // không có kết quả -> không tính
  await d.logSearch("một lần", 5); // chỉ 1 lượt -> chưa hot
  const hot = await d.trendingSearches();
  assert.deepEqual(hot.find((h) => h.q === "quạt mini"), { q: "quạt mini", n: 3 });
  assert.ok(!hot.some((h) => h.q === "một lần"));

  const mk = (id: string, name: string, price: number, extra = {}) =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name, category: "Quạt", price, discountPct: 10, affiliateUrl: "#", ...extra });
  const big = await mk("q1", "Quạt đứng thông minh", 900_000);
  const cheap1 = await mk("q2", "Quạt đứng mini", 400_000, { shopType: "mall" });
  const cheap2 = await mk("q3", "Máy sưởi", 300_000);
  await mk("q4", "Quạt trần cao cấp", 1_200_000);
  const s = await d.suggest("quạt đứng");
  assert.deepEqual(s.products.map((p) => p.id).sort(), [big, cheap1].sort());

  const p = (await q.getProduct(big))!;
  const cheaper = await d.cheaperSimilar(p);
  assert.deepEqual(cheaper.map((x) => x.id), [cheap1, cheap2]); // trùng từ "quạt đứng" lên trước, không có món đắt hơn

  // 3 khách xem big + cheap1, 1 khách xem big + cheap2 -> chỉ cheap1 đủ 2 khách
  for (const v of ["a", "b", "c"]) { await d.recordView(v, big); await d.recordView(v, cheap1); }
  await d.recordView("a", big); // xem lại trong ngày không tính thêm
  await d.recordView("z", big); await d.recordView("z", cheap2);
  const also = await d.alsoViewed(big);
  assert.deepEqual(also.map((x) => [x.id, x.viewers]), [[cheap1, 3]]);

  const { total } = await q.listDeals({ category: "Quạt", mall: true });
  assert.equal(total, 1);
  assert.equal(await q.countDeals({ category: "Quạt", mall: true }), 1);
});

test("giữ khách: báo món đã lưu vừa giảm, deal bí ẩn theo ngày", async () => {
  const { savedDrops } = await import("./local");
  const saved = { 1: { p: 500_000, at: 0 }, 2: { p: 300_000, at: 0 }, 3: { p: 200_000, at: 0 } };
  // món 1 giảm so với lúc lưu; món 2 giảm nhưng đã xem mức 250K rồi -> chỉ tính khi giảm tiếp; món 3 tăng
  assert.deepEqual(savedDrops([1, 2, 3], { 1: 450_000, 2: 250_000, 3: 210_000 }, saved, { 2: 250_000 }), [{ id: 1, from: 500_000, to: 450_000 }]);
  assert.deepEqual(savedDrops([2], { 2: 240_000 }, saved, { 2: 250_000 }), [{ id: 2, from: 250_000, to: 240_000 }]);
  assert.deepEqual(savedDrops([1], { 1: 499_500 }, saved, {}), []); // giảm < 1.000đ bỏ qua

  const d = await import("./discovery");
  assert.equal(d.nextVnMidnight(new Date("2026-09-24T16:59:00Z")).toISOString(), "2026-09-24T17:00:00.000Z"); // 23:59 VN
  assert.equal(d.nextVnMidnight(new Date("2026-09-24T17:00:00Z")).toISOString(), "2026-09-25T17:00:00.000Z");
  const day1 = new Date("2026-09-24T03:00:00Z"), day1b = new Date("2026-09-24T15:00:00Z");
  const a = await d.mysteryDeal([], day1);
  const b = await d.mysteryDeal([], day1b);
  if (a) {
    assert.equal(a.deal.id, b!.deal.id); // cả ngày cùng 1 deal
    assert.ok(a.deal.realDropPct >= 15);
    const c = await d.mysteryDeal([a.deal.id], day1);
    assert.notEqual(c?.deal.id, a.deal.id); // bỏ món đã có ở "Deal nổi bật"
  }
});

test("mini game đoán giá & danh sách chia sẻ", async () => {
  const play = await import("./play");
  for (let k = 0; k < 50; k++) {
    const rand = play.seeded(`t${k}`);
    const price = 100_000 + k * 37_000, usual = Math.round(price * 1.6);
    const o = play.buildOptions(price, usual, rand);
    assert.equal(o.length, 4);
    assert.ok(o.includes(price));
    assert.equal(new Set(o).size, 4);
    assert.ok(o.every((x) => x > 0 && x < usual));
  }
  const d1 = await play.guessRounds(new Date("2026-09-24T02:00:00Z"));
  const d1b = await play.guessRounds(new Date("2026-09-24T16:00:00Z"));
  assert.deepEqual(d1.rounds.map((r) => r.id), d1b.rounds.map((r) => r.id)); // cả ngày cùng đề
  assert.deepEqual(d1.rounds.map((r) => r.options), d1b.rounds.map((r) => r.options));
  assert.equal(new Set(d1.rounds.map((r) => r.name.toLowerCase())).size, d1.rounds.length);
  for (const r of d1.rounds) assert.ok(r.options.includes(r.answer) && r.realDropPct >= 10);

  assert.equal(play.cleanTitle("  <b>Đồ   cho bé</b> "), "Đồ cho bé");
  assert.equal(play.cleanTitle(""), "Deal mình đã chọn");
  assert.ok(!play.cleanTitle("<script>").includes("<"));
  const [a, b] = (await q.listDeals({ pageSize: 2 })).items;
  const r = await play.createList("Quà 20/10", [a.id, b.id, a.id, 999999, "x"]);
  assert.ok("slug" in r);
  const l = (await play.getList((r as { slug: string }).slug, true))!;
  assert.equal(l.title, "Quà 20/10");
  assert.deepEqual(l.items.map((x) => x.id), [a.id, b.id]); // bỏ trùng, bỏ id không tồn tại, giữ thứ tự
  assert.equal((await play.getList(l.slug))!.views, 1);
  assert.deepEqual(await play.createList("x", [999999]), { error: "Sản phẩm không còn tồn tại" });
  assert.equal(await play.getList("../etc"), null);
});

test("SEO: đường dẫn có tên & trang tổng hợp tuần", async () => {
  const slug = await import("./slug");
  assert.equal(slug.productPath({ id: 12, name: "Tai nghe Bluetooth chống ồn ANC" }), "/product/tai-nghe-bluetooth-chong-on-anc-12");
  assert.equal(slug.productPath({ id: 7, name: "Đồ chơi 100%!!" }), "/product/do-choi-100-7");
  assert.equal(slug.productPath({ id: 5 }), "/product/5");
  assert.equal(slug.productIdFromParam("tai-nghe-bluetooth-chong-on-anc-12"), 12);
  assert.equal(slug.productIdFromParam("sac-20000mah-99"), 99);
  assert.equal(slug.productIdFromParam("12"), 12);
  assert.ok(Number.isNaN(slug.productIdFromParam("khong-co-so")));

  const rd = await import("./roundups");
  assert.equal(rd.weekLabel(new Date("2026-09-24T05:00:00Z")), "tuần 39/2026");
  assert.equal(rd.weekLabel(new Date("2026-12-31T20:00:00Z")), "tuần 53/2026"); // 1/1/2027 giờ VN là thứ Sáu, thuộc tuần ISO 53 của 2026
  assert.equal(rd.weekLabel(new Date("2027-01-04T02:00:00Z")), "tuần 1/2027");
});

test("tốc độ & hiển thị: ảnh thu nhỏ, người xem 1 giờ qua", async () => {
  const { thumbUrl } = await import("./images");
  assert.equal(thumbUrl("https://down-vn.img.susercontent.com/file/vn-11134207-abc123"), "https://down-vn.img.susercontent.com/file/vn-11134207-abc123_tn");
  assert.equal(thumbUrl("https://down-vn.img.susercontent.com/file/vn-11134207-abc123", 600), "https://down-vn.img.susercontent.com/file/vn-11134207-abc123");
  assert.equal(thumbUrl("https://img.lazcdn.com/g/p/abc.jpg"), "https://img.lazcdn.com/g/p/abc.jpg_300x300q80.jpg_.webp");
  assert.equal(thumbUrl("https://p16-oec-va.ibyteimg.com/tos-maliva/x~tplv-o3syd03w52-origin-jpeg.jpeg"), "https://p16-oec-va.ibyteimg.com/tos-maliva/x~tplv-o3syd03w52-origin-jpeg.jpeg");
  assert.equal(thumbUrl(null), null);
  assert.equal(thumbUrl("không phải link"), "không phải link");

  const d = await import("./discovery");
  const [p] = (await q.listDeals({ pageSize: 1 })).items;
  const now = new Date();
  await d.recordView("v1", p.id, new Date(now.getTime() - 3 * 3_600_000)); // xem sáng nay
  assert.equal((await d.recentViewers([p.id], now)).get(p.id) ?? 0, 0);
  await d.recordView("v1", p.id, now); // cùng ngày xem lại -> tính là đang xem
  await d.recordView("v2", p.id, now);
  assert.equal((await d.recentViewers([p.id], now)).get(p.id), 2);
});
