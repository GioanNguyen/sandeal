/** Làm đầy dữ liệu: tự xếp danh mục, lấy ảnh, sửa hàng loạt */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

import { canonicalCategory, confident, guessCategory } from "./autocategory";

let ingest: typeof import("./ingest");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");
let ac: typeof import("../worker/autocategory");
let fi: typeof import("../worker/fillimages");
let ph: typeof import("./producthealth");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  schema = await import("@/db/schema");
  ac = await import("../worker/autocategory");
  fi = await import("../worker/fillimages");
  ph = await import("./producthealth");
});

const NOW = new Date();
const cat = (n: string) => guessCategory(n)?.category ?? null;

test("đoán danh mục theo từ khoá: cụm từ dài thắng từ đơn, bỏ dấu, tên tiếng Anh của sàn gộp về tiếng Việt", () => {
  assert.equal(cat("[DAILY] Sữa Tắm Lifebuoy 800gr Detox Sạch Sâu"), "Sắc Đẹp", "sữa tắm thắng sữa");
  assert.equal(cat("Thùng 24 hộp Sữa hạt 9 loại hạt Vinamilk ít đường"), "Bách Hóa Online");
  assert.equal(cat("Combo 4 Thùng Sữa Bột Pha Sẵn Nutifood GrowPLUS+"), "Mẹ & Bé");
  assert.equal(cat("Móng Tay Giả Đính Đá Hin Nail Hộp 24 Nail Box"), "Sắc Đẹp");
  assert.equal(cat("Cường lực iPhone tự dán chống nhìn trộm ip 15 Pro max"), "Điện Thoại & Phụ Kiện");
  assert.equal(cat("Vợt cầu lông Yonex Arc 7 Tour"), "Thể Thao & Du Lịch");
  assert.equal(cat("Quạt tích điện để bàn mini 100 tốc độ gió"), "Thiết Bị Điện Gia Dụng");
  assert.equal(cat("Combo 10 Quần lót nam cotton"), "Thời Trang Nam");
  assert.equal(cat("Áo sơ mi nam công sở"), "Thời Trang Nam", "không nhầm 'sơ mi' thành 'sổ'");
  assert.equal(cat("Sản phẩm cao cấp chính hãng"), null, "'cao cấp' không bị hiểu là 'cặp'");
  assert.equal(guessCategory("Xyz abc"), null);
  // Mơ hồ (điểm bằng nhau) thì chưa đủ chắc để tự gán
  assert.equal(confident({ score: 4, runnerUp: 4 }), false);
  assert.equal(confident({ score: 9, runnerUp: 4 }), true);
  assert.equal(confident({ score: 1, runnerUp: 0 }), true);
  assert.equal(canonicalCategory("Women Clothes"), "Thời Trang Nữ");
  assert.equal(canonicalCategory("sắc đẹp"), "Sắc Đẹp");
  assert.equal(canonicalCategory("100630"), null);
});

