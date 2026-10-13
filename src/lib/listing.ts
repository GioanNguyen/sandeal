/**
 * Cập nhật và thêm sản phẩm từ TRANG DANH SÁCH của sàn (tìm kiếm, danh mục, Flash Sale) khi chưa có API:
 * một trang danh sách hiện 40–60 món kèm tên, giá, ảnh, mã sản phẩm – mở 1 trang bằng ~50 lần mở trang sản phẩm lẻ.
 *
 *  - recordListing: tiện ích (của quản trị viên) gửi các ô sản phẩm đọc được trên trang -> mỗi món đi qua đúng đường
 *    "Góp giá" (observe.ts): món đã có thì cập nhật giá (có chặn giá nhảy bất thường), món mới thì tạo mới.
 *  - listingTargets: các trang nên quét, chọn theo nhu cầu thật (phương án 2):
 *      · từ khoá khách tìm trên Săn Deal mà không có kết quả (thêm đúng món khách cần)
 *      · loại hàng khách quan tâm nhất (xem / bấm mua / theo dõi) – làm mới giá món đã có, thêm món cùng loại
 *      · trang Flash Sale (deal trong ngày)
 *    mỗi trang có thời gian chờ riêng trước khi quét lại; lần quét gần nhất lưu trong kv_store.
 */
import { and, count, desc, eq, gte, like, sql } from "drizzle-orm";
import { clicks, kvStore, productViews, products, searchLog, watches } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { memoClear } from "./memo";
import { recordObservation, type ObserveStatus } from "./observe";
import { similarKeywords } from "./requestwatch";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const LISTING_MAX_ITEMS = 120;

export interface ListingItem {
  url: string;
  name?: string;
  price: number;
  originalPrice?: number;
  image?: string;
}

export type ListingStats = Record<ObserveStatus, number> & { total: number };

/** Ghi các món đọc được trên 1 trang danh sách. category: danh mục của trang (nếu biết) cho món mới */
export async function recordListing(items: ListingItem[], ctx: { observer: string; category?: string }, now = new Date()): Promise<ListingStats> {
  await ensureMigrated();
  const stats: ListingStats = { created: 0, updated: 0, ignored: 0, pending: 0, dup: 0, invalid: 0, total: 0 };
  const seen = new Set<string>();
  for (const it of items.slice(0, LISTING_MAX_ITEMS)) {
    if (!it || typeof it.url !== "string" || seen.has(it.url)) continue;
    seen.add(it.url);
    stats.total++;
    const r = await recordObservation(
      {
        url: it.url,
        name: typeof it.name === "string" ? it.name : undefined,
        price: Number(it.price),
        originalPrice: Number(it.originalPrice) || undefined,
        image: typeof it.image === "string" ? it.image : undefined,
        category: ctx.category,
      },
      ctx.observer,
      now,
    ).catch(() => ({ status: "invalid" as const }));
    stats[r.status]++;
  }
  if (stats.created || stats.updated) memoClear("home:");
  return stats;
}

export type TargetKind = "flash" | "search" | "topic";
export interface ListingTarget {
  key: string;
  kind: TargetKind;
  /** Đọc cho người: "Flash Sale", "tìm “quạt tích điện”"… */
  label: string;
  url: string;
  /** Từ khoá / loại hàng (để làm danh mục gợi ý cho món mới khi là loại hàng) */
  term?: string;
}

/** Thời gian chờ trước khi quét lại cùng một trang */
export const COOLDOWN: Record<TargetKind, number> = { flash: 12 * HOUR, search: 3 * DAY, topic: 2 * DAY };
const KV = "listing:";

const searchUrl = (q: string) => `https://shopee.vn/search?keyword=${encodeURIComponent(q)}`;
const keyOf = (kind: TargetKind, term: string) => `${kind}:${term.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()}`;

