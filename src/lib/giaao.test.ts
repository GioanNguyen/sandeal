/** Bóc giá ảo (trang /giam-gia-ao, bài tự đăng) và nút theo dõi Săn Deal */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";
process.env.FB_PAGE_ID = "1234567890";
process.env.FB_PAGE_TOKEN = "t";

import { classifyFake, rankFakes, realLabel, type FakeDeal } from "./fakedeals";
import { followLinks, fbPageUrl } from "./follow";
import { bocGiaAo } from "./fbposts";

let ingest: typeof import("./ingest");
let fd: typeof import("./fakedeals");
let worker: typeof import("../worker/giaao");

before(async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  fd = await import("./fakedeals");
  worker = await import("../worker/giaao");
});

const DAY = 86_400_000;
const NOW = new Date("2026-10-14T03:00:00Z");
const at = (days: number) => new Date(NOW.getTime() - days * DAY);

test("nhận món giảm ảo: ghi giảm ≥30%, giá hiện tại gần bằng giá thường ngày, theo dõi ≥14 ngày", () => {
  const flat = [{ price: 200_000, capturedAt: at(40) }];
  const c = classifyFake({ price: 199_000, originalPrice: 400_000, discountPct: 50 }, flat, NOW)!;
  assert.equal(c.claim, 50);
  assert.ok(c.real > 0 && c.real < 1);
  assert.equal(c.usual, 200_000);
  assert.equal(Math.floor(c.days), 40);
  // Rẻ thật 20%: không phải giảm ảo
  assert.equal(classifyFake({ price: 160_000, originalPrice: 400_000, discountPct: 60 }, flat, NOW), null);
  // Đắt hơn thường ngày: vẫn là giảm ảo
  assert.ok(classifyFake({ price: 220_000, originalPrice: 440_000, discountPct: 50 }, flat, NOW)!.real < 0);
  // Ghi giảm ít, hoặc mới theo dõi 10 ngày: bỏ qua
  assert.equal(classifyFake({ price: 200_000, originalPrice: 250_000, discountPct: 20 }, flat, NOW), null);
  assert.equal(classifyFake({ price: 200_000, originalPrice: 400_000, discountPct: 50 }, [{ price: 200_000, capturedAt: at(10) }], NOW), null);
  // Giá thường ngày theo thời gian: 30 ngày ở 300K, 10 ngày gần đây 200K -> thường ngày 300K, giá 200K là giảm thật
  assert.equal(classifyFake({ price: 200_000, originalPrice: 400_000, discountPct: 50 }, [{ price: 300_000, capturedAt: at(40) }, { price: 200_000, capturedAt: at(10) }], NOW), null);
  assert.equal(realLabel(0.2), "giá như mọi ngày");
  assert.equal(realLabel(3.4), "thật chỉ −3%");
  assert.equal(realLabel(-10), "đắt hơn thường ngày 10%");
});

test("xếp hạng: chênh giữa % ghi và % thật lớn trước", () => {
  const mk = (id: number, claim: number, real: number, sold = 0) => ({ p: { id, sold } as FakeDeal["p"], claim, real, usual: 1, low: 1, days: 30 });
  assert.deepEqual(rankFakes([mk(1, 40, 4), mk(2, 60, 0), mk(3, 40, 4, 900)]).map((x) => x.p.id), [2, 3, 1]);
});

