/**
 * Sitemap chia nhỏ theo loại trang: /sitemap.xml là "mục lục" trỏ tới các file con.
 * lastmod = lần ĐỔI GIÁ gần nhất (không phải lần đồng bộ), để Google chỉ quay lại khi thật sự có thay đổi.
 */
import { desc, eq, isNotNull, max, sql } from "drizzle-orm";
import { pricePoints, products } from "@/db/schema";
import { COLLECTIONS } from "./collections";
import { db, ensureMigrated } from "./db";
import { siteUrl } from "./mail";
import { roundupDefs } from "./roundups";
import { GUIDES } from "./guides";
import { priceTopics } from "./pricepages";
import { salePages } from "./salepages";
import { productPath, slugify } from "./slug";

export const PRODUCTS_PER_FILE = 10_000;
type Url = { loc: string; lastmod?: Date | null; changefreq?: string; priority?: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined);

export function urlsetXml(urls: Url[]) {
  const body = urls
    .map((u) => {
      const lm = iso(u.lastmod);
      return `<url><loc>${esc(u.loc)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}${u.priority != null ? `<priority>${u.priority.toFixed(1)}</priority>` : ""}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

export function indexXml(files: { loc: string; lastmod?: Date | null }[]) {
  const body = files.map((f) => `<sitemap><loc>${esc(f.loc)}</loc>${f.lastmod ? `<lastmod>${iso(f.lastmod)}</lastmod>` : ""}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

/** Lần đổi giá gần nhất của từng sản phẩm (không có lịch sử thì lấy ngày thêm vào) */
async function productRows() {
  const lastChange = db
    .select({ productId: pricePoints.productId, at: max(pricePoints.capturedAt).as("at") })
    .from(pricePoints)
    .groupBy(pricePoints.productId)
    .as("lc");
  return db
    .select({ id: products.id, name: products.name, category: products.category, createdAt: products.createdAt, at: lastChange.at })
    .from(products)
    .leftJoin(lastChange, eq(lastChange.productId, products.id))
    .orderBy(desc(products.dealScore), products.id);
}

const newest = (dates: (Date | null | undefined)[]) => {
  const ts = dates.filter(Boolean).map((d) => new Date(d!).getTime());
  return ts.length ? new Date(Math.max(...ts)) : null;
};

export async function sitemapFiles(): Promise<{ name: string; lastmod: Date | null }[]> {
  await ensureMigrated();
  const [{ at }] = await db.select({ at: max(pricePoints.capturedAt) }).from(pricePoints);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products);
  const chunks = Math.max(1, Math.ceil(total / PRODUCTS_PER_FILE));
  return [
    { name: "pages.xml", lastmod: null },
    { name: "categories.xml", lastmod: at ?? null },
    { name: "tops.xml", lastmod: at ?? null },
    { name: "topics.xml", lastmod: at ?? null },
    ...Array.from({ length: chunks }, (_, i) => ({ name: `products-${i + 1}.xml`, lastmod: at ?? null })),
  ];
}

export async function sitemapUrls(name: string): Promise<Url[] | null> {
  await ensureMigrated();
  const base = siteUrl();
  if (name === "pages.xml") {
    const pages: [string, string, number][] = [
      ["/", "hourly", 1],
      ["/vouchers", "hourly", 0.9],
      ["/lich-sale", "daily", 0.8],
      ["/top", "daily", 0.8],
      ["/bo-suu-tap", "daily", 0.8],
      ["/kiem-tra-gia", "monthly", 0.6],
      ["/so-sanh", "monthly", 0.5],
      ["/tinh-gia", "monthly", 0.5],
      ["/doan-gia", "daily", 0.5],
      ["/cong-dong", "daily", 0.5],
      ["/tien-ich", "monthly", 0.5],
      ["/gia", "daily", 0.7],
      ["/huong-dan", "monthly", 0.6],
      ["/cach-hoat-dong", "monthly", 0.4],
    ];
    return [
      ...pages.map(([p, changefreq, priority]) => ({ loc: `${base}${p}`, changefreq, priority })),
      ...COLLECTIONS.map((c) => ({ loc: `${base}/bo-suu-tap/${c.slug}`, changefreq: "daily", priority: 0.7 })),
      ...GUIDES.map((g) => ({ loc: `${base}/huong-dan/${g.slug}`, lastmod: new Date(`${g.updated}T00:00:00+07:00`), changefreq: "monthly", priority: 0.6 })),
      ...salePages().map((p) => ({ loc: `${base}/sale/${p.slug}`, changefreq: p.state === "past" ? "monthly" : "daily", priority: p.state === "past" ? 0.5 : 0.8 })),
    ];
  }
  if (name === "categories.xml") {
    const rows = await db
      .select({ category: products.category, at: max(pricePoints.capturedAt) })
      .from(products)
      .leftJoin(pricePoints, eq(pricePoints.productId, products.id))
      .where(isNotNull(products.category))
      .groupBy(products.category);
    return rows.map((r) => ({ loc: `${base}/danh-muc/${slugify(r.category!)}`, lastmod: r.at, changefreq: "daily", priority: 0.8 }));
  }
  if (name === "topics.xml") {
    const [topics, rows] = await Promise.all([priceTopics(), productRows()]);
    return topics.map((t) => {
      const pre = t.label.toLowerCase();
      const at = newest(rows.filter((r) => r.name.toLowerCase().startsWith(pre)).map((r) => r.at));
      return { loc: `${base}/gia/${t.slug}`, lastmod: at, changefreq: "daily", priority: 0.7 };
    });
  }
  if (name === "tops.xml") {
    const [defs, rows] = await Promise.all([roundupDefs(), productRows()]);
    const byCat = new Map<string, Date>();
    for (const r of rows) {
      if (!r.category || !r.at) continue;
      const prev = byCat.get(r.category);
      if (!prev || r.at > prev) byCat.set(r.category, r.at);
    }
    const all = newest([...byCat.values()]);
    return [
      ...defs.map((d) => ({ loc: `${base}/top/${d.slug}`, lastmod: (d.category && byCat.get(d.category)) || all, changefreq: "daily", priority: 0.7 })),
    ];
  }
  const m = name.match(/^products-(\d+)\.xml$/);
  if (m) {
    const i = Number(m[1]) - 1;
    const rows = await productRows();
    const slice = rows.slice(i * PRODUCTS_PER_FILE, (i + 1) * PRODUCTS_PER_FILE);
    if (i > 0 && !slice.length) return null;
    return slice.map((p) => ({ loc: `${base}${productPath(p)}`, lastmod: p.at ?? p.createdAt, changefreq: "daily", priority: 0.6 }));
  }
  return null;
}