/** Tất cả trang ứng viên (chưa xét thời gian chờ), quan trọng trước */
export async function candidateTargets(now = new Date(), opts: { searches?: number; topics?: number } = {}): Promise<ListingTarget[]> {
  await ensureMigrated();
  const since = new Date(now.getTime() - 14 * DAY);
  // 1. Khách tìm mà không có kết quả (bỏ link dán vào ô tìm, từ quá ngắn)
  const zero = await db
    .select({ q: searchLog.q, n: count() })
    .from(searchLog)
    .where(and(eq(searchLog.results, 0), gte(searchLog.createdAt, since)))
    .groupBy(searchLog.q)
    .orderBy(desc(count()))
    .limit(80);
  const searches = zero
    .map((r) => r.q.trim())
    .filter((q) => q.length >= 3 && q.length <= 60 && !/https?:|\.(vn|com)\b/i.test(q))
    .slice(0, opts.searches ?? 30)
    .map((q): ListingTarget => ({ key: keyOf("search", q), kind: "search", label: `tìm “${q}”`, url: searchUrl(q), term: q }));

  // 2. Loại hàng khách quan tâm nhất: món được xem / bấm mua / theo dõi nhiều -> cụm từ đầu tên ("Quạt tích điện")
  const v = db.select({ pid: productViews.productId, n: sql<number>`count(*)`.as("vn") }).from(productViews).where(gte(productViews.createdAt, since)).groupBy(productViews.productId).as("v");
  const c = db.select({ pid: clicks.productId, n: sql<number>`count(*)`.as("cn") }).from(clicks).where(gte(clicks.createdAt, since)).groupBy(clicks.productId).as("c");
  const w = db.select({ pid: watches.productId, n: sql<number>`count(*)`.as("wn") }).from(watches).groupBy(watches.productId).as("w");
  const score = sql<number>`(coalesce(${v.n}, 0) + 5 * coalesce(${c.n}, 0) + 10 * coalesce(${w.n}, 0))`;
  const hot = await db
    .select({ name: products.name })
    .from(products)
    .leftJoin(v, sql`${v.pid} = ${products.id}`)
    .leftJoin(c, sql`${c.pid} = ${products.id}`)
    .leftJoin(w, sql`${w.pid} = ${products.id}`)
    .where(and(eq(products.platform, "shopee"), sql`not ${products.hidden}`, sql`${score} > 0`))
    .orderBy(desc(score))
    .limit(200);
  const topicSet = new Map<string, ListingTarget>();
  for (const h of hot) {
    const term = similarKeywords(h.name)[0];
    if (!term || term.length < 4) continue;
    const key = keyOf("topic", term);
    if (!topicSet.has(key) && !searches.some((s) => s.key === keyOf("search", term))) topicSet.set(key, { key, kind: "topic", label: `loại hàng “${term}”`, url: searchUrl(term), term });
    if (topicSet.size >= (opts.topics ?? 30)) break;
  }

  return [{ key: "flash:shopee", kind: "flash", label: "Flash Sale Shopee", url: "https://shopee.vn/flash_sale" }, ...searches, ...topicSet.values()];
}

/** Lần quét gần nhất của từng trang */
async function lastRuns(): Promise<Map<string, number>> {
  const rows = await db.select({ key: kvStore.key, value: kvStore.value }).from(kvStore).where(like(kvStore.key, `${KV}%`));
  const out = new Map<string, number>();
  for (const r of rows) {
    try {
      out.set(r.key.slice(KV.length), Number(JSON.parse(r.value).at) || 0);
    } catch {
      /* bỏ qua */
    }
  }
  return out;
}

/** Trang đến lượt quét (đã qua thời gian chờ), quan trọng trước */
export async function listingTargets(now = new Date(), limit = 3): Promise<{ items: ListingTarget[]; due: number }> {
  const [all, runs] = await Promise.all([candidateTargets(now), lastRuns()]);
  const due = all.filter((t) => now.getTime() - (runs.get(t.key) ?? 0) >= COOLDOWN[t.kind]);
  return { items: due.slice(0, limit), due: due.length };
}

/** Ghi đã quét 1 trang (kể cả khi không đọc được gì, để không mở lại liên tục) */
export async function markListingDone(key: string, stats: Partial<ListingStats>, now = new Date()) {
  await ensureMigrated();
  if (!/^(flash|search|topic):.{1,80}$/.test(key)) return;
  const value = JSON.stringify({ at: now.getTime(), created: stats.created ?? 0, updated: stats.updated ?? 0, total: stats.total ?? 0 });
  await db.insert(kvStore).values({ key: KV + key, value, updatedAt: now }).onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: now } });
}

/** Tổng kết 7 ngày cho trang quản trị: số trang đã quét, món mới, món cập nhật giá */
export async function listingSummary(now = new Date()): Promise<{ pages: number; created: number; updated: number }> {
  await ensureMigrated();
  const rows = await db.select({ value: kvStore.value }).from(kvStore).where(and(like(kvStore.key, `${KV}%`), gte(kvStore.updatedAt, new Date(now.getTime() - 7 * DAY))));
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      created += Number(v.created) || 0;
      updated += Number(v.updated) || 0;
    } catch {
      /* bỏ qua */
    }
  }
  return { pages: rows.length, created, updated };
}
