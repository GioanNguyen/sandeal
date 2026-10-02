/** Nội dung riêng trang sản phẩm, lịch bài hướng dẫn + đăng Facebook, đo tốc độ trang người dùng thật */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";

import { buyAdvice } from "./advice";
import { money, priceChanges, productStory, shortName, type StoryInput } from "./productstory";
import { ALL_GUIDES, guideBySlug, guidePublishAt, publishedGuides, upcomingGuides } from "./guides";
import { cleanVital, isBotUa, pageType, passes, rate } from "./vitals";

let dbm: typeof import("./db");
let vitals: typeof import("./vitals");
let guidesW: typeof import("@/worker/guides");
let ingest: typeof import("./ingest");
let ps: typeof import("./productstory");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  vitals = await import("./vitals");
  guidesW = await import("@/worker/guides");
  ingest = await import("./ingest");
  ps = await import("./productstory");
});

const DAY = 86_400_000;
const NOW = new Date("2026-10-02T05:00:00Z");

function input(over: Partial<StoryInput> = {}, prices = [500_000, 520_000, 480_000, 510_000, 450_000], price = 450_000): StoryInput {
  const history = prices.map((p, i) => ({ price: p, capturedAt: new Date(NOW.getTime() - (40 - i * 8) * DAY) }));
  return {
    id: 7,
    name: "Máy lọc không khí mini Xiaomi 4 Lite (Chính hãng) | Bảo hành 12 tháng",
    platformLabel: "Shopee",
    price,
    gone: false,
    history,
    advice: buyAdvice(history, price, NOW),
    offers: [],
    category: null,
    shop: { name: null, mall: false, rating: null },
    variants: null,
    reviews: null,
    unitText: null,
    afterCodes: price,
    sold: null,
    now: NOW,
    ...over,
  };
}

test("nhận xét giá: viết từ số liệu thật của món, không câu nào chứa giá trị thiếu", () => {
  const s = productStory(input());
  const all = [...s.paragraphs, ...s.faqs.flatMap((f) => [f.q, f.a]), s.meta].join("\n");
  assert.doesNotMatch(all, /undefined|NaN|null|Infinity/);
  assert.match(s.paragraphs[0], /450\.000 ₫/);
  assert.match(s.paragraphs[0], /thấp nhất trong toàn bộ thời gian theo dõi/, "giá hôm nay là đáy");
  assert.equal(shortName("Máy lọc không khí mini Xiaomi 4 Lite (Chính hãng) | Bảo hành 12 tháng"), "Máy lọc không khí mini Xiaomi 4");
  assert.ok(s.meta.length <= 160);
  assert.match(s.meta, /^Máy lọc không khí/);
  assert.ok(s.faqs.some((f) => /giá bao nhiêu/.test(f.q)));
  assert.ok(s.faqs.some((f) => /thấp nhất/.test(f.q)));
  assert.equal(money(1234567), "1.234.567 ₫");
});

test("nhận xét giá: mỗi trang khác nhau – câu mở đầu đổi theo món, số liệu theo món", () => {
  const a = productStory(input({ id: 1 }));
  const b = productStory(input({ id: 2 }));
  const c = productStory(input({ id: 3 }));
  const openings = new Set([a, b, c].map((s) => s.paragraphs[0].slice(0, 25)));
  assert.equal(openings.size, 3, "3 kiểu câu mở đầu");
  const dear = productStory(input({}, [400_000, 410_000, 405_000, 400_000, 420_000], 520_000));
  assert.match(dear.paragraphs[0], /cao hơn \d+% so với giá thường ngày/);
  assert.match(dear.faqs[1].a, /cao hơn giá thường ngày/);
});

