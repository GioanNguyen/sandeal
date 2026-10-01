/** Tóm tắt đánh giá & cảnh báo rủi ro: làm sạch dữ liệu, phân tích tiếng Việt, rủi ro, lưu trữ, AI (giả lập) */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SOURCES = "mock";

import { analyzeReviews, sentencePolarity, type ReviewLike } from "./reviews/analyze";
import { combineRisk, productFlags, type RiskInput } from "./reviews/risk";
import { buildPrompt, parseAiReply } from "./reviews/ai";
import { cleanReview, parseReviewDate, scrubText } from "./reviews/store";

let dbm: typeof import("./db");
let store: typeof import("./reviews/store");
let ai: typeof import("./reviews/ai");
let insight: typeof import("./reviews");
let ingest: typeof import("./ingest");
let schema: typeof import("@/db/schema");
let q: typeof import("./queries");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  store = await import("./reviews/store");
  ai = await import("./reviews/ai");
  insight = await import("./reviews");
  ingest = await import("./ingest");
  schema = await import("@/db/schema");
  q = await import("./queries");
});

const R = (rating: number, body: string, daysAgo = 3): ReviewLike => ({ rating, body, postedAt: new Date(Date.now() - daysAgo * 86_400_000) });

test("làm sạch: bỏ số điện thoại/email/link, đọc ngày, chống trùng", () => {
  assert.equal(scrubText("Hàng ok, zalo 0912 345 678 hoặc a.b@gmail.com xem https://x.vn/a"), "Hàng ok, zalo hoặc xem");
  assert.equal(parseReviewDate("2024-05-01 10:20")?.toISOString(), "2024-05-01T03:20:00.000Z");
  assert.equal(parseReviewDate("01-05-2024")?.toISOString().slice(0, 10), "2024-04-30");
  assert.equal(parseReviewDate("2099-01-01"), null);
  assert.equal(parseReviewDate("hôm qua"), null);
  assert.equal(cleanReview({ rating: 0, text: "x" }), null);
  const a = cleanReview({ rating: 5, text: "Đẹp lắm", variant: "Phân loại hàng: Đen, XL", date: "2024-05-01 10:20" })!;
  assert.equal(a.variant, "Đen, XL");
  assert.equal(a.hash, cleanReview({ rating: 5, text: "Đẹp  lắm ", variant: "Đen, XL", date: "2024-05-01 10:20" })!.hash);
});

test("câu khen/chê có phủ định, viết không dấu", () => {
  assert.ok(sentencePolarity("Hàng đẹp, giao nhanh") > 0);
  assert.ok(sentencePolarity("không đẹp lắm") < 0);
  assert.ok(sentencePolarity("dùng 1 tháng không bị lỗi gì") > 0);
  assert.ok(sentencePolarity("ao khong giong hinh") < 0);
  assert.ok(sentencePolarity("không đáng tiền") < 0);
  assert.equal(sentencePolarity("vừa nhận hàng xong"), 0);
});

test("tóm tắt: rút ra điểm khen, điểm chê theo khía cạnh", () => {
  const reviews = [
    ...Array.from({ length: 8 }, (_, i) => R(5, `Vải mát, chất lượng tốt. Giao hàng nhanh lắm ${i}`)),
    ...Array.from({ length: 3 }, (_, i) => R(2, `Size nhỏ hơn bảng, mặc bị chật ${i}`)),
    R(4, "Đóng gói cẩn thận, màu đẹp"),
    R(3, ""),
  ];
  const s = analyzeReviews(reviews);
  assert.equal(s.count, 13);
  assert.equal(s.withText, 12);
  assert.ok(s.pros.includes("Chất lượng") && s.pros.includes("Giao hàng"), s.pros.join());
  assert.ok(s.cons.includes("Kích cỡ, form chưa chuẩn"), s.cons.join());
  assert.match(s.headline, /khen nhiều về .*chất lượng/i);
  assert.match(s.headline, /phàn nàn: kích cỡ, form chưa chuẩn/i);
  assert.equal(s.flags.length, 0);
});

test("dấu hiệu rủi ro từ đánh giá: hàng giả, khác hình, nhiều 1–2★, 5★ rỗng, lệch điểm sàn", () => {
  const fake = analyzeReviews([
    R(1, "Hàng fake, không giống hình gì cả"),
    R(1, "hàng nhái, chất lượng kém"),
    R(2, "Không giống hình, khác ảnh shop đăng"),
    R(2, "Sai màu, không giống mô tả"),
    ...Array.from({ length: 12 }, (_, i) => R(5, `Tốt ${i}`)),
  ], { platformRating: 4.9 });
  const keys = fake.flags.map((f) => f.key);
  assert.ok(keys.includes("fake"), keys.join());
  assert.ok(keys.includes("notDescribed"), keys.join());
  assert.ok(keys.includes("thin5"), keys.join());
  assert.equal(fake.flags.find((f) => f.key === "fake")!.level, "high");

  // "Không phải hàng giả" là khen, không bị tính
  const ok = analyzeReviews(Array.from({ length: 10 }, () => R(5, "Hàng chính hãng, không phải hàng giả đâu nha, check mã ok")));
  assert.ok(!ok.flags.some((f) => f.key === "fake"));

  const bad = analyzeReviews([...Array.from({ length: 6 }, () => R(1, "Tệ")), ...Array.from({ length: 6 }, () => R(4, "Ổn"))], { platformRating: 4.9 });
  assert.ok(bad.flags.some((f) => f.key === "lowStars" && f.level === "high"));
  assert.ok(bad.flags.some((f) => f.key === "ratingGap"));
});

