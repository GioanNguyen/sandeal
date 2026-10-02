import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@/db/schema";
import { buyAdvice } from "./advice";
import { POST_KINDS, doanGia, donVi, kyLuc, muaHayCho, nangGia, sauMa, singleDrafts, soSan, thatHayAo, tongHop, vuaGiam, type PostCtx } from "./fbposts";

const DAY = 86_400_000;
const now = new Date("2026-09-30T10:00:00Z");
const SITE = "https://sandealgiare.com";
const mk = (o: Partial<Product>): Product => ({
  id: 47, platform: "shopee", externalId: "1", name: "Tất cổ cao UPPERYOU combo 10 đôi", imageUrl: null, images: null, shopName: "Upper You",
  shopType: null, shopRating: null, category: "Thời trang", price: 82_000, originalPrice: 160_000, discountPct: 49, rating: 4.9, sold: 500_000,
  commissionRate: 0.1, affiliateUrl: "https://s.shopee.vn/x", dealScore: 60, realDropPct: 20, lastSeenAt: now, createdAt: now,
  telegramPostedAt: null, groupKey: null, priceSource: "api", ...o,
} as Product);
const hist = (prices: number[]) => prices.map((price, i) => ({ price, capturedAt: new Date(now.getTime() - (prices.length - i) * 3 * DAY) }));
const ctx = (p: Product, h: { price: number; capturedAt: Date }[], extra: Partial<PostCtx> = {}): PostCtx => ({ p, site: SITE, now, advice: buyAdvice(h, p.price, now), ...extra });