test("nhận xét giá: thêm sàn khác, danh mục, phân loại, shop, đánh giá; món mới và món đã vắng", () => {
  const s = productStory(
    input({
      offers: [
        { platformLabel: "Shopee", price: 450_000, current: true },
        { platformLabel: "Lazada", price: 430_000, current: false },
      ],
      category: { name: "Máy lọc không khí", count: 40, median: 1_200_000, cheaperShare: 10 },
      variants: { count: 3, min: 450_000, max: 690_000 },
      shop: { name: "Xiaomi Official", mall: true, rating: 4.9 },
      reviews: { count: 24, pros: ["Lọc tốt", "Chạy êm"], cons: ["Giao chậm"] },
      unitText: "",
    }),
  );
  const text = s.paragraphs.join(" ");
  assert.match(text, /mua ở Lazada rẻ hơn 20\.000 ₫/);
  assert.match(text, /Trong 40 món Máy lọc không khí .* thuộc nhóm rẻ nhất/);
  assert.match(text, /3 phân loại, từ 450\.000 ₫ đến 690\.000 ₫/);
  assert.match(text, /shop chính hãng \(Mall\) Xiaomi Official/);
  assert.match(text, /khen lọc tốt, chạy êm; chê giao chậm/);
  assert.ok(s.faqs.some((f) => /sàn nào rẻ nhất/.test(f.q) && /Lazada/.test(f.a)));
  const cheapest = productStory(input({ category: { name: "Máy lọc không khí", count: 12, median: 900_000, cheaperShare: 0 } }));
  assert.match(cheapest.paragraphs.join(" "), /Trong 12 món Máy lọc không khí .* là món rẻ nhất;/);

  const fresh = productStory(input({}, [450_000], 450_000));
  const freshHist = [{ price: 450_000, capturedAt: new Date(NOW.getTime() - 2 * DAY) }];
  const f2 = productStory({ ...input(), history: freshHist, advice: buyAdvice(freshHist, 450_000, NOW) });
  assert.match(f2.paragraphs[0], /chưa đủ dữ liệu|cần khoảng một tuần/);
  assert.ok(!f2.faqs.some((f) => /thấp nhất/.test(f.q)), "chưa đủ dữ liệu thì không trả lời giá thấp nhất");
  assert.ok(fresh.paragraphs.length >= 1);

  const gone = productStory(input({ gone: true }));
  assert.match(gone.paragraphs[0], /không còn thấy/);
  assert.ok(!gone.faqs.some((f) => /Có nên mua/.test(f.q)), "món đã vắng: không mời mua");
  assert.match(gone.meta, /giá lần cuối/);
});

test("đếm số lần đổi giá trong 30 ngày", () => {
  const h = [600, 600, 590, 650, 650, 640].map((p, i) => ({ price: p * 1000, capturedAt: new Date(NOW.getTime() - (35 - i * 6) * DAY) }));
  assert.equal(priceChanges(h, NOW), 3);
});

test("vị trí giá trong danh mục: chỉ tính món còn bán", async () => {
  for (let i = 0; i < 6; i++) {
    await ingest.upsertProduct({ platform: "shopee", externalId: `77010${i}`, name: `Nồi chiên không dầu ${i}`, price: 500_000 + i * 100_000, discountPct: 0, affiliateUrl: "https://e.com", category: "Nồi chiên" }, new Date());
  }
  const st = await ps.categoryStats("Nồi chiên", 650_000);
  assert.equal(st?.count, 6);
  assert.equal(st?.median, 750_000);
  assert.equal(Math.round(st!.cheaperShare), 33);
  assert.equal(await ps.categoryStats(null, 1), null);
});

test("lịch bài hướng dẫn: bài tự hiện lúc 8h ngày đăng, đều mỗi tuần, không trùng đường dẫn", () => {
  const slugs = new Set(ALL_GUIDES.map((g) => g.slug));
  assert.equal(slugs.size, ALL_GUIDES.length, "không trùng slug");
  assert.ok(ALL_GUIDES.length >= 13);
  const g = ALL_GUIDES.find((x) => x.slug === "cach-xem-lich-su-gia-san-pham")!;
  assert.equal(guidePublishAt(g).toISOString(), "2026-10-06T01:00:00.000Z", "8h sáng giờ Việt Nam");
  assert.equal(guideBySlug(g.slug, new Date("2026-10-06T00:59:00Z")), undefined, "chưa tới giờ: không xem được");
  assert.ok(guideBySlug(g.slug, new Date("2026-10-06T00:59:00Z"), true), "quản trị viên xem trước được");
  assert.ok(guideBySlug(g.slug, new Date("2026-10-06T01:00:00Z")));
  const at = new Date("2026-10-07T00:00:00Z");
  assert.equal(publishedGuides(at)[0].slug, g.slug, "mới nhất trước");
  assert.ok(upcomingGuides(at).every((x) => guidePublishAt(x) > at));
  // Lịch đều: các bài trong lịch cách nhau không quá 8 ngày
  const sched = upcomingGuides(new Date("2026-10-01T00:00:00Z")).map((x) => guidePublishAt(x).getTime());
  for (let i = 1; i < sched.length; i++) assert.ok(sched[i] - sched[i - 1] <= 8 * DAY, `khoảng trống trước ${new Date(sched[i]).toISOString()}`);
  for (const x of ALL_GUIDES) assert.ok(x.description.length >= 70 && x.description.length <= 200, `mô tả ${x.slug}: ${x.description.length} ký tự`);
});

