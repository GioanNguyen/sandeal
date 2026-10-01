/** Tìm bằng ảnh: phép tính vector, chỉ mục, lập chỉ mục ảnh sản phẩm và tìm kiếm (mô hình giả, không cần mạng) */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SOURCES = "mock";

import { dequantize, normalize, quantize, similarityLabel, VectorIndex } from "./imagesearch/vector";

let img: typeof import("./imagesearch");
let model: typeof import("./imagesearch/model");
let ingest: typeof import("./ingest");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

const DIM = 512;
/** Vector giả có "chủ đề": cùng chủ đề -> rất giống, thêm nhiễu nhỏ để không trùng hẳn */
function topicVec(topic: number, noise = 0, seed = 1): Float32Array {
  const v = new Float32Array(DIM);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < DIM; i++) {
    x = (x * 9301 + 49297) % 233280;
    v[i] = (i % 8 === topic ? 1 : 0) + noise * (x / 233280 - 0.5);
  }
  return normalize(v);
}

// "Ảnh" giả: nội dung là chuỗi "topic:noise:seed", mô hình giả đọc ra vector tương ứng
const fakeImage = (s: string) => new TextEncoder().encode(s);
const fakeEmbed = async (b: Uint8Array) => {
  const [t, n, s] = new TextDecoder().decode(b).split(":").map(Number);
  return topicVec(t, n, s);
};

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  img = await import("./imagesearch");
  model = await import("./imagesearch/model");
  ingest = await import("./ingest");
  schema = await import("@/db/schema");
  model.setTestEmbedder(fakeEmbed);
});

test("nén int8 giữ gần đúng độ giống, chỉ mục trả đúng thứ tự và bỏ món dưới ngưỡng", () => {
  const a = topicVec(1, 0.6, 1);
  const b = topicVec(1, 0.6, 2);
  const exact = a.reduce((s, x, i) => s + x * b[i], 0);
  const qa = quantize(a);
  const back = dequantize(qa.bytes, qa.scale);
  const approx = back.reduce((s, x, i) => s + x * b[i], 0);
  assert.ok(Math.abs(exact - approx) < 0.005, `${exact} vs ${approx}`);
  assert.equal(qa.bytes.byteLength, DIM);

  const rows = [
    { id: 10, ...quantize(topicVec(1, 0.3, 3)) },
    { id: 11, ...quantize(topicVec(2, 0.3, 4)) },
    { id: 12, ...quantize(topicVec(1, 1.5, 5)) },
    { id: 13, ...quantize(topicVec(3, 0.3, 6)) },
    { id: 99, bytes: new Uint8Array(10), scale: 1 }, // sai số chiều -> bỏ qua
  ];
  const idx = new VectorIndex(rows, DIM);
  assert.equal(idx.size, 4);
  const hits = idx.search(topicVec(1, 0.3, 7), 2);
  assert.deepEqual(hits.map((h) => h.id), [10, 12]);
  assert.ok(hits[0].score > hits[1].score);
  assert.equal(idx.search(topicVec(1, 0.3, 7), 10, 0.9).length, 1);
  // k nhỏ hơn số kết quả: vẫn giữ đúng top theo thứ tự
  const all = idx.search(topicVec(1, 0.3, 7), 10).map((h) => h.id);
  assert.deepEqual(idx.search(topicVec(1, 0.3, 7), 3).map((h) => h.id), all.slice(0, 3));

  assert.equal(similarityLabel(0.97), "same");
  assert.equal(similarityLabel(0.88), "very");
  assert.equal(similarityLabel(0.75), "similar");
});

