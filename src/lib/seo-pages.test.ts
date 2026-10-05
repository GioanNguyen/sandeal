/** Trang mã giảm giá theo tháng, trang thương hiệu, báo công cụ tìm kiếm (IndexNow) */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";
process.env.AUTH_SECRET = "bi-mat-thu";

import { detectBrand } from "./brands";
import { monthRefs, parseMonthSlug, voucherKind } from "./voucherpages";

let ingest: typeof import("./ingest");
let vp: typeof import("./voucherpages");
let brands: typeof import("./brands");
let inow: typeof import("./indexnow");

before(async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  vp = await import("./voucherpages");
  brands = await import("./brands");
  inow = await import("./indexnow");
});

const DAY = 86_400_000;

test("tháng có trang: 3 tháng trước, tháng này, tháng sau (từ ngày 20); đường dẫn dễ đọc", () => {
  const early = monthRefs(new Date("2026-10-02T05:00:00Z"));
  assert.deepEqual(early.filter((r) => r.platform === "shopee").map((r) => `${r.slug}:${r.state}`), [
    "shopee-thang-7-2026:past", "shopee-thang-8-2026:past", "shopee-thang-9-2026:past", "shopee-thang-10-2026:current",
  ]);
  assert.ok(early.some((r) => r.slug === "tiktok-shop-thang-10-2026"));
  const late = monthRefs(new Date("2026-12-22T05:00:00Z"));
  assert.ok(late.some((r) => r.slug === "lazada-thang-1-2027" && r.state === "next"), "qua năm mới");
  assert.equal(parseMonthSlug("shopee-thang-10-2026", new Date("2026-10-02T05:00:00Z"))?.state, "current");
  assert.equal(parseMonthSlug("shopee-thang-3-2020", new Date("2026-10-02T05:00:00Z")), null, "tháng quá xa: không có trang");
  assert.equal(voucherKind({ discountType: null, title: "Mã Freeship Xtra", discountText: null }), "freeship");
  assert.equal(voucherKind({ discountType: "percent", title: "Giảm 10%", discountText: null }), "percent");
});

test("mã theo tháng: tháng này chỉ mã còn hạn (sắp hết trước) + mã đã hết trong tháng; tháng trước là lưu trữ", async () => {
  const now = new Date("2026-10-12T05:00:00Z");
  const d = (days: number) => new Date(now.getTime() + days * DAY);
  const base = { source: "t", platform: "shopee" as const, affiliateUrl: "https://e.com" };
  await ingest.upsertVoucher({ ...base, externalId: "a", title: "Giảm 10% tối đa 50K", startAt: d(-3), endAt: d(5), discountType: "percent", discountValue: 10, maxDiscount: 50_000, minSpend: 200_000 });
  await ingest.upsertVoucher({ ...base, externalId: "b", title: "Freeship toàn sàn", startAt: d(-1), endAt: d(1), discountType: "freeship" });
  await ingest.upsertVoucher({ ...base, externalId: "c", title: "Giảm 30K 10.10", startAt: d(-3), endAt: d(-2), discountType: "fixed", discountValue: 30_000, minSpend: 150_000 });
  await ingest.upsertVoucher({ ...base, externalId: "d", title: "Mã tháng 9", startAt: new Date("2026-09-05T00:00:00Z"), endAt: new Date("2026-09-20T00:00:00Z"), discountType: "fixed", discountValue: 20_000 });
  await ingest.upsertVoucher({ ...base, platform: "lazada", externalId: "e", title: "Mã Lazada", startAt: d(-1), endAt: d(3) });

  const cur = await vp.monthReport(vp.parseMonthSlug("shopee-thang-10-2026", now)!, now);
  assert.deepEqual(cur.list.map((v) => v.title), ["Freeship toàn sàn", "Giảm 10% tối đa 50K"], "còn hạn, sắp hết trước");
  assert.deepEqual(cur.expired.map((v) => v.title), ["Giảm 30K 10.10"]);
  assert.equal(cur.strongest?.title, "Giảm 10% tối đa 50K", "mạnh nhất theo mức giảm tối đa");
  assert.equal(cur.noMin, 1);
  assert.deepEqual(cur.sales.map((e) => e.key), ["2026-10-10", "2026-10-15", "2026-10-25"]);
  assert.deepEqual(cur.upcoming.map((e) => e.key), ["2026-10-15", "2026-10-25"]);

  const past = await vp.monthReport(vp.parseMonthSlug("shopee-thang-9-2026", now)!, now);
  assert.deepEqual(past.list.map((v) => v.title), ["Mã tháng 9"]);
  assert.equal(past.expired.length, 0);
});