test("đăng bài hướng dẫn lên Facebook: bài ảnh có ảnh bìa, link ở bình luận đầu, mỗi bài 1 lần, thử lại khi lỗi", async () => {
  process.env.FB_PAGE_ID = "123";
  process.env.FB_PAGE_TOKEN = "tok";
  const calls: { url: string; body: Record<string, string> }[] = [];
  let fail: "all" | "comment" | null = "all";
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    const isComment = String(url).endsWith("/comments");
    if (fail === "all" || (fail === "comment" && isComment)) return new Response(JSON.stringify({ error: { message: "Token hết hạn" } }), { status: 400 });
    return new Response(JSON.stringify(isComment ? { id: "c1" } : { id: "999", post_id: "123_999" }), { status: 200 });
  }) as typeof fetch;
  try {
    const at = new Date("2026-10-13T01:30:00Z"); // 8h30 ngày đăng bài "sàn nào rẻ hơn"
    assert.equal(await guidesW.shareDueGuides(at), 0, "lỗi lần đầu");
    fail = null;
    assert.equal(await guidesW.shareDueGuides(at), 1);
    assert.equal(await guidesW.shareDueGuides(at), 0, "không đăng lại bài đã đăng");
    const photo = calls.at(-2)!;
    const comment = calls.at(-1)!;
    assert.match(photo.url, /\/123\/photos$/, "đăng bài ảnh");
    assert.equal(photo.body.url, "https://sandealgiare.com/huong-dan/shopee-lazada-tiktok-shop-san-nao-re-hon/anh-bia");
    assert.match(photo.body.caption, /Shopee, Lazada hay TikTok Shop/);
    assert.doesNotMatch(photo.body.caption, /https?:\/\//, "thân bài không có link");
    assert.match(comment.url, /\/123_999\/comments$/);
    assert.match(comment.body.message, /https:\/\/sandealgiare\.com\/huong-dan\/shopee-lazada-tiktok-shop-san-nao-re-hon/);
    // Bài cũ hơn 3 ngày và bài chưa tới ngày: không tự đăng
    const n = calls.length;
    assert.equal(await guidesW.shareDueGuides(new Date("2026-10-19T01:30:00Z")), 0);
    assert.equal(calls.length, n);
    const st = await guidesW.guideShareStatus();
    assert.equal(st.get("shopee-lazada-tiktok-shop-san-nao-re-hon")?.externalId, "123_999");

    // Ảnh đã lên nhưng bình luận lỗi: coi là đã đăng, không đăng trùng lần sau, có ghi chú
    fail = "comment";
    const at2 = new Date("2026-10-20T01:30:00Z");
    assert.equal(await guidesW.shareDueGuides(at2), 1);
    const m = calls.length;
    assert.equal(await guidesW.shareDueGuides(at2), 0);
    assert.equal(calls.length, m, "không đăng lại ảnh");
    const s2 = (await guidesW.guideShareStatus()).get("cach-kiem-tra-shop-uy-tin");
    assert.equal(s2?.externalId, "123_999");
    assert.match(s2?.error ?? "", /bình luận/);
  } finally {
    globalThis.fetch = orig;
    delete process.env.FB_PAGE_ID;
    delete process.env.FB_PAGE_TOKEN;
  }
});

test("ảnh bìa: mọi bài có nhãn, hình và 3 ý ngắn; vẽ được ảnh dọc 4:5 và ảnh ngang", async () => {
  const { coverFor, GUIDE_COVERS } = await import("./guide-covers");
  const { guideCoverImage } = await import("./og");
  for (const g of ALL_GUIDES) {
    assert.ok(GUIDE_COVERS[g.slug], `thiếu ảnh bìa: ${g.slug}`);
    const c = coverFor(g);
    assert.equal(c.points.length, 3, g.slug);
    for (const t of c.points) assert.ok(t.length <= 42, `ý quá dài (${t.length}): ${t}`);
  }
  assert.ok(Object.keys(GUIDE_COVERS).every((k) => ALL_GUIDES.some((g) => g.slug === k)), "không có ảnh bìa thừa");
  const longest = [...ALL_GUIDES].sort((a, b) => b.title.length - a.title.length)[0];
  const c = coverFor(longest);
  for (const [kind, w, h] of [["fb", 1080, 1350], ["og", 1200, 630]] as const) {
    const buf = Buffer.from(await (await guideCoverImage({ title: longest.title, ...c, domain: "sandealgiare.com" }, kind)).arrayBuffer());
    assert.equal(buf.subarray(1, 4).toString(), "PNG");
    assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [w, h]);
  }
});

