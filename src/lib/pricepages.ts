/**
 * Trang "Giá [loại sản phẩm] hôm nay" (/gia/[slug]) – sinh tự động từ dữ liệu giá thật.
 * Loại sản phẩm = phần đầu chung của tên (tối thiểu 2 chữ: "Tai nghe bluetooth", "Nồi chiên").
 * Mọi con số đều tính từ lịch sử giá; chỗ nào dữ liệu chưa đủ thì nói rõ là chưa đủ, không suy đoán.
 */
import { and, desc, gte, ilike, inArray } from "drizzle-orm";
import { pricePoints, products, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { enrichDeals, type DealRow } from "./queries";
import { salesBetween, type SaleEvent } from "./sales";
import { slugify } from "./slug";

export interface PriceTopic {
  slug: string;
  /** "Tai nghe bluetooth" */
  label: string;
  count: number;
}

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const VN = 7 * 3_600_000;
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const topicName = (t: { label: string }) => lower1(t.label);

/** Tất cả loại sản phẩm có ≥ 2 mẫu khác nhau */
export async function priceTopics(): Promise<PriceTopic[]> {
  await ensureMigrated();
  const rows = await db.select({ name: products.name, groupKey: products.groupKey }).from(products);
  const groups = new Map<string, { names: Set<string>; keys: Set<string> }>();
  for (const r of rows) {
    const w = r.name.split(/\s+/);
    if (w.length < 2) continue;
    const k = w.slice(0, 2).join(" ").toLowerCase();
    const g = groups.get(k) ?? groups.set(k, { names: new Set(), keys: new Set() }).get(k)!;
    g.names.add(r.name);
    g.keys.add(r.groupKey ?? r.name.toLowerCase());
  }
  const out: PriceTopic[] = [];
  for (const [, g] of groups) {
    const names = [...g.names];
    if (names.length < 2 || g.keys.size < 2) continue;
    // Nhãn = phần đầu chung dài nhất (2–4 chữ)
    const words = names.map((x) => x.split(/\s+/));
    let k = 2;
    while (k < 4 && words.every((w) => w.length > k && w[k].toLowerCase() === words[0][k].toLowerCase())) k++;
    const label = words[0].slice(0, k).join(" ");
    out.push({ slug: slugify(label), label, count: g.keys.size });
  }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.slug) ? false : (seen.add(t.slug), true))).sort((a, b) => b.count - a.count);
}

type Pt = { price: number; at: number };

/** Giá của 1 sản phẩm tại thời điểm t (giá gần nhất trước t), không có thì undefined */
function priceAt(points: Pt[], t: number) {
  let v: number | undefined;
  for (const p of points) {
    if (p.at > t) break;
    v = p.price;
  }
  return v;
}

const vnDayKey = (t: number) => new Date(t + VN).toISOString().slice(0, 10);

export interface PriceTopicPage {
  topic: PriceTopic;
  /** Mỗi sản phẩm 1 dòng (đã gộp các sàn), rẻ nhất trước */
  cheapest: DealRow[];
  /** Giá rẻ nhất hiện tại theo từng sàn */
  byPlatform: { platform: string; price: number; name: string }[];
  now: { min: number; max: number; median: number };
  /** Giá rẻ nhất trong nhóm theo từng ngày (90 ngày) */
  daily: { price: number; capturedAt: Date }[];
  trackedDays: number;
  low90: { price: number; at: Date } | null;
  /** So sánh giá ngày sale với ngày thường (chỉ khi có ngày sale nằm trong dữ liệu) */
  saleEffect: { saleAvg: number; normalAvg: number; sales: string[] } | null;
  /** Tháng có giá thấp nhất (chỉ khi dữ liệu trải ≥ 2 tháng) */
  bestMonth: { month: number; avg: number; months: number } | null;
}