test("nhận thương hiệu từ tên: khớp nguyên chữ, dòng con về hãng mẹ, bỏ qua tên máy trong tên phụ kiện", () => {
  const cases: [string, string | null][] = [
    ["Tai nghe Bluetooth Xiaomi Redmi Buds 4 Pro", "Xiaomi"],
    ["Điện thoại Redmi Note 13 8GB", "Xiaomi"],
    ["Sạc dự phòng Anker PowerCore 10000mAh", "Anker"],
    ["Ốp lưng iPhone 15 Pro Max trong suốt", null],
    ["Kính cường lực Samsung A54", null],
    ["Cáp sạc nhanh Baseus cho iPhone", "Baseus"],
    ["Củ sạc Samsung 25W chính hãng", "Samsung"],
    ["Kem chống nắng La Roche-Posay Anthelios 50ml", "La Roche-Posay"],
    ["Nồi chiên không dầu Lock&Lock 5.2L", "Lock&Lock"],
    ["Serum Loreal Revitalift", "L'Oréal"],
    ["Bàn phím cơ không dây", null],
    ["Máy ảnh Sonyx giả", null],
  ];
  for (const [n, want] of cases) assert.equal(detectBrand(n)?.name ?? null, want, n);
});

test("trang thương hiệu: chỉ thương hiệu có từ 3 món còn bán; số liệu theo sàn, giảm thật, rẻ nhất", async () => {
  const now = new Date();
  const add = (id: string, name: string, price: number, platform: "shopee" | "lazada", drop = 0) =>
    ingest.upsertProduct({ platform, externalId: id, name, price, discountPct: 0, affiliateUrl: "https://e.com", imageUrl: "https://cf.shopee.vn/file/x.jpg", category: "Phụ kiện điện thoại", shopType: platform === "shopee" ? "mall" : undefined }, now);
  await add("990001", "Sạc dự phòng Anker 10000mAh", 450_000, "shopee");
  await add("990002", "Củ sạc Anker 20W", 190_000, "shopee");
  await add("990003", "Cáp Anker USB-C 1m", 120_000, "lazada");
  await add("990004", "Tai nghe Soundcore Life P3", 990_000, "lazada");
  await add("990005", "Sạc Baseus 30W", 250_000, "shopee");
  brands.resetBrandCache();
  const list = await brands.listBrands();
  assert.deepEqual(list.find((b) => b.slug === "anker"), { slug: "anker", name: "Anker", count: 4 }, "Soundcore tính vào Anker");
  assert.ok(!list.some((b) => b.slug === "baseus"), "1 món: chưa có trang");
  const r = (await brands.brandReport("anker"))!;
  assert.equal(r.count, 4);
  assert.equal(r.minPrice, 120_000);
  assert.equal(r.mall, 2);
  assert.deepEqual(r.byPlatform.map((p) => [p.platform, p.n, p.min]).sort(), [["lazada", 2, 120_000], ["shopee", 2, 190_000]]);
  assert.equal(r.cheapest[0].name, "Cáp Anker USB-C 1m");
  assert.equal(await brands.brandReport("baseus"), null);
  assert.equal((await brands.brandOf({ name: "Củ sạc Anker 20W" }))?.slug, "anker");
});