test("rủi ro từ giá & shop, gộp mức rủi ro", () => {
  const base: RiskInput = { price: 100_000, discountPct: 10, realDropPct: 5, trackedDays: 30, inflatedBeforeSale: false, shopType: null, rating: 4.7, sold: 500 };
  assert.deepEqual(productFlags(base), []);
  assert.equal(combineRisk(productFlags(base)).level, "none");
  const k = (i: Partial<RiskInput>) => productFlags({ ...base, ...i }).map((f) => f.key);
  assert.deepEqual(k({ inflatedBeforeSale: true }), ["inflated"]);
  assert.deepEqual(k({ discountPct: 60, realDropPct: 1 }), ["fakeDiscount"]);
  assert.deepEqual(k({ discountPct: 60, realDropPct: 1, trackedDays: 5 }), [], "chưa đủ lịch sử thì không kết luận");
  assert.deepEqual(k({ mallPrice: 300_000 }), ["tooCheap"]);
  assert.deepEqual(k({ mallPrice: 300_000, shopType: "mall" }), []);
  assert.deepEqual(k({ shopRating: 3.8 }), ["shopRating"]);
  assert.deepEqual(k({ rating: 5, sold: 3 }), ["fewRatings"]);
  assert.deepEqual(k({ starCounts: [391, 304, 828, 2000, 34600] }), [], "Shopee thường ~2% 1–2★");
  assert.deepEqual(k({ starCounts: [30, 10, 20, 40, 100] }), ["lowStars"]);
  const two = combineRisk(productFlags({ ...base, inflatedBeforeSale: true, discountPct: 60, realDropPct: 1 }));
  assert.equal(two.level, "high", "hai dấu hiệu mức vừa -> cao");
  assert.equal(combineRisk(productFlags({ ...base, rating: 5, sold: 3 })).level, "low");
});

test("lưu đánh giá từ tiện ích, bỏ trùng, cập nhật số lượt; cảnh báo rẻ bất thường so với shop Mall", async () => {
  const { db } = dbm;
  const { products, productReviews } = schema;
  const mk = (externalId: string, price: number, shopType?: "mall") =>
    ingest.upsertProduct({ platform: "shopee", externalId, name: `Tai nghe XYZ Pro ${externalId}`, price, discountPct: 0, affiliateUrl: "https://e.com", shopType });
  const cheap = await mk("777001", 150_000);
  const mall = await mk("777002", 400_000, "mall");
  await db.update(products).set({ groupKey: "tai-nghe-xyz" }).where(eq(products.id, cheap));
  await db.update(products).set({ groupKey: "tai-nghe-xyz" }).where(eq(products.id, mall));

  assert.equal((await store.recordReviews({ url: "https://shopee.vn/product/1/999999", reviews: [{ rating: 5, text: "x" }] })).status, "unknown");
  assert.equal((await store.recordReviews({ url: "not a url" })).status, "invalid");

  const batch = {
    url: "https://shopee.vn/Tai-nghe-i.1.777001",
    ratingCount: 1234,
    starCounts: [10, 5, 20, 100, 1099],
    reviews: [
      { rating: 1, text: "Hàng fake, gọi 0912345678 để đổi", date: "2026-09-20 10:00" },
      { rating: 1, text: "hàng nhái rõ ràng", date: "2026-09-21 10:00" },
      { rating: 5, text: "Âm thanh hay, pin trâu", date: "2026-09-22 10:00", variant: "Phân loại hàng: Đen" },
      { rating: 9, text: "sao sai" },
    ],
  };
  const r1 = await store.recordReviews(batch);
  assert.deepEqual([r1.status, r1.added], ["ok", 3]);
  const r2 = await store.recordReviews(batch);
  assert.equal(r2.added, 0, "gửi lại không bị trùng");
  const saved = await db.select().from(productReviews).where(eq(productReviews.productId, cheap));
  assert.ok(saved.every((x) => !/0912/.test(x.body)), "đã xoá số điện thoại");
  assert.equal(saved.find((x) => x.rating === 5)?.variant, "Đen");

  const p = (await q.getProduct(cheap))!;
  const ins = await insight.productInsight(p);
  assert.equal(ins.ratingCount, 1234);
  assert.deepEqual(ins.starCounts, [10, 5, 20, 100, 1099]);
  assert.equal(ins.reviews?.count, 3);
  const keys = ins.risk.flags.map((f) => f.key);
  assert.ok(keys.includes("tooCheap"), keys.join());
  assert.ok(keys.includes("fake"), keys.join());
  assert.equal(ins.risk.level, "high");

  // Món ở shop Mall: không bị cảnh báo rẻ bất thường
  const insMall = await insight.productInsight((await q.getProduct(mall))!);
  assert.ok(!insMall.risk.flags.some((f) => f.key === "tooCheap"));
  assert.equal(insMall.reviews, null);
});