test("bài bóc giá ảo: cần ≥2 món, không có link mua, ảnh và link về trang giảm giá ảo", () => {
  const p = (id: number, name: string) => ({ id, name, platform: "shopee", price: 199_000, originalPrice: 399_000, affiliateUrl: "https://s.shopee.vn/x", lastSeenAt: NOW } as FakeDeal["p"]);
  const items: FakeDeal[] = [
    { p: p(11, "Nồi chiên không dầu 5L"), claim: 50, real: 0.4, usual: 200_000, low: 190_000, days: 41 },
    { p: p(12, "Bình giữ nhiệt 500ml"), claim: 45, real: -6, usual: 188_000, low: 180_000, days: 30 },
  ];
  assert.equal(bocGiaAo(items.slice(0, 1), { site: "https://sandealgiare.com", now: NOW }), null);
  const d = bocGiaAo(items, { site: "https://sandealgiare.com", now: NOW })!;
  assert.match(d.body, /BÓC GIÁ ẢO/);
  assert.match(d.body, /Ghi giảm 50%: 399K → 199K/);
  assert.match(d.body, /giá này y như mọi ngày/);
  assert.match(d.body, /còn ĐẮT hơn 6%/);
  assert.ok(!/https?:\/\//.test(d.body), "thân bài không có link");
  assert.ok(!d.comment.includes("s.shopee.vn"), "không kèm link mua món giảm ảo");
  assert.match(d.comment, /sandealgiare\.com\/giam-gia-ao\?utm_source=facebook/);
  assert.match(d.comment, /sandealgiare\.com\/p\/11/);
  assert.equal(d.image, "https://sandealgiare.com/giam-gia-ao/anh?p=11,12");
  assert.deepEqual(d.productIds, [11, 12]);
});

test("đăng tự động: chọn 3 món giảm ảo, ghi lịch sử, lần sau không lặp món đã đăng trong 30 ngày", async () => {
  const add = async (id: string, name: string, price: number, orig: number, sold: number) => {
    await ingest.upsertProduct({ platform: "shopee", externalId: id, name, price, originalPrice: orig, discountPct: Math.round((1 - price / orig) * 100), sold, affiliateUrl: "https://e.com" }, at(40));
    await ingest.upsertProduct({ platform: "shopee", externalId: id, name, price, originalPrice: orig, discountPct: Math.round((1 - price / orig) * 100), sold, affiliateUrl: "https://e.com" }, NOW);
  };
  for (let i = 1; i <= 5; i++) await add(`88000${i}`, `Món giảm ảo số ${i}`, 100_000 * i, 250_000 * i, 100 * i);
  // Món giảm thật: không được chọn
  await ingest.upsertProduct({ platform: "shopee", externalId: "880099", name: "Món giảm thật", price: 300_000, originalPrice: 600_000, discountPct: 50, affiliateUrl: "https://e.com" }, at(40));
  await ingest.upsertProduct({ platform: "shopee", externalId: "880099", name: "Món giảm thật", price: 200_000, originalPrice: 600_000, discountPct: 67, affiliateUrl: "https://e.com" }, NOW);

  const list = await fd.fakeDeals({ now: NOW });
  assert.equal(list.length, 5);
  assert.ok(!list.some((x) => x.p.name === "Món giảm thật"));

  const posts: { body: string; image: string }[] = [];
  const post = async (d: { body: string; image: string }) => {
    posts.push(d);
    return `page_${posts.length}`;
  };
  const r1 = await worker.postGiaAo(NOW, post as never);
  assert.equal(r1.ok, true);
  assert.equal(r1.kind, "boc-gia-ao");
  const first = posts[0].image.split("p=")[1].split(",").map(Number);
  assert.equal(first.length, 3);

  const r2 = await worker.postGiaAo(new Date(NOW.getTime() + 3 * DAY), post as never);
  assert.equal(r2.ok, true);
  const second = posts[1].image.split("p=")[1].split(",").map(Number);
  assert.equal(second.length, 2, "chỉ còn 2 món chưa đăng");
  assert.ok(second.every((id) => !first.includes(id)), "không lặp món trong 30 ngày");

  const r3 = await worker.postGiaAo(new Date(NOW.getTime() + 6 * DAY), post as never);
  assert.equal(r3.ok, false, "hết món mới: không đăng");
  assert.equal(posts.length, 2);

  // Lỗi bình luận đầu (bài đã lên): vẫn tính là đã đăng
  const hist = await worker.lastGiaAoPosts();
  assert.equal(hist.length, 2);
  assert.equal(hist[0].n, 2);
});

test("lịch đăng: mặc định thứ 4, thứ 7 lúc 9h; giá trị sai thì dùng mặc định", () => {
  assert.deepEqual(worker.giaAoSchedule({}), { days: [3, 6], hour: 9 });
  assert.deepEqual(worker.giaAoSchedule({ GIA_AO_DAYS: "2, 5", GIA_AO_HOUR: "19" }), { days: [2, 5], hour: 19 });
  assert.deepEqual(worker.giaAoSchedule({ GIA_AO_DAYS: "9,x", GIA_AO_HOUR: "25" }), { days: [3, 6], hour: 9 });
});

test("nút theo dõi: chỉ kênh đã cấu hình, đúng tên miền; Trang lấy theo FB_PAGE_ID khi chưa có FB_PAGE_URL", () => {
  assert.deepEqual(followLinks({}), []);
  assert.deepEqual(followLinks({ FB_PAGE_ID: "1234567890" }).map((l) => l.url), ["https://www.facebook.com/1234567890"]);
  const all = followLinks({
    FB_PAGE_ID: "1234567890",
    FB_PAGE_URL: "https://www.facebook.com/sandealgiare",
    FB_GROUP_URL: "https://www.facebook.com/groups/sandeal",
    ZALO_OA_ID: "1234567",
    TELEGRAM_CHAT_ID: "@sandeal_vn",
  });
  assert.deepEqual(all.map((l) => l.kind), ["page", "group", "zalo", "telegram"]);
  assert.equal(all[0].url, "https://www.facebook.com/sandealgiare");
  assert.equal(all[3].url, "https://t.me/sandeal_vn");
  assert.deepEqual(followLinks({ FB_PAGE_URL: "https://evil.com/fb", FB_GROUP_URL: "javascript:alert(1)", TELEGRAM_CHAT_ID: "-100123" }), [], "link lạ hoặc chat id dạng số: không hiện");
  assert.equal(fbPageUrl({ FB_PAGE_URL: "https://facebook.com/x" }), "https://facebook.com/x");
});
