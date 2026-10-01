/**
 * Tìm bằng ảnh: lập chỉ mục ảnh sản phẩm (worker) và tìm món giống ảnh người dùng gửi (web).
 * Không lưu ảnh người dùng: ảnh chỉ được đọc trong RAM để tính vector rồi bỏ.
 */
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { productEmbeddings, products } from "@/db/schema";
import { availableSql, isUnavailable, platformLatest } from "../availability";
import { db, ensureMigrated } from "../db";
import { thumbUrl } from "../images";
import { dealsByIds, type DealRow } from "../queries";
import { embedImage, ImageSearchUnavailable, modelKey } from "./model";
import { thresholds, quantize, similarityLabel, VectorIndex } from "./vector";

/** Ảnh lớn hơn mức này không xử lý (ảnh người dùng đã được thu nhỏ trên trình duyệt trước khi gửi) */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_FAILURES = 3;

/** Nhận diện đúng định dạng ảnh qua vài byte đầu (không tin đuôi file / content-type) */
export function sniffImage(b: Uint8Array): "jpeg" | "png" | "webp" | "gif" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

async function fetchImage(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; SanDealBot/1.0; +image-search)", accept: "image/webp,image/jpeg,image/png,image/*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("ảnh quá lớn");
  if (!sniffImage(buf)) throw new Error("không phải ảnh");
  return buf;
}

/**
 * Worker: tính vector cho món chưa có (hoặc đổi ảnh / đổi mô hình). Ưu tiên món điểm deal cao.
 * Mỗi lần chạy tối đa `limit` món để không chiếm CPU quá lâu; lần đồng bộ sau làm tiếp.
 */
export async function indexProductImages(
  limit = Number(process.env.IMAGE_INDEX_BATCH) || 300,
  opts: { fetchImage?: (url: string) => Promise<Uint8Array> } = {},
): Promise<number> {
  const load = opts.fetchImage ?? fetchImage;
  await ensureMigrated();
  const model = modelKey();
  const todo = await db
    .select({ id: products.id, imageUrl: products.imageUrl, failures: productEmbeddings.failures, prevImage: productEmbeddings.imageUrl, prevModel: productEmbeddings.model })
    .from(products)
    .leftJoin(productEmbeddings, eq(productEmbeddings.productId, products.id))
    .where(
      and(
        isNotNull(products.imageUrl),
        availableSql(),
        or(
          sql`${productEmbeddings.productId} is null`,
          sql`${productEmbeddings.model} <> ${model}`,
          sql`${productEmbeddings.imageUrl} <> ${products.imageUrl}`,
          // Lỗi tải ảnh: thử lại tối đa vài lần, cách nhau ít nhất 1 ngày
          and(sql`${productEmbeddings.vec} is null`, sql`${productEmbeddings.failures} < ${MAX_FAILURES}`, sql`${productEmbeddings.updatedAt} < now() - interval '1 day'`),
        ),
      ),
    )
    .orderBy(sql`${products.dealScore} desc`)
    .limit(limit);

  let done = 0;
  for (const p of todo) {
    const imageUrl = p.imageUrl!;
    try {
      const vec = await embedImage(await load(thumbUrl(imageUrl, 300) ?? imageUrl));
      const { bytes, scale } = quantize(vec);
      const row = { imageUrl, model, vec: bytes, scale, failures: 0, updatedAt: new Date() };
      await db.insert(productEmbeddings).values({ productId: p.id, ...row }).onConflictDoUpdate({ target: productEmbeddings.productId, set: row });
      done++;
    } catch (err) {
      if (err instanceof ImageSearchUnavailable) throw err; // mô hình chưa nạp được: dừng, không ghi lỗi cho từng món
      const sameImage = p.prevImage === imageUrl && p.prevModel === model;
      const row = { imageUrl, model, vec: null, scale: null, failures: sameImage ? (p.failures ?? 0) + 1 : 1, updatedAt: new Date() };
      await db.insert(productEmbeddings).values({ productId: p.id, ...row }).onConflictDoUpdate({ target: productEmbeddings.productId, set: row });
    }
  }
  if (done) invalidateIndex();
  return done;
}

