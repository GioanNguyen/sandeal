/**
 * Nhận đánh giá công khai của người mua do tiện ích gửi (người dùng đã bật "Góp giá").
 * Nguyên tắc:
 *  - Chỉ nhận số sao, nội dung, phân loại, ngày, có ảnh/video hay không. Không nhận tên/ảnh đại diện người đánh giá.
 *  - Xoá số điện thoại, email, đường link trong nội dung trước khi lưu.
 *  - Chỉ nhận cho món Săn Deal đang theo dõi (không tạo món mới từ đánh giá).
 */
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { productReviewMeta, productReviews, products } from "@/db/schema";
import { db, ensureMigrated } from "../db";
import { parseProductUrl } from "../links";

export interface ReviewInput {
  rating: number;
  text?: string;
  variant?: string;
  date?: string;
  media?: boolean;
  /** Ngày ước lượng từ "2 tuần trước": lưu nhưng không dùng để chống trùng (đổi theo ngày xem) */
  approx?: boolean;
}

export interface ReviewBatch {
  url: string;
  /** Tổng số lượt đánh giá sàn hiển thị */
  ratingCount?: number;
  /** Số lượt theo sao [1★..5★] */
  starCounts?: number[];
  reviews?: ReviewInput[];
}

export const MAX_REVIEWS_PER_BATCH = 60;
const MAX_BODY = 800;

/** Bỏ thông tin liên lạc / link có thể lẫn trong nội dung đánh giá */
export function scrubText(s: string): string {
  return s
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "2024-05-01 10:20", "01-05-2024", "2024-05-01T10:20:00Z" -> Date (bỏ ngày tương lai, quá cũ) */
export function parseReviewDate(raw: unknown, now = new Date()): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let d: Date | null = null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0) - 7, +(m[5] ?? 0)));
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], -7));
  if (!d || Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + 86_400_000 || d.getFullYear() < 2015) return null;
  return d;
}

export function cleanReview(r: ReviewInput, now = new Date()) {
  const rating = Math.round(Number(r?.rating));
  if (!(rating >= 1 && rating <= 5)) return null;
  const body = scrubText(String(r.text ?? "")).slice(0, MAX_BODY);
  const variantRaw = scrubText(String(r.variant ?? "")).replace(/^phân loại( hàng)?:\s*/i, "");
  const variant = variantRaw.length >= 1 && variantRaw.length <= 80 ? variantRaw : null;
  const postedAt = parseReviewDate(r.date, now);
  const norm = body.toLowerCase().normalize("NFC");
  const hash = createHash("sha1").update(`${rating}|${norm}|${variant ?? ""}|${postedAt && !r.approx ? postedAt.toISOString().slice(0, 16) : ""}`).digest("hex").slice(0, 24);
  return { rating, body, variant, postedAt, hasMedia: !!r.media, hash };
}

function cleanCounts(b: ReviewBatch) {
  const n = Math.round(Number(b.ratingCount));
  const ratingCount = Number.isFinite(n) && n >= 0 && n < 50_000_000 ? n : null;
  const sc = Array.isArray(b.starCounts) && b.starCounts.length === 5 ? b.starCounts.map((x) => Math.round(Number(x))) : null;
  const starCounts = sc && sc.every((x) => Number.isFinite(x) && x >= 0 && x < 50_000_000) && sc.some((x) => x > 0) ? sc : null;
  return { ratingCount, starCounts };
}

export type ReviewStatus = "ok" | "unknown" | "invalid";

/** Lưu một lượt gửi. Trả số đánh giá mới thêm. */
export async function recordReviews(b: ReviewBatch, now = new Date()): Promise<{ status: ReviewStatus; added: number; productId?: number }> {
  await ensureMigrated();
  const ref = parseProductUrl(String(b?.url ?? ""));
  if (!ref) return { status: "invalid", added: 0 };
  const [p] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.platform, ref.platform), eq(products.externalId, ref.externalId)))
    .limit(1);
  if (!p) return { status: "unknown", added: 0 };

  const rows = (Array.isArray(b.reviews) ? b.reviews.slice(0, MAX_REVIEWS_PER_BATCH) : [])
    .map((r) => cleanReview(r, now))
    .filter((r): r is NonNullable<ReturnType<typeof cleanReview>> => !!r);
  let added = 0;
  if (rows.length) {
    const ins = await db
      .insert(productReviews)
      .values(rows.map((r) => ({ productId: p.id, ...r, observedAt: now })))
      .onConflictDoNothing()
      .returning({ id: productReviews.id });
    added = ins.length;
  }

  const { ratingCount, starCounts } = cleanCounts(b);
  if (ratingCount != null || starCounts || added) {
    const set: Partial<typeof productReviewMeta.$inferInsert> = { updatedAt: now };
    if (ratingCount != null) set.ratingCount = ratingCount;
    if (starCounts) set.starCounts = starCounts;
    await db.insert(productReviewMeta).values({ productId: p.id, ...set }).onConflictDoUpdate({ target: productReviewMeta.productId, set });
  }
  return { status: "ok", added, productId: p.id };
}

export type StoredReview = typeof productReviews.$inferSelect;

/** Đánh giá đã lưu của một món, mới nhất trước (tối đa `limit`) */
export async function reviewsFor(productId: number, limit = 300): Promise<StoredReview[]> {
  await ensureMigrated();
  return db
    .select()
    .from(productReviews)
    .where(eq(productReviews.productId, productId))
    .orderBy(desc(sql`coalesce(${productReviews.postedAt}, ${productReviews.observedAt})`))
    .limit(limit);
}

export async function reviewMeta(productId: number) {
  const [m] = await db.select().from(productReviewMeta).where(eq(productReviewMeta.productId, productId)).limit(1);
  return m ?? null;
}