test("nhận diện định dạng ảnh qua byte đầu", () => {
  assert.equal(img.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
  assert.equal(img.sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "png");
  assert.equal(img.sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 ")), "webp");
  assert.equal(img.sniffImage(new TextEncoder().encode("<html><body>")), null);
});

test("lập chỉ mục ảnh sản phẩm rồi tìm: đúng món, bỏ món hết bán, tính lại khi đổi ảnh, đếm lỗi tải ảnh", async () => {
  const { db } = dbm;
  const { products, productEmbeddings } = schema;
  const base = { discountPct: 10, affiliateUrl: "https://example.com/a" };
  const mk = (externalId: string, name: string, imageUrl: string | undefined, price: number) =>
    ingest.upsertProduct({ platform: "shopee", externalId, name, imageUrl, price, originalPrice: price * 1.2, ...base });
  const shoe = await mk("img-1", "Giày chạy bộ trắng", "https://img.test/1:0.2:1", 450_000);
  const shoe2 = await mk("img-2", "Giày chạy bộ trắng bản 2", "https://img.test/1:0.6:2", 390_000);
  const bag = await mk("img-3", "Túi da nâu", "https://img.test/5:0.2:3", 300_000);
  await mk("img-4", "Món không ảnh", undefined, 100_000);
  const broken = await mk("img-5", "Ảnh hỏng", "https://img.test/broken", 120_000);

  const fetched: string[] = [];
  const fetchImage = async (url: string) => {
    fetched.push(url);
    if (url.includes("broken")) throw new Error("HTTP 404");
    return fakeImage(url.split("/").pop()!);
  };

  assert.equal(await img.indexProductImages(100, { fetchImage }), 3);
  assert.equal(fetched.length, 4, "món không ảnh thì bỏ qua");
  const [bad] = await db.select().from(productEmbeddings).where(eq(productEmbeddings.productId, broken));
  assert.equal(bad.vec, null);
  assert.equal(bad.failures, 1);

  // Chạy lại: không tính lại món đã có, món lỗi chưa thử lại trong ngày
  fetched.length = 0;
  assert.equal(await img.indexProductImages(100, { fetchImage }), 0);
  assert.equal(fetched.length, 0);

  // Tìm bằng ảnh giày: 2 đôi giày lên đầu, túi bị loại vì khác hẳn
  const r = await img.searchByImage(fakeImage("1:0.3:9"));
  assert.equal(r.indexed, 3);
  assert.deepEqual(r.items.map((p) => p.id), [shoe, shoe2]);
  assert.ok(r.items[0].similarity > r.items[1].similarity);
  assert.ok(["same", "very"].includes(r.items[0].match));
  assert.ok(!r.items.some((p) => p.id === bag));
  assert.equal(r.items[0].name, "Giày chạy bộ trắng", "trả về đủ thông tin thẻ deal");

  // Đổi ảnh sản phẩm -> lần lập chỉ mục sau tính lại theo ảnh mới
  await db.update(products).set({ imageUrl: "https://img.test/5:0.2:8" }).where(eq(products.id, shoe2));
  fetched.length = 0;
  assert.equal(await img.indexProductImages(100, { fetchImage }), 1);
  assert.deepEqual(fetched, ["https://img.test/5:0.2:8"]);
  const r2 = await img.searchByImage(fakeImage("1:0.3:9"));
  assert.deepEqual(r2.items.map((p) => p.id), [shoe]);

  // Món không còn thấy trên sàn thì không hiện trong kết quả
  await mk("img-6", "Món mới đồng bộ", "https://img.test/7:0.2:4", 200_000); // lần đồng bộ mới nhất là bây giờ
  await db.update(products).set({ lastSeenAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(products.id, shoe));
  const r3 = await img.searchByImage(fakeImage("1:0.3:9"));
  assert.ok(!r3.items.some((p) => p.id === shoe));
});

test("mô hình chưa nạp được: lập chỉ mục dừng lại, không ghi lỗi cho từng món", async () => {
  model.setTestEmbedder(async () => {
    throw new model.ImageSearchUnavailable("chưa có mô hình");
  });
  try {
    await ingest.upsertProduct({ platform: "lazada", externalId: "img-x", name: "Món X", imageUrl: "https://img.test/2:0.1:1", price: 1000, discountPct: 0, affiliateUrl: "https://e.com" });
    await assert.rejects(img.indexProductImages(100, { fetchImage: async (u) => fakeImage(u.split("/").pop()!) }), model.ImageSearchUnavailable);
    const rows = await dbm.db.select().from(schema.productEmbeddings).innerJoin(schema.products, eq(schema.products.id, schema.productEmbeddings.productId)).where(eq(schema.products.externalId, "img-x"));
    assert.equal(rows.length, 0);
  } finally {
    model.setTestEmbedder(fakeEmbed);
  }
});
