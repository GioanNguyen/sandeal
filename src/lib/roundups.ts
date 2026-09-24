/**
 * Trang tổng hợp tự động "Top … giảm thật tuần này" – lấy từ dữ liệu giá thật, cập nhật liên tục.
 * 3 kiểu: theo loại sản phẩm (2 chữ đầu tên: "Tai nghe"), theo danh mục, theo danh mục + tầm giá.
 */
import { and, desc, eq, gte, ilike, isNotNull, lte, type SQL } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { vnd } from "./format";
import { enrichDeals, type DealRow } from "./queries";
import { slugify } from "./slug";

export const ROUNDUP_MIN = 3;
/** Số món tối thiểu để trang có mặt (theo loại sản phẩm chỉ cần 2 mẫu khác nhau) */
export const minItems = (d: { kind: string }) => (d.kind === "type" ? 2 : ROUNDUP_MIN);
const LIMIT = 10;
const BANDS = [
  { max: 199_000, label: "dưới 200K", slug: "duoi-200k" },
  { max: 499_000, label: "dưới 500K", slug: "duoi-500k" },
  { max: 999_000, label: "dưới 1 triệu", slug: "duoi-1-trieu" },
];

export interface RoundupDef {
  slug: string;
  kind: "type" | "category" | "band";
  /** Tên hiển thị: "tai nghe", "Điện tử" */
  subject: string;
  title: string;
  category?: string;
  typePrefix?: string;
  maxPrice?: number;
  bandLabel?: string;
  count: number;
}

const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Điều kiện chung: đang giảm thật (so với giá 30 ngày) */
const realDeal = () => gte(products.realDropPct, 5);

function whereOf(d: Pick<RoundupDef, "category" | "typePrefix" | "maxPrice">): SQL | undefined {
  return and(
    realDeal(),
    d.category ? eq(products.category, d.category) : undefined,
    d.typePrefix ? ilike(products.name, `${d.typePrefix.replace(/[%_]/g, "")}%`) : undefined,
    d.maxPrice ? lte(products.price, d.maxPrice) : undefined,
  );
}

