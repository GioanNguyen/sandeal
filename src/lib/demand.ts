/**
 * Nhu cầu của khách – "khách đang cần gì mà site chưa có?" (Quản trị › Nhu cầu)
 *  - Từ khoá khách gõ vào ô tìm kiếm (bảng search_log): không ra kết quả / ít kết quả / tìm nhiều nhưng chưa có trang riêng
 *  - Link sản phẩm khách dán vào "Kiểm tra giá" mà site chưa theo dõi (bảng product_requests)
 * Các biến thể cùng nghĩa (có/không dấu, hoa/thường) được gộp chung.
 */
import { and, desc, gte, isNull, sql } from "drizzle-orm";
import { aiGuides, productRequests, searchLog } from "@/db/schema";
import { fold } from "./autocategory";
import { brandPath, listBrands } from "./brands";
import { db, ensureMigrated } from "./db";
import { priceTopics } from "./pricepages";
import { listCategories } from "./queries";
import { slugify } from "./slug";
import { isUnaccented } from "./textsearch";

const DAY = 86_400_000;

export type DemandStatus = "missing" | "thin" | "covered";
export const DEMAND_THIN = 5;

export interface DemandRow {
  /** Cách gõ hiển thị: có dấu nếu có, rồi phổ biến nhất */
  q: string;
  key: string;
  searches: number;
  /** Số lượt kỳ trước (cùng độ dài) – để thấy từ khoá đang tăng */
  prev: number;
  /** Số kết quả ở lần tìm gần nhất */
  lastResults: number;
  zero: number;
  last: Date;
  status: DemandStatus;
  /** Trang riêng đã có cho từ khoá (danh mục, "Giá … hôm nay", thương hiệu) */
  landing: { href: string; label: string } | null;
}

export interface DemandReport {
  days: number;
  totals: { searches: number; unique: number; zeroSearches: number };
  rows: DemandRow[];
  requests: { pending: number; top: { url: string; platform: string; count: number; at: Date; nameHint: string | null; watchers: number }[] };
}

export function demandStatus(lastResults: number): DemandStatus {
  return lastResults <= 0 ? "missing" : lastResults < DEMAND_THIN ? "thin" : "covered";
}

/** Gộp các cách gõ cùng nghĩa: bỏ dấu, chữ thường, gọn khoảng trắng */
export const demandKey = (q: string) => fold(q).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

type Landing = { key: string; href: string; label: string };

async function landingPages(): Promise<{ exact: Landing[]; prefix: Landing[] }> {
  const [cats, topics, brands] = await Promise.all([listCategories(), priceTopics(), listBrands()]);
  return {
    exact: [
      ...cats.map((c) => ({ key: demandKey(c.name), href: `/danh-muc/${c.slug}`, label: `Danh mục ${c.name}` })),
      ...brands.map((b) => ({ key: demandKey(b.name), href: brandPath(b), label: `Thương hiệu ${b.name}` })),
    ],
    prefix: topics.map((t) => ({ key: demandKey(t.label), href: `/gia/${t.slug}`, label: `Giá ${t.label} hôm nay` })),
  };
}

function findLanding(key: string, pages: { exact: Landing[]; prefix: Landing[] }) {
  const ex = pages.exact.find((p) => p.key === key);
  if (ex) return { href: ex.href, label: ex.label };
  // Trang "Giá X hôm nay": từ khoá trùng nhãn, hoặc nhãn bắt đầu bằng từ khoá (vd "quạt tích" ~ "Quạt tích điện")
  const pre = pages.prefix.find((p) => p.key === key || (key.length >= 4 && (p.key.startsWith(`${key} `) || key.startsWith(`${p.key} `))));
  return pre ? { href: pre.href, label: pre.label } : null;
}