test("IndexNow: chỉ bật với site https công khai, không khoá mật khẩu; khoá ổn định đúng định dạng", () => {
  assert.deepEqual(inow.indexNowStatus(), { on: true });
  const k = inow.indexNowKey();
  assert.match(k, /^[a-f0-9]{32}$/);
  assert.equal(inow.indexNowKey(), k, "khoá không đổi giữa các lần chạy");
  process.env.BASIC_AUTH_USER = "a";
  process.env.BASIC_AUTH_PASSWORD = "b";
  assert.equal(inow.indexNowStatus().on, false);
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_PASSWORD;
  process.env.SITE_URL = "http://localhost:3000";
  assert.equal(inow.indexNowStatus().on, false);
  process.env.SITE_URL = "https://sandealgiare.com";
  process.env.INDEXNOW_KEY = "abc";
  assert.equal(inow.indexNowKey(), k, "khoá tự đặt sai định dạng thì dùng khoá tự sinh");
  process.env.INDEXNOW_KEY = "my-key-2026-abcdef";
  assert.equal(inow.indexNowKey(), "my-key-2026-abcdef");
  delete process.env.INDEXNOW_KEY;
});

test("IndexNow: gửi trang mới/đổi từ lần gửi trước, trang thương hiệu, trang tổng hợp 1 lần/ngày; ghi lại lỗi", async () => {
  const calls: { url: string; body: { host: string; key: string; keyLocation: string; urlList: string[] } }[] = [];
  let status = 200;
  const f = (async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    return new Response("", { status });
  }) as unknown as typeof fetch;

  const t0 = new Date();
  const r1 = await inow.runIndexNow(t0, f);
  assert.equal(r1.status, 200);
  const b = calls[0].body;
  assert.equal(calls[0].url, "https://api.indexnow.org/indexnow");
  assert.equal(b.host, "sandealgiare.com");
  assert.equal(b.key, inow.indexNowKey());
  assert.equal(b.keyLocation, "https://sandealgiare.com/indexnow-key.txt");
  assert.ok(b.urlList.some((u) => /\/product\/sac-du-phong-anker-10000mah-\d+$/.test(u)), "món mới");
  assert.ok(b.urlList.includes("https://sandealgiare.com/thuong-hieu/anker"), "trang thương hiệu của món đổi");
  assert.ok(b.urlList.includes("https://sandealgiare.com/"), "lần đầu: kèm trang tổng hợp");
  assert.ok(b.urlList.every((u) => u.startsWith("https://sandealgiare.com/")));

  // Không có gì đổi: không gửi
  const r2 = await inow.runIndexNow(new Date(t0.getTime() + 60_000), f);
  assert.equal(r2.sent, 0);
  assert.equal(calls.length, 1);

  // 1 món đổi giá sau đó: chỉ gửi món đó (+ thương hiệu), không gửi lại trang tổng hợp trong ngày
  const t2 = new Date(t0.getTime() + 2 * 3_600_000);
  await ingest.upsertProduct({ platform: "shopee", externalId: "990002", name: "Củ sạc Anker 20W", price: 170_000, discountPct: 0, affiliateUrl: "https://e.com", imageUrl: "https://cf.shopee.vn/file/x.jpg", category: "Phụ kiện điện thoại", shopType: "mall" }, t2);
  const r3 = await inow.runIndexNow(new Date(t2.getTime() + 1000), f);
  assert.equal(r3.status, 200);
  const list = calls[1].body.urlList;
  assert.ok(list.some((u) => u.includes("cu-sac-anker-20w")));
  assert.ok(!list.some((u) => u.includes("sac-du-phong-anker")), "món không đổi thì không gửi lại");
  assert.ok(!list.includes("https://sandealgiare.com/"), "trang tổng hợp chỉ 1 lần/ngày");

  // Lỗi khoá: ghi lại để hiện trong trang quản trị
  status = 403;
  await inow.submitUrls(["https://sandealgiare.com/x"], { fetchImpl: f, now: new Date(t2.getTime() + 5000) });
  const [last] = await inow.indexNowHistory(1);
  assert.equal(last.status, 403);
  assert.match(last.error ?? "", /khoá/);
});