export async function getPriceTopic(slug: string): Promise<PriceTopicPage | null> {
  const topic = (await priceTopics()).find((t) => t.slug === slug);
  if (!topic) return null;
  const rows = (await db
    .select()
    .from(products)
    .where(ilike(products.name, `${topic.label.replace(/[%_]/g, "")}%`))
    .orderBy(products.price, desc(products.dealScore))) as Product[];
  if (!rows.length) return null;

  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const pts = await db
    .select({ productId: pricePoints.productId, price: pricePoints.price, capturedAt: pricePoints.capturedAt })
    .from(pricePoints)
    .where(and(inArray(pricePoints.productId, rows.map((r) => r.id)), gte(pricePoints.capturedAt, new Date(since.getTime() - 60 * DAY))))
    .orderBy(pricePoints.capturedAt);
  const hist = new Map<number, Pt[]>();
  for (const p of pts) (hist.get(p.productId) ?? hist.set(p.productId, []).get(p.productId)!).push({ price: p.price, at: p.capturedAt.getTime() });

  // Giá rẻ nhất trong nhóm theo từng ngày (cuối ngày giờ VN)
  const now = Date.now();
  const first = Math.max(since.getTime(), Math.min(...pts.map((p) => p.capturedAt.getTime()), now));
  const daily: { price: number; capturedAt: Date }[] = [];
  for (let t = first; t <= now; t += DAY) {
    const end = Math.min(t + DAY - 1, now);
    let best: number | undefined;
    for (const r of rows) {
      const v = priceAt(hist.get(r.id) ?? [], end);
      if (v != null && (best == null || v < best)) best = v;
    }
    if (best != null) daily.push({ price: best, capturedAt: new Date(end) });
  }
  const trackedDays = Math.floor((now - first) / DAY);

  const low = daily.reduce<{ price: number; at: Date } | null>((m, d) => (!m || d.price < m.price ? { price: d.price, at: d.capturedAt } : m), null);

  // Ngày sale so với ngày thường
  let saleEffect: PriceTopicPage["saleEffect"] = null;
  if (daily.length >= 14) {
    const sales: SaleEvent[] = salesBetween(new Date(first), new Date(now));
    const saleDays = new Set(sales.map((s) => vnDayKey(s.start.getTime())));
    const onSale = daily.filter((d) => saleDays.has(vnDayKey(d.capturedAt.getTime() - 1)));
    const normal = daily.filter((d) => !saleDays.has(vnDayKey(d.capturedAt.getTime() - 1)));
    if (onSale.length && normal.length >= 7) {
      const avg = (a: typeof daily) => a.reduce((s, d) => s + d.price, 0) / a.length;
      saleEffect = { saleAvg: avg(onSale), normalAvg: avg(normal), sales: sales.map((s) => s.name.replace(/ – .*/, "")) };
    }
  }

  // Tháng rẻ nhất (cần ít nhất 2 tháng, mỗi tháng ≥ 10 ngày dữ liệu)
  let bestMonth: PriceTopicPage["bestMonth"] = null;
  const byMonth = new Map<number, number[]>();
  for (const d of daily) {
    const m = new Date(d.capturedAt.getTime() + VN).getUTCMonth() + 1;
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(d.price);
  }
  const full = [...byMonth].filter(([, v]) => v.length >= 10);
  if (full.length >= 2) {
    const [month, v] = full.map(([m, v]) => [m, v.reduce((s, x) => s + x, 0) / v.length] as const).sort((a, b) => a[1] - b[1])[0];
    bestMonth = { month, avg: v, months: full.length };
  }

  // Mỗi sản phẩm (gộp các sàn) giữ bản rẻ nhất
  const seen = new Set<string>();
  const uniq = rows.filter((r) => {
    const k = r.groupKey ?? r.name.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
  const cheapest = await enrichDeals(uniq.slice(0, 12));

  const byPlatformMap = new Map<string, { platform: string; price: number; name: string }>();
  for (const r of rows) {
    const cur = byPlatformMap.get(r.platform);
    if (!cur || r.price < cur.price) byPlatformMap.set(r.platform, { platform: r.platform, price: r.price, name: r.name });
  }
  const prices = rows.map((r) => r.price).sort((a, b) => a - b);

  return {
    topic,
    cheapest,
    byPlatform: [...byPlatformMap.values()].sort((a, b) => a.price - b.price),
    now: { min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)] },
    daily,
    trackedDays,
    low90: low,
    saleEffect,
    bestMonth,
  };
}