test("đo tốc độ: làm sạch số đo, xếp loại theo ngưỡng Google, bỏ trang quản trị và bot", () => {
  assert.equal(rate("LCP", 2500), "good");
  assert.equal(rate("LCP", 2600), "needs-improvement");
  assert.equal(rate("CLS", 0.3), "poor");
  assert.equal(pageType("/product/may-loc-123"), "Sản phẩm");
  assert.equal(pageType("/"), "Trang chủ");
  assert.equal(pageType("/huong-dan/abc"), "Bài viết");
  assert.equal(pageType("/admin/toc-do"), null);
  const v = cleanVital({ name: "LCP", value: 3123.7, path: "/product/x-1?utm=fb#a", device: "mobile", net: "4g" })!;
  assert.deepEqual(v, { metric: "LCP", value: 3124, rating: "needs-improvement", page: "Sản phẩm", path: "/product/x-1", device: "mobile", net: "4g" });
  assert.equal(cleanVital({ name: "XYZ", value: 1, path: "/" }), null);
  assert.equal(cleanVital({ name: "LCP", value: -1, path: "/" }), null);
  assert.equal(cleanVital({ name: "LCP", value: 999_999, path: "/" }), null);
  assert.equal(cleanVital({ name: "LCP", value: 100, path: "https://evil.com/" }), null);
  assert.equal(cleanVital({ name: "CLS", value: 0.12345, path: "/", device: "tablet", net: "<script>" })!.net, null);
  assert.ok(isBotUa("Mozilla/5.0 (compatible; Googlebot/2.1)"));
  assert.ok(isBotUa("Mozilla/5.0 ... Chrome-Lighthouse"));
  assert.ok(!isBotUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"));
});

test("đo tốc độ: báo cáo p75 theo thiết bị, loại trang, ngày; đạt/chưa đạt Core Web Vitals", async () => {
  const now = new Date();
  const batch: { name: string; value: number; path: string; device: string }[] = [];
  // 40 lượt xem trang sản phẩm trên điện thoại: LCP 1000..4900 ms, INP 100..490, CLS 0..0.039
  for (let i = 0; i < 40; i++) {
    batch.push({ name: "LCP", value: 1000 + i * 100, path: `/product/p-${i % 4}`, device: "mobile" });
    batch.push({ name: "INP", value: 100 + i * 10, path: `/product/p-${i % 4}`, device: "mobile" });
    batch.push({ name: "CLS", value: i * 0.001, path: `/product/p-${i % 4}`, device: "mobile" });
    batch.push({ name: "TTFB", value: 300, path: `/product/p-${i % 4}`, device: "mobile" });
  }
  for (let i = 0; i < 25; i++) {
    batch.push({ name: "LCP", value: 1200, path: "/", device: "desktop" });
    batch.push({ name: "INP", value: 80, path: "/", device: "desktop" });
    batch.push({ name: "CLS", value: 0.01, path: "/", device: "desktop" });
    batch.push({ name: "TTFB", value: 200, path: "/", device: "desktop" });
  }
  batch.push({ name: "LCP", value: 9000, path: "/admin", device: "mobile" }); // bị bỏ
  for (let i = 0; i < batch.length; i += 10) await vitals.recordVitals(batch.slice(i, i + 10), now);

  const r = await vitals.vitalsReport(28, new Date(now.getTime() + 1000));
  const lcp = r.mobile.find((x) => x.metric === "LCP")!;
  assert.equal(lcp.n, 40, "trang quản trị không tính");
  assert.ok(Math.abs(lcp.p75! - 3925) < 1, `p75 LCP ${lcp.p75}`);
  assert.equal(Math.round(lcp.good), 40, "16/40 lượt ≤ 2,5 s");
  assert.equal(passes(r.mobile), false, "LCP p75 3,9 s: chưa đạt");
  assert.equal(passes(r.desktop), true);
  assert.equal(r.views.mobile, 40);
  assert.equal(r.pages[0].page, "Sản phẩm", "nhiều lượt xem nhất trước");
  assert.ok(r.pages[0].mobile.LCP!.p75 > 3000);
  assert.equal(r.trend.days.length, 28);
  assert.ok(r.trend.LCP.at(-1)! > 3000, "điểm hôm nay trên biểu đồ");
  assert.equal(r.slowPaths.length, 4);
  assert.ok(r.slowPaths.every((s) => s.page === "Sản phẩm"));

  await vitals.pruneVitals(new Date(now.getTime() + 61 * DAY));
  const after = await vitals.vitalsReport(28, new Date(now.getTime() + 1000));
  assert.equal(after.views.mobile + after.views.desktop, 0, "xoá sau 60 ngày");
});