const add = (id: string, name: string, extra: Partial<Parameters<typeof import("./ingest").upsertProduct>[0]> = {}) =>
  ingest.upsertProduct({ platform: "shopee", externalId: id, name, price: 100_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", ...extra }, NOW);

test("tự xếp danh mục: từ khoá trước, món khó hỏi AI (chỉ nhận danh mục hợp lệ), không ghi đè danh mục đã có", async () => {
  const nail = await add("1", "Nailbox mắt mèo ánh trăng");
  const odd = await add("2", "Ô dù tự động hai mặt chống nắng"); // mơ hồ: Sắc Đẹp / Phụ kiện
  const weird = await add("3", "Xyz abc 123"); // không khớp từ nào
  const has = await add("4", "Bàn phím cơ", { category: "Women Clothes" }); // tên tiếng Anh -> gộp
  process.env.ANTHROPIC_API_KEY = "k";
  const asked: string[] = [];
  const fakeAi = (async (_u: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    asked.push(body.messages[0].content);
    return new Response(JSON.stringify({ content: [{ type: "text", text: `{"${odd}": "Phụ Kiện & Trang Sức Nữ", "${weird}": "Danh mục bịa"}` }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await ac.runAutoCategory({ fetchImpl: fakeAi });
  assert.equal(r.byRules, 1);
  assert.equal(r.byAi, 1);
  assert.equal(r.left, 1, "AI trả danh mục không có trong danh sách: để trống");
  assert.ok(asked[0].includes("Ô dù tự động") && !asked[0].includes("Nailbox"), "chỉ hỏi AI món từ khoá không chắc");
  const { eq } = await import("drizzle-orm");
  const get = async (id: number) => (await dbm.db.select().from(schema.products).where(eq(schema.products.id, id)))[0];
  assert.deepEqual([(await get(nail)).category, (await get(nail)).categorySource], ["Sắc Đẹp", "auto"]);
  assert.deepEqual([(await get(odd)).category, (await get(odd)).categorySource], ["Phụ Kiện & Trang Sức Nữ", "ai"]);
  assert.equal((await get(has)).category, "Thời Trang Nữ");
  assert.equal((await get(has)).categorySource, null);

  // Lần sau không hỏi AI lại món đã thử
  const before = asked.length;
  await ac.runAutoCategory({ fetchImpl: fakeAi });
  assert.equal(asked.length, before);

  // Không có AI: dùng luôn kết quả từ khoá chưa chắc
  delete process.env.ANTHROPIC_API_KEY;
  const odd2 = await add("5", "Set 50 kẹp tóc màu hồng cho bé gái");
  await ac.runAutoCategory();
  assert.ok((await get(odd2)).category, "có danh mục dù mơ hồ");
  assert.equal((await get(odd2)).categorySource, "auto");

  // Đồng bộ lại từ nguồn không có danh mục/ảnh: giữ danh mục tự xếp
  await add("1", "Nailbox mắt mèo ánh trăng", { price: 90_000 });
  assert.equal((await get(nail)).category, "Sắc Đẹp");
  // Nguồn có danh mục: thay danh mục tự xếp, bỏ đánh dấu
  await add("1", "Nailbox mắt mèo ánh trăng", { category: "Sắc Đẹp" });
  assert.equal((await get(nail)).categorySource, null);
  // Gán tay: nguồn không ghi đè
  await ph.setCategoryMany([odd], "Thời Trang Nữ");
  await add("2", "Ô dù tự động hai mặt chống nắng", { category: "Nhà Cửa & Đời Sống" });
  assert.deepEqual([(await get(odd)).category, (await get(odd)).categorySource], ["Thời Trang Nữ", "manual"]);
});

test("lấy ảnh: chỉ cập nhật ảnh (không đổi giá/danh mục), bỏ qua món đã có ảnh, không có nguồn thì báo rõ", async () => {
  const id = await add("10", "Món chưa có ảnh", { productUrl: "https://shopee.vn/product/77/10", category: "Sắc Đẹp" });
  const withImg = await add("11", "Món có ảnh", { imageUrl: "https://cf.shopee.vn/file/old.jpg" });
  const refs: { externalId: string; shopId?: string }[] = [];
  const src = {
    name: "shopee",
    lookup: async (ref: { externalId: string; shopId?: string }) => {
      refs.push(ref);
      return { platform: "shopee" as const, externalId: ref.externalId, name: "x", price: 1, discountPct: 0, affiliateUrl: "x", imageUrl: "https://cf.shopee.vn/file/new.jpg", category: "999" };
    },
    fetchProducts: async () => [],
  };
  const r = await fi.runFillImages({ sources: [src as never], delayMs: 0 });
  assert.ok(r.filled >= 1);
  assert.ok(refs.some((x) => x.externalId === "10" && x.shopId === "77"), "dùng mã shop từ link sản phẩm");
  assert.ok(!refs.some((x) => x.externalId === "11"));
  const { eq } = await import("drizzle-orm");
  const [p] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, id));
  assert.equal(p.imageUrl, "https://cf.shopee.vn/file/new.jpg");
  assert.equal(p.price, 100_000);
  assert.equal(p.category, "Sắc Đẹp");
  const [q] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, withImg));
  assert.equal(q.imageUrl, "https://cf.shopee.vn/file/old.jpg");
  assert.match((await fi.runFillImages({ sources: [] })).skipped ?? "", /SHOPEE_APP_ID/);
});

test("sửa hàng loạt: lấy đúng các món khớp bộ lọc, gán danh mục tay, ẩn nhiều món", async () => {
  const ids = await ph.idsMatching({ q: "nailbox" });
  assert.equal(ids.length, 1);
  const none = await ph.idsMatching({ category: ph.NO_CATEGORY });
  assert.ok(none.length >= 1);
  assert.equal(await ph.setCategoryMany(none, "Sắc Đẹp"), none.length);
  assert.equal((await ph.idsMatching({ category: ph.NO_CATEGORY })).length, 0);
  const auto = await ph.idsMatching({ category: ph.AUTO_CATEGORY });
  assert.ok(auto.length >= 1, "lọc được món tự xếp để xem lại");
  assert.equal(await ph.setHiddenMany(auto, true, "thử"), auto.length);
  const c = await ph.categorySourceCounts();
  assert.equal(c.none, 0);
  assert.ok(c.manual >= none.length);
});