/** Mỗi sản phẩm (gộp các sàn) chỉ giữ bản điểm deal cao nhất */
function dedupe(rows: Product[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = r.groupKey ?? r.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Tất cả trang tổng hợp đủ dữ liệu (≥ 3 món khác nhau đang giảm thật) */
export async function roundupDefs(): Promise<RoundupDef[]> {
  await ensureMigrated();
  const rows = await db
    .select({ name: products.name, category: products.category, price: products.price, groupKey: products.groupKey })
    .from(products)
    .where(and(realDeal(), isNotNull(products.category)));
  const distinct = (list: typeof rows) => new Set(list.map((r) => r.groupKey ?? r.name.toLowerCase())).size;
  const defs: RoundupDef[] = [];

  const cats = [...new Set(rows.map((r) => r.category!))];
  for (const c of cats) {
    const inCat = rows.filter((r) => r.category === c);
    const n = distinct(inCat);
    if (n >= ROUNDUP_MIN) defs.push({ slug: `${slugify(c)}-giam-that`, kind: "category", subject: `món ${lower1(c)}`, category: c, title: `Top deal ${lower1(c)} giảm thật tuần này`, count: n });
    for (const b of BANDS) {
      const m = distinct(inCat.filter((r) => r.price <= b.max));
      // Bỏ tầm giá nếu không đủ món, hoặc trùng hết với cả danh mục (khỏi lặp trang)
      if (m >= ROUNDUP_MIN && m < n) defs.push({ slug: `${slugify(c)}-${b.slug}`, kind: "band", subject: `món ${lower1(c)}`, category: c, maxPrice: b.max, bandLabel: b.label, title: `Deal ${lower1(c)} ${b.label} đáng mua`, count: m });
    }
  }

  // Loại sản phẩm = 2 chữ đầu của tên, cần ≥ 2 mẫu khác nhau để đáng thành 1 trang
  const types = new Map<string, typeof rows>();
  for (const r of rows) {
    const t = r.name.split(/\s+/).slice(0, 2).join(" ");
    if (t.split(" ").length < 2) continue;
    (types.get(t) ?? types.set(t, []).get(t)!).push(r);
  }
  for (const [, list] of types) {
    const names = [...new Set(list.map((r) => r.name))];
    const n = distinct(list);
    if (names.length < 2 || n < 2) continue;
    // Tên loại = phần đầu chung của các tên ("Kem chống nắng", "Sạc dự phòng"), tối thiểu 2 chữ
    const words = names.map((x) => x.split(/\s+/));
    let k = 2;
    while (k < 4 && words.every((w) => w.length > k && w[k].toLowerCase() === words[0][k].toLowerCase())) k++;
    const label = words[0].slice(0, k).join(" ");
    defs.push({ slug: `${slugify(label)}-giam-that`, kind: "type", subject: lower1(label), typePrefix: label, title: `Top ${lower1(label)} giảm thật tuần này`, count: n });
  }

  // Trùng slug (loại sản phẩm trùng tên danh mục) -> giữ cái đầu
  const seen = new Set<string>();
  return defs.filter((d) => (seen.has(d.slug) ? false : (seen.add(d.slug), true)));
}

export interface RoundupItem { deal: DealRow; reasons: string[] }

/** Lý do ngắn gọn, lấy thẳng từ số liệu (không viết bừa) */
export function reasonsFor(d: DealRow): string[] {
  const out: string[] = [];
  if (d.realDropPct >= 1) {
    const usual = d.price / (1 - d.realDropPct / 100);
    out.push(`Rẻ hơn giá thường ngày ${Math.round(d.realDropPct)}% (bớt ${vnd(Math.round((usual - d.price) / 1000) * 1000)})`);
  }
  if (d.recordLow) out.push("Giá thấp nhất từ khi theo dõi");
  else if (d.low30 != null && d.price <= d.low30 && (d.trackedDays ?? 0) >= 7) out.push("Thấp nhất 30 ngày qua");
  if (d.cheapestAcross && d.cheapestAcross >= 2) out.push(`Rẻ nhất trong ${d.cheapestAcross} sàn`);
  if (d.withVoucher) out.push(`Còn ${vnd(d.withVoucher.price)}${d.withVoucher.code ? ` với mã ${d.withVoucher.code}` : " khi áp mã sàn"}`);
  const social = [d.rating ? `${d.rating.toFixed(1)}★` : "", d.sold ? `${d.sold >= 1000 ? `${(d.sold / 1000).toFixed(1).replace(".0", "")}k` : d.sold} đã bán` : ""].filter(Boolean).join(" · ");
  if (social) out.push(social);
  return out.slice(0, 4);
}

export async function getRoundup(slug: string): Promise<{ def: RoundupDef; items: RoundupItem[]; related: RoundupDef[] } | null> {
  const defs = await roundupDefs();
  const def = defs.find((d) => d.slug === slug);
  if (!def) return null;
  const rows = await db.select().from(products).where(whereOf(def)).orderBy(desc(products.dealScore), products.id).limit(LIMIT * 4);
  const deals = await enrichDeals(dedupe(rows).slice(0, LIMIT));
  const related = defs.filter((d) => d.slug !== def.slug && (d.category === def.category || (def.typePrefix && d.category && rows[0]?.category === d.category))).slice(0, 6);
  return { def, items: deals.map((deal) => ({ deal, reasons: reasonsFor(deal) })), related };
}

/** Số tuần ISO theo giờ VN: "tuần 39/2026" */
export function weekLabel(now = new Date()) {
  const d = new Date(now.getTime() + 7 * 3_600_000);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `tuần ${week}/${thursday.getUTCFullYear()}`;
}