// ---- Chỉ mục trong RAM (dùng chung trong tiến trình web) ----
type Cached = { index: VectorIndex; stamp: string; checkedAt: number };
const g = globalThis as unknown as { __sdImgIndex?: Cached; __sdImgLoading?: Promise<Cached> };

export function invalidateIndex() {
  g.__sdImgIndex = undefined;
}

async function stampNow(model: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int`, last: sql<string>`coalesce(max(${productEmbeddings.updatedAt})::text, '')` })
    .from(productEmbeddings)
    .where(and(eq(productEmbeddings.model, model), isNotNull(productEmbeddings.vec)));
  return `${r.n}|${r.last}`;
}

async function loadIndex(model: string): Promise<Cached> {
  const stamp = await stampNow(model);
  const rows = await db
    .select({ id: productEmbeddings.productId, vec: productEmbeddings.vec, scale: productEmbeddings.scale })
    .from(productEmbeddings)
    .where(and(eq(productEmbeddings.model, model), isNotNull(productEmbeddings.vec)));
  const list = rows.map((r) => ({ id: r.id, bytes: r.vec!, scale: r.scale ?? 1 }));
  // Số chiều: lấy theo đa số (phòng dữ liệu lẫn mô hình khác chiều)
  const dims = new Map<number, number>();
  for (const r of list) dims.set(r.bytes.byteLength, (dims.get(r.bytes.byteLength) ?? 0) + 1);
  const dim = [...dims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 512;
  return { index: new VectorIndex(list, dim), stamp, checkedAt: Date.now() };
}

/** Lấy chỉ mục; mỗi phút kiểm tra 1 lần xem worker (có thể ở tiến trình khác) đã thêm vector mới chưa */
async function getIndex(): Promise<VectorIndex> {
  await ensureMigrated();
  const model = modelKey();
  const c = g.__sdImgIndex;
  if (c && Date.now() - c.checkedAt < 60_000) return c.index;
  if (c && (await stampNow(model)) === c.stamp) {
    c.checkedAt = Date.now();
    return c.index;
  }
  g.__sdImgLoading ??= loadIndex(model).finally(() => (g.__sdImgLoading = undefined));
  g.__sdImgIndex = await g.__sdImgLoading;
  return g.__sdImgIndex.index;
}

export async function indexedCount(): Promise<number> {
  return (await getIndex()).size;
}

export type ImageMatch = DealRow & { similarity: number; match: "same" | "very" | "similar" };

/** Tìm các món đang bán giống ảnh nhất (đã bỏ món không còn thấy trên sàn) */
export async function searchByImage(image: Uint8Array, opts: { limit?: number } = {}): Promise<{ items: ImageMatch[]; indexed: number }> {
  const limit = Math.min(opts.limit ?? 24, 48);
  const [vec, index] = await Promise.all([embedImage(image), getIndex()]);
  if (!index.size) return { items: [], indexed: 0 };
  const t = thresholds();
  // Lấy dư để còn đủ sau khi lọc món không còn bán
  const hits = index.search(vec, Math.min(60, limit * 2), t.min);
  if (!hits.length) return { items: [], indexed: index.size };
  const [rows, latest] = await Promise.all([dealsByIds(hits.map((h) => h.id)), platformLatest()]);
  const score = new Map(hits.map((h) => [h.id, h.score]));
  const items = rows
    .filter((p) => !isUnavailable(p, latest))
    .map((p) => {
      const s = score.get(p.id) ?? 0;
      return { ...p, similarity: Math.round(s * 1000) / 1000, match: similarityLabel(s, t) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return { items, indexed: index.size };
}
