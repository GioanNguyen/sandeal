/**
 * "Giảm giá ảo": món shop ghi giảm sâu (giá gạch cao) nhưng giá hiện tại gần như bằng giá thường ngày của chính món đó.
 * Giá thường ngày = trung vị có trọng số thời gian của lịch sử giá 90 ngày (cùng cách tính với ô "Nên mua ngay hay chờ?"
 * trên trang sản phẩm), nên số trên trang /giam-gia-ao, ảnh và bài Facebook khớp với trang sản phẩm.
 *
 * Chỉ nói về GIÁ (số liệu ghi nhận được), không kết luận về shop.
 */
import { and, asc, desc, gte, inArray, sql } from "drizzle-orm";
import { pricePoints, products, type Product } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { timeWeightedMedian } from "./score";

const DAY = 86_400_000;
/** % shop ghi tối thiểu để xét */
export const FAKE_MIN_CLAIM = 30;
/** Giảm thật tối đa (so với giá thường ngày) để coi là "ảo" */
export const FAKE_MAX_REAL = 5;
/** Số ngày theo dõi tối thiểu (đủ để biết giá thường ngày) */
export const FAKE_MIN_DAYS = 14;

export interface FakeDeal {
  p: Product;
  /** % giảm shop ghi (theo giá gạch) */
  claim: number;
  /** % rẻ hơn giá thường ngày (âm = đắt hơn) */
  real: number;
  usual: number;
  low: number;
  days: number;
}

/** Nhãn mức giảm thật so với giá thường ngày */
export const realLabel = (real: number) => (real >= 0.5 ? `thật chỉ −${Math.round(real)}%` : real <= -0.5 ? `đắt hơn thường ngày ${Math.round(-real)}%` : "giá như mọi ngày");

type Pt = { price: number; capturedAt: Date };

/** Phân loại 1 món; null nếu không phải "giảm ảo" hoặc chưa đủ dữ liệu */
export function classifyFake(p: Pick<Product, "price" | "originalPrice" | "discountPct">, hist: Pt[], now = new Date()): Omit<FakeDeal, "p"> | null {
  const h = hist.filter((x) => now.getTime() - x.capturedAt.getTime() <= 90 * DAY).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (!h.length) return null;
  const days = (now.getTime() - h[0].capturedAt.getTime()) / DAY;
  if (days < FAKE_MIN_DAYS) return null;
  const listed = p.originalPrice && p.originalPrice > p.price ? (1 - p.price / p.originalPrice) * 100 : 0;
  const claim = Math.round(Math.max(listed, p.discountPct || 0));
  if (claim < FAKE_MIN_CLAIM) return null;
  const usual = timeWeightedMedian(h, now);
  if (!(usual > 0)) return null;
  const real = ((usual - p.price) / usual) * 100;
  if (real > FAKE_MAX_REAL) return null;
  const low = Math.min(...h.map((x) => x.price), p.price);
  return { claim, real, usual, low, days };
}

/** Món "giảm ảo" rõ nhất: chênh giữa % ghi và % thật lớn trước, món nhiều người mua trước khi bằng nhau */
export function rankFakes(list: FakeDeal[]): FakeDeal[] {
  return [...list].sort((a, b) => b.claim - b.real - (a.claim - a.real) || (b.p.sold ?? 0) - (a.p.sold ?? 0));
}

async function histories(ids: number[], now: Date) {
  const m = new Map<number, Pt[]>();
  if (!ids.length) return m;
  const rows = await db
    .select({ id: pricePoints.productId, price: pricePoints.price, capturedAt: pricePoints.capturedAt })
    .from(pricePoints)
    .where(and(inArray(pricePoints.productId, ids), gte(pricePoints.capturedAt, new Date(now.getTime() - 90 * DAY))))
    .orderBy(asc(pricePoints.capturedAt));
  for (const r of rows) (m.get(r.id) ?? m.set(r.id, []).get(r.id)!).push({ price: r.price, capturedAt: r.capturedAt });
  return m;
}

/** Danh sách món đang "giảm ảo" (còn bán), tối đa `limit` món */
export async function fakeDeals(opts: { now?: Date; limit?: number; exclude?: Set<number> } = {}): Promise<FakeDeal[]> {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  // Lọc thô bằng SQL: ghi giảm sâu, điểm "giảm thật" thấp (cột real_drop_pct tính theo 30 ngày)
  const cands = (await db
    .select()
    .from(products)
    .where(and(availableSql(), sql`(${products.discountPct} >= ${FAKE_MIN_CLAIM} or (${products.originalPrice} > 0 and ${products.price} <= ${products.originalPrice} * ${1 - FAKE_MIN_CLAIM / 100}))`, sql`${products.realDropPct} <= 10`))
    .orderBy(desc(sql`coalesce(${products.sold}, 0)`))
    .limit(400)) as Product[];
  const list = cands.filter((p) => !opts.exclude?.has(p.id));
  const hist = await histories(list.map((p) => p.id), now);
  const out: FakeDeal[] = [];
  for (const p of list) {
    const c = classifyFake(p, hist.get(p.id) ?? [], now);
    if (c) out.push({ p, ...c });
  }
  return rankFakes(out).slice(0, opts.limit ?? 30);
}

/** Số liệu "giảm ảo" của các món chỉ định (giữ thứ tự), bỏ qua món không còn đủ điều kiện – dùng cho ảnh bài đăng */
export async function fakeDealsByIds(ids: number[], now = new Date()): Promise<FakeDeal[]> {
  await ensureMigrated();
  if (!ids.length) return [];
  const rows = (await db.select().from(products).where(inArray(products.id, ids))) as Product[];
  const hist = await histories(ids, now);
  const out: FakeDeal[] = [];
  for (const id of ids) {
    const p = rows.find((r) => r.id === id);
    const c = p && classifyFake(p, hist.get(id) ?? [], now);
    if (p && c) out.push({ p, ...c });
  }
  return out;
}