const noLink = (s: string) => assert.doesNotMatch(s, /https?:\/\//, "thân bài không được có link");

test("đủ 12 mẫu", () => assert.equal(POST_KINDS.length, 12));

test("món mới chưa đủ số liệu (vd nhập từ CSV): vẫn có mẫu \"Giới thiệu deal\" để đăng, không bịa số", () => {
  // 1 điểm giá, không giá gốc, không mã, không đơn vị, 1 sàn -> trước đây không có mẫu nào ("Không có mẫu bài phù hợp")
  const p = mk({ name: "Balo cầu lông thể thao NATOLI", originalPrice: null, discountPct: 0, realDropPct: 0, rating: null, sold: 10_000, shopType: "mall", shopName: "Natoli Official Store" });
  const all = singleDrafts(ctx(p, hist([509_000])));
  assert.equal(all.length, 1);
  const d = all[0];
  assert.equal(d.kind, "gioi-thieu");
  noLink(d.body);
  assert.match(d.body, /Deal đáng chú ý trên Shopee/);
  assert.match(d.body, /Balo cầu lông thể thao NATOLI/);
  assert.match(d.body, /Shop Mall chính hãng: Natoli Official Store/);
  assert.match(d.body, /vừa bắt đầu theo dõi giá/);
  assert.doesNotMatch(d.body, /thường ngày|kỷ lục/, "chưa có lịch sử thì không nêu giá thường ngày");
  assert.match(d.comment, /\/p\/47$/m);
  // Có giá gạch của shop: nêu rõ là do shop ghi
  const g = singleDrafts(ctx(mk({ name: "Tai nghe bluetooth X1", originalPrice: 100_000, price: 82_000 }), hist([82_000])))[0];
  assert.equal(g.kind, "gioi-thieu");
  assert.match(g.body, /đang ghi giảm 18%/);
  assert.match(g.body, /giá gạch do shop ghi/);
  // Món đủ số liệu cho mẫu khác thì không dùng mẫu dự phòng
  assert.ok(!singleDrafts(ctx(mk({}), hist([120_000, 110_000, 100_000, 95_000, 90_000, 82_000]))).some((x) => x.kind === "gioi-thieu"));
});

test("tên sản phẩm trong thân bài không bị cắt", () => {
  const long = "Nước giặt D-nee cho trẻ sơ sinh, mềm dịu, thơm nhẹ, không hư hại quần áo - Can 3000ml - 4 Hương thơm Organic Aloe Vera";
  const all = singleDrafts(ctx(mk({ name: long }), hist([120_000, 110_000, 100_000, 95_000, 90_000, 82_000]), { withVoucher: { code: null, title: "Mã sàn", price: 70_000 } }));
  assert.ok(all.length >= 3);
  for (const d of all) {
    assert.ok(d.body.includes(long), d.kind);
    assert.doesNotMatch(d.body, /…/);
  }
  const t = tongHop([1, 2, 3].map((i) => mk({ id: i, name: `${long} ${i}` })), { site: SITE, now, budget: 100_000 })!;
  assert.ok(t.body.includes(`${long} 3`));
});

test("giảm thật hay ảo", () => {
  const real = thatHayAo(ctx(mk({ originalPrice: 160_000, discountPct: 49 }), hist([160_000, 160_000, 160_000, 82_000])))!;
  noLink(real.body);
  assert.match(real.body, /giảm THẬT ✅/);
  const partly = thatHayAo(ctx(mk({}), hist([100_000, 100_000, 100_000, 82_000])))!;
  assert.match(partly.body, /rẻ hơn giá thường ngày 18% – vẫn là giá tốt/);
  assert.match(partly.body, /Kết luận: rẻ thật/);
  assert.match(real.comment, /https:\/\/sandealgiare\.com\/p\/47$/m, "link ngắn /p/<mã>");
  assert.match(real.comment, /tiếp thị liên kết/);
  assert.match(real.comment, /^🛒 Mua thẳng trên Shopee: https:\/\/s\.shopee\.vn\/x$/m, "link tiếp thị liên kết trên sàn");
  assert.doesNotMatch(thatHayAo(ctx(mk({ affiliateUrl: "#" }), hist([100_000, 100_000, 100_000, 70_000])))!.comment, /Mua thẳng/, "link giả thì bỏ");
  const fake = thatHayAo(ctx(mk({ price: 82_000 }), hist([84_000, 83_000, 84_000, 82_000])))!;
  assert.match(fake.body, /giảm thật chỉ \d+% 🤔/);
  assert.equal(thatHayAo(ctx(mk({ originalPrice: null, discountPct: 0 }), hist([100_000, 82_000]))), null, "không có giá gạch");
});

test("đoán giá: đáp án đúng ở bình luận, không lộ ở thân bài", () => {
  const d = doanGia(ctx(mk({ price: 95_000 }), hist([110_000, 80_000, 100_000, 95_000])))!;
  noLink(d.body);
  const m = d.comment.match(/Đáp án: ([ABC])\. (\S+)/)!;
  assert.equal(m[2], "80K");
  assert.match(d.body, new RegExp(`${m[1]}\\. 80K`));
  assert.doesNotMatch(d.body, /Đáp án/);
});

test("giá theo đơn vị, so món cùng loại", () => {
  const peer = { p: mk({ id: 48, name: "Tất nam combo 5 đôi", price: 60_000 }), u: { per: 12_000, label: "đôi", qtyText: "5 đôi", compareKey: "count:đôi" } };
  const d = donVi(ctx(mk({ name: "Tất cổ cao combo 10 đôi" }), [], { unitPeer: peer }))!;
  assert.match(d.body, /8\.200đ\/đôi/);
  assert.match(d.body, /rẻ hơn 32% tính theo đôi/);
  assert.match(d.comment, /Món so sánh/);
  assert.equal(donVi(ctx(mk({ name: "Vợt pickleball 16mm" }), [])), null);
});

test("các mẫu còn lại chỉ tạo khi có số liệu", () => {
  const p = mk({});
  assert.ok(kyLuc(ctx(p, hist([120_000, 110_000, 100_000, 95_000, 90_000, 82_000]))));
  assert.equal(kyLuc(ctx(p, hist([120_000, 70_000, 82_000]))), null);
  assert.match(sauMa(ctx(p, [], { withVoucher: { code: "SALE10", title: "Giảm 10%", price: 74_000 } }))!.comment, /Nhập mã SALE10 còn 74K/);
  assert.equal(sauMa(ctx(p, [], { withVoucher: null })), null);
  assert.match(vuaGiam(ctx(p, hist([100_000, 82_000]), { droppedAt: new Date(now.getTime() - 3_600_000), droppedBy: 18_000 }))!.body, /VỪA GIẢM 18K/);
  const s = soSan(ctx(p, [], { offers: [{ platform: "shopee", price: 82_000, id: 47 }, { platform: "lazada", price: 99_000, id: 50, name: "Tất" }] }))!;
  assert.match(s.body, /Shopee rẻ hơn Lazada 17K/);
  assert.match(s.comment, /Lazada: https:\/\/sandealgiare\.com\/p\/50$/m);
  const f = muaHayCho(ctx(p, [{ price: 82_000, capturedAt: new Date(now.getTime() - DAY) }]));
  assert.equal(f, null, "chưa có số liệu sale -> không đoán");
});

test("tổng hợp và nâng giá: link đánh số ở bình luận", () => {
  const items = [1, 2, 3, 4].map((i) => mk({ id: i, name: `Món ${i}`, price: 50_000 + i * 1000 }));
  const t = tongHop(items, { site: SITE, now, budget: 100_000 })!;
  noLink(t.body);
  assert.match(t.body, /4 món dưới 100K/);
  assert.match(t.comment, /^1\. https:\/\/sandealgiare\.com\/p\/1\n   🛒 Shopee: https:\/\/s\.shopee\.vn\/x$/m);
  assert.equal(tongHop(items.slice(0, 2), { site: SITE, now, budget: 100_000 }), null);
  const n = nangGia({ total: 40, rate: 0.35, raised: [{ product: items[0], base: 100_000, peak: 130_000 }] }, { site: SITE, now, sale: "11.11", slug: "11-11-2026", upcoming: true })!;
  noLink(n.body);
  assert.match(n.body, /35% món/);
  assert.match(n.comment, /nang-gia\/11-11-2026/);
});

test("singleDrafts: mọi mẫu đều tách link ra bình luận", () => {
  const all = singleDrafts(ctx(mk({}), hist([120_000, 110_000, 100_000, 95_000, 90_000, 82_000]), { withVoucher: { code: null, title: "Mã sàn", price: 70_000 } }));
  assert.ok(all.length >= 3);
  for (const d of all) {
    noLink(d.body);
    assert.match(d.comment, /https:\/\/sandealgiare\.com\/p\/\d+/);
    assert.doesNotMatch(d.comment, /\/product\/|utm_/, "bình luận chỉ dùng link ngắn");
    assert.match(d.story, new RegExp(`/story\\?k=${d.kind}&p=47$`), "ảnh Story theo mẫu");
  }
});