export async function demandReport(days = 30, now = new Date()): Promise<DemandReport> {
  await ensureMigrated();
  const since = new Date(now.getTime() - days * DAY);
  const prevSince = new Date(now.getTime() - 2 * days * DAY);
  const rows = await db
    .select({
      q: searchLog.q,
      n: sql<number>`count(*) filter (where ${searchLog.createdAt} >= ${since})::int`,
      prev: sql<number>`count(*) filter (where ${searchLog.createdAt} < ${since})::int`,
      zero: sql<number>`count(*) filter (where ${searchLog.createdAt} >= ${since} and ${searchLog.results} = 0)::int`,
      last: sql<Date | string>`max(${searchLog.createdAt})`,
      lastResults: sql<number>`(array_agg(${searchLog.results} order by ${searchLog.createdAt} desc))[1]`,
    })
    .from(searchLog)
    .where(gte(searchLog.createdAt, prevSince))
    .groupBy(searchLog.q);

  // Gộp các cách gõ
  const groups = new Map<string, { variants: Map<string, number>; searches: number; prev: number; zero: number; last: Date; lastResults: number }>();
  for (const r of rows) {
    const key = demandKey(r.q);
    if (!key) continue;
    const last = new Date(r.last);
    const g = groups.get(key) ?? { variants: new Map(), searches: 0, prev: 0, zero: 0, last: new Date(0), lastResults: 0 };
    g.variants.set(r.q, (g.variants.get(r.q) ?? 0) + Number(r.n));
    g.searches += Number(r.n);
    g.prev += Number(r.prev);
    g.zero += Number(r.zero);
    if (last > g.last) {
      g.last = last;
      g.lastResults = Number(r.lastResults);
    }
    groups.set(key, g);
  }
  const pages = await landingPages();
  const out: DemandRow[] = [];
  let searches = 0;
  let zeroSearches = 0;
  for (const [key, g] of groups) {
    if (!g.searches) continue;
    searches += g.searches;
    zeroSearches += g.zero;
    // Ưu tiên cách gõ có dấu (dễ đọc, tìm trên sàn và đặt tên bài chính xác hơn), rồi cách gõ nhiều lượt nhất
    const q = [...g.variants.entries()].sort((a, b) => Number(isUnaccented(a[0])) - Number(isUnaccented(b[0])) || b[1] - a[1] || b[0].length - a[0].length)[0][0];
    out.push({ q, key, searches: g.searches, prev: g.prev, zero: g.zero, last: g.last, lastResults: g.lastResults, status: demandStatus(g.lastResults), landing: findLanding(key, pages) });
  }
  out.sort((a, b) => b.searches - a.searches || b.last.getTime() - a.last.getTime());

  const [pend] = await db.select({ n: sql<number>`count(*)::int` }).from(productRequests).where(isNull(productRequests.productId));
  const top = await db
    .select({
      url: productRequests.url,
      platform: productRequests.platform,
      count: productRequests.count,
      at: productRequests.updatedAt,
      nameHint: productRequests.nameHint,
      // Đặt trong SELECT nên ghi rõ tên bảng (Drizzle không ghi tên bảng trước cột khi truy vấn 1 bảng)
      watchers: sql<number>`(select count(*)::int from request_watchers w where w.request_id = "product_requests"."id" and w.notified_at is null)`,
    })
    .from(productRequests)
    .where(and(isNull(productRequests.productId), gte(productRequests.updatedAt, since)))
    .orderBy(desc(productRequests.count), desc(productRequests.updatedAt))
    .limit(10);

  return { days, totals: { searches, unique: out.length, zeroSearches }, rows: out, requests: { pending: Number(pend?.n ?? 0), top } };
}

/** Từ khoá đang tăng: kỳ này ≥ 3 lượt và gấp đôi kỳ trước */
export const rising = (r: DemandRow) => r.searches >= 3 && r.searches >= 2 * Math.max(1, r.prev);

/** Link tìm trên sàn (để tìm món nhập thêm) */
export const marketSearchUrl = (platform: "shopee" | "lazada" | "tiktok", q: string) =>
  platform === "shopee"
    ? `https://shopee.vn/search?keyword=${encodeURIComponent(q)}`
    : platform === "lazada"
      ? `https://www.lazada.vn/catalog/?q=${encodeURIComponent(q)}`
      : `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

/** Mã chủ đề bài hướng dẫn theo từ khoá (giống queryTopic trong worker/guide-ai.ts) */
export const queryTopicKey = (q: string) => `q-${slugify(q.replace(/\s+/g, " ").trim().slice(0, 60)).slice(0, 60)}`;

/** Từ khoá đã có bài hướng dẫn AI (nháp, đã duyệt hoặc đã đăng) */
export async function guidedQueries(): Promise<Set<string>> {
  await ensureMigrated();
  const rows = await db.select({ topic: aiGuides.topic, status: aiGuides.status }).from(aiGuides).where(sql`${aiGuides.topic} like 'q-%'`);
  return new Set(rows.filter((r) => r.status !== "rejected").map((r) => r.topic));
}