test("AI: chọn đủ các mức sao, đọc kết quả an toàn, chỉ tóm tắt lại khi có đủ đánh giá mới", async () => {
  const many = [
    ...Array.from({ length: 30 }, (_, i) => ({ rating: 5, body: `Rất tốt, đáng tiền lắm ${i}`, variant: null })),
    ...Array.from({ length: 3 }, (_, i) => ({ rating: 1, body: `Hỏng sau 2 ngày <script> ${i}`, variant: null })),
  ];
  const { text, used } = buildPrompt("Tai nghe", many);
  assert.ok(used >= 33 || text.includes("1★"), "đánh giá 1★ không bị lấn át");
  assert.ok(!text.includes("<script>"));
  assert.equal(parseAiReply("không phải json", "m"), null);
  const parsed = parseAiReply('Đây: {"summary":"Âm thanh tốt, pin lâu. Một số người gặp lỗi kết nối. Hợp người đi làm.","pros":["Âm thanh tốt","https://x.vn spam"],"cons":[]}', "m")!;
  assert.equal(parsed.pros[0], "Âm thanh tốt");
  assert.ok(!parsed.pros.some((x) => x.includes("http")));

  // Chạy worker với API giả
  const { db } = dbm;
  const id = await ingest.upsertProduct({ platform: "lazada", externalId: "888001", name: "Nồi chiên ABC", price: 900_000, discountPct: 0, affiliateUrl: "https://e.com" });
  const add = (n: number, from: number) =>
    store.recordReviews({ url: "https://www.lazada.vn/products/noi-i888001.html", reviews: Array.from({ length: n }, (_, i) => ({ rating: 4, text: `Nồi chiên ngon, dễ vệ sinh số ${from + i}` })) });
  await add(7, 0);
  process.env.ANTHROPIC_API_KEY = "test-key";
  let calls = 0;
  const fakeFetch = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    calls++;
    assert.equal(init.headers["x-api-key"], "test-key");
    assert.match(JSON.parse(init.body).messages[0].content, /<reviews>/);
    return new Response(JSON.stringify({ content: [{ type: "text", text: '{"summary":"Nồi chiên ngon, dễ vệ sinh, đáng mua cho gia đình nhỏ.","pros":["Dễ vệ sinh"],"cons":[]}' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    assert.equal(await ai.runReviewAi(new Date(), fakeFetch), 0, "chưa đủ 8 đánh giá");
    await add(3, 7);
    assert.equal(await ai.runReviewAi(new Date(), fakeFetch), 1);
    assert.equal(calls, 1);
    const [meta] = await db.select().from(schema.productReviewMeta).where(eq(schema.productReviewMeta.productId, id));
    assert.equal(meta.aiSummary?.pros[0], "Dễ vệ sinh");
    assert.equal(meta.aiReviewCount, 10);
    // Ngày mai, thêm 1 đánh giá: chưa đủ để tóm tắt lại
    await add(1, 10);
    assert.equal(await ai.runReviewAi(new Date(Date.now() + 2 * 86_400_000), fakeFetch), 0);
    // Thêm đủ 20% và ≥5: tóm tắt lại
    await add(5, 11);
    assert.equal(await ai.runReviewAi(new Date(Date.now() + 2 * 86_400_000), fakeFetch), 1);
    assert.equal(calls, 2);
    const ins = await insight.productInsight((await q.getProduct(id))!);
    assert.equal(ins.ai?.summary.startsWith("Nồi chiên ngon"), true);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("tiện ích: đọc số lượt và đánh giá từ JSON-LD", () => {
  const require = createRequire(import.meta.url);
  require("../../extension/extract.js");
  const X = (globalThis as unknown as { SanDealExtract: { reviewsFromData: (ld: unknown[]) => { ratingCount?: number; reviews: { rating: number; text: string }[] }; countNum: (s: string) => number } }).SanDealExtract;
  const r = X.reviewsFromData([{ "@type": "Product", name: "A", aggregateRating: { ratingValue: 4.8, ratingCount: "1520" }, review: [{ reviewRating: { ratingValue: 5 }, reviewBody: "Tốt" }, { reviewRating: { ratingValue: 0 } }] }]);
  assert.equal(r.ratingCount, 1520);
  assert.deepEqual(r.reviews.map((x) => x.rating), [5]);
  assert.equal(X.countNum("1,2k"), 1200);
});
