/** Nhóm 8: mini game "Đoán giá" & danh sách deal chia sẻ được */
import { randomBytes } from "node:crypto";
import { desc, eq, gte, sql } from "drizzle-orm";
import { products, sharedLists, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { vnDay } from "./discovery";
import { dealsByIds, type DealRow } from "./queries";

/* ---------- Đoán giá ---------- */

/** Bộ sinh số ngẫu nhiên cố định theo "hạt giống" (cùng ngày -> cùng đề cho mọi người) */
export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const r1k = (n: number) => Math.round(n / 1000) * 1000;

export interface GuessRound {
  id: number;
  name: string;
  imageUrl: string | null;
  platform: string;
  category: string | null;
  /** Giá thường ngày (trung vị 30 ngày) – gợi ý cho người chơi */
  usual: number;
  /** 4 phương án, 1 đúng */
  options: number[];
  answer: number;
  realDropPct: number;
}

/**
 * 4 phương án cho 1 câu: giá thật + 3 giá nhiễu nằm dưới giá thường ngày, cách nhau ≥ 8%
 * (không có phương án cao hơn giá thường ngày – quá dễ loại).
 */
export function buildOptions(price: number, usual: number, rand: () => number): number[] {
  const opts = [price];
  const lo = Math.max(1000, usual * 0.4), hi = usual * 0.97;
  for (let tries = 0; opts.length < 4 && tries < 200; tries++) {
    const v = r1k(lo + rand() * (hi - lo));
    if (opts.every((o) => Math.abs(o - v) / Math.max(o, v) >= 0.08)) opts.push(v);
  }
  // Giá hẹp quá không đủ 4 phương án -> nới xuống
  for (let k = 1; opts.length < 4; k++) opts.push(r1k(price * (1 - 0.12 * k)));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

/** Đề "Đoán giá" của ngày: 5 món giảm thật ≥10%, khác tên nhau, cố định theo ngày giờ VN */
export async function guessRounds(now = new Date(), count = 5): Promise<{ day: string; rounds: GuessRound[] }> {
  await ensureMigrated();
  const day = vnDay(now);
  const rand = seeded(`guess:${day}`);
  const pool = await db.select().from(products).where(gte(products.realDropPct, 10)).orderBy(desc(products.dealScore), products.id).limit(40);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const names = new Set<string>();
  const picked: Product[] = [];
  for (const p of shuffled) {
    const k = p.name.toLowerCase();
    if (names.has(k)) continue;
    names.add(k);
    picked.push(p);
    if (picked.length >= count) break;
  }
  const rounds = picked.map((p) => {
    const usual = r1k(p.price / (1 - p.realDropPct / 100));
    return { id: p.id, name: p.name, imageUrl: p.imageUrl, platform: p.platform, category: p.category, usual, options: buildOptions(p.price, usual, rand), answer: p.price, realDropPct: p.realDropPct };
  });
  return { day, rounds };
}

/* ---------- Danh sách chia sẻ ---------- */

export const LIST_MAX = 30;

export function cleanTitle(t: unknown): string {
  const s = String(t ?? "").replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || "Deal mình đã chọn";
}

export async function createList(title: unknown, ids: unknown): Promise<{ slug: string } | { error: string }> {
  await ensureMigrated();
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, LIST_MAX);
  if (!list.length) return { error: "Chưa chọn món nào" };
  const exist = await db.select({ id: products.id }).from(products).where(sql`${products.id} in (${sql.join(list.map((i) => sql`${i}`), sql`, `)})`);
  const ok = new Set(exist.map((r) => r.id));
  const clean = list.filter((i) => ok.has(i));
  if (!clean.length) return { error: "Sản phẩm không còn tồn tại" };
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 7);
    const [row] = await db.insert(sharedLists).values({ slug, title: cleanTitle(title), productIds: clean }).onConflictDoNothing().returning({ slug: sharedLists.slug });
    if (row) return row;
  }
  return { error: "Không tạo được link, thử lại" };
}

export async function getList(slug: string, countView = false): Promise<{ slug: string; title: string; createdAt: Date; views: number; items: DealRow[] } | null> {
  if (!/^[A-Za-z0-9]{4,12}$/.test(slug)) return null;
  await ensureMigrated();
  const [row] = await db.select().from(sharedLists).where(eq(sharedLists.slug, slug)).limit(1);
  if (!row) return null;
  if (countView) await db.update(sharedLists).set({ views: sql`${sharedLists.views} + 1` }).where(eq(sharedLists.slug, slug));
  return { slug: row.slug, title: row.title, createdAt: row.createdAt, views: row.views, items: await dealsByIds(row.productIds) };
}
