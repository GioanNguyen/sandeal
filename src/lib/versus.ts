/**
 * Trang so sánh "A hay B?" (/so-sanh/ten-a-12-vs-ten-b-34): hai món cùng loại, cùng danh mục.
 * Chỉ so giá, lịch sử giá và số liệu sàn công bố – không so chất lượng hay thông số kỹ thuật.
 */
import { and, desc, isNotNull, lt } from "drizzle-orm";
import { products } from "@/db/schema";
import { buyAdvice, type Advice } from "./advice";
import { availableSql, isUnavailable, platformLatest } from "./availability";
import { db, ensureMigrated } from "./db";
import { dealsByIds, getProduct, type DealRow } from "./queries";
import { productPath } from "./slug";

const part = (p: { id: number; name: string }) => productPath(p).replace(/^\/product\//, "");
/** Luôn đặt món có mã nhỏ hơn trước để mỗi cặp chỉ có 1 địa chỉ */
export function versusPath(a: { id: number; name: string }, b: { id: number; name: string }) {
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  return `/so-sanh/${part(x)}-vs-${part(y)}`;
}
export function parseVersus(slug: string): [number, number] | null {
  const m = decodeURIComponent(slug).match(/^(?:.*-)?(\d+)-vs-(?:.*-)?(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a && b && a !== b ? [a, b] : null;
}

/** Loại sản phẩm = 2 chữ đầu của tên ("Tai nghe", "Nồi chiên") */
export const kindOf = (name: string) => name.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
export const comparable = (a: { category: string | null; name: string; groupKey?: string | null }, b: { category: string | null; name: string; groupKey?: string | null }) =>
  !!a.category && a.category === b.category && kindOf(a.name) === kindOf(b.name) && a.name.toLowerCase() !== b.name.toLowerCase() && (!a.groupKey || a.groupKey !== b.groupKey);

export interface VersusSide {
  deal: DealRow;
  advice: Advice;
  prices: { price: number; capturedAt: Date }[];
  gone: boolean;
}

export async function getVersus(ids: [number, number]): Promise<{ a: VersusSide; b: VersusSide } | null> {
  await ensureMigrated();
  const [pa, pb] = await Promise.all(ids.map((i) => getProduct(i)));
  if (!pa || !pb || !comparable(pa, pb)) return null;
  const [rows, latest] = await Promise.all([dealsByIds(ids), platformLatest()]);
  const side = (p: NonNullable<typeof pa>): VersusSide => ({
    deal: rows.find((r) => r.id === p.id)!,
    advice: buyAdvice(p.prices, p.price),
    prices: p.prices,
    gone: isUnavailable(p, latest),
  });
  const [x, y] = pa.id < pb.id ? [pa, pb] : [pb, pa];
  return { a: side(x), b: side(y) };
}

/** Các cặp nên có trang: trong mỗi nhóm (danh mục + loại), so 4 món điểm deal cao nhất với nhau */
export async function versusPairs(limit = 5000): Promise<{ a: { id: number; name: string }; b: { id: number; name: string } }[]> {
  await ensureMigrated();
  const rows = await db
    .select({ id: products.id, name: products.name, category: products.category, groupKey: products.groupKey, createdAt: products.createdAt })
    .from(products)
    // Chỉ món đã theo dõi từ 7 ngày (trang so sánh của món mới chưa cho Google index)
    .where(and(isNotNull(products.category), availableSql(), lt(products.createdAt, new Date(Date.now() - 7 * 86_400_000))))
    .orderBy(desc(products.dealScore));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.category}|${kindOf(r.name)}`;
    const g = groups.get(k) ?? groups.set(k, []).get(k)!;
    if (g.length < 4 && !g.some((x) => x.name.toLowerCase() === r.name.toLowerCase() || (r.groupKey && x.groupKey === r.groupKey))) g.push(r);
  }
  const out: { a: { id: number; name: string }; b: { id: number; name: string } }[] = [];
  for (const g of groups.values())
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (out.length < limit) out.push({ a: g[i], b: g[j] });
  return out;
}
