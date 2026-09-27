/**
 * Trang shop (/shop/[slug]): "Shop X có giảm giá thật không?" – mọi con số tính từ lịch sử giá
 * các món của shop mà Săn Deal đang theo dõi. Không đánh giá uy tín shop nói chung, chỉ nói về giá.
 */
import { and, count, eq, isNotNull, max, min as minOf, sql } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { isUnavailable, platformLatest } from "./availability";
import { db, ensureMigrated } from "./db";
import { PLATFORMS } from "./format";
import { DAY, loadHistory } from "./pricehist";
import { enrichDeals, type DealRow } from "./queries";
import { saleReport, salePages } from "./salepages";
import { slugify } from "./slug";

/** Cần ít nhất ngần này món để có trang riêng (ít hơn thì số liệu không nói lên gì) */
export const SHOP_MIN_PRODUCTS = 3;

export const shopSlug = (platform: string, shopName: string) => slugify(`${shopName} ${PLATFORMS[platform]?.label ?? platform}`);
export const shopPath = (p: { platform: string; shopName: string | null }) => (p.shopName ? `/shop/${shopSlug(p.platform, p.shopName)}` : null);

export interface ShopRef {
  slug: string;
  platform: string;
  shopName: string;
  count: number;
  shopType: string | null;
  lastSeen: Date | null;
  /** Món đầu tiên của shop được theo dõi từ lúc này */
  firstSeen: Date | null;
}

export async function listShops(min = SHOP_MIN_PRODUCTS): Promise<ShopRef[]> {
  await ensureMigrated();
  const rows = await db
    .select({ platform: products.platform, shopName: products.shopName, n: count(), shopType: max(products.shopType), lastSeen: max(products.lastSeenAt), firstSeen: minOf(products.createdAt) })
    .from(products)
    .where(isNotNull(products.shopName))
    .groupBy(products.platform, products.shopName)
    .having(sql`count(*) >= ${min}`)
    .orderBy(sql`count(*) desc`);
  const seen = new Set<string>();
  return rows
    .map((r) => ({ slug: shopSlug(r.platform, r.shopName!), platform: r.platform, shopName: r.shopName!, count: Number(r.n), shopType: r.shopType, lastSeen: r.lastSeen ? new Date(r.lastSeen) : null, firstSeen: r.firstSeen ? new Date(r.firstSeen) : null }))
    .filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)));
}

export interface ShopReport {
  shop: ShopRef;
  shopRating: number | null;
  /** Món đang bán (còn thấy trên sàn), deal tốt trước */
  deals: DealRow[];
  tracked: number;
  available: number;
  /** Số ngày theo dõi lâu nhất trong các món */
  trackedDays: number;
  /** Món đang rẻ hơn giá thường ngày 30 ngày ít nhất 5% */
  realNow: number;
  /** Món ghi % giảm của shop từ 10% và có ≥14 ngày lịch sử (mẫu để xét "giảm ảo") */
  claimed: number;
  /** Trong số đó: % shop ghi cao hơn mức giảm thật từ 20 điểm % trở lên */
  inflated: number;
  /** Đợt sale gần nhất có đủ dữ liệu: bao nhiêu món giảm thật / tăng giá trước rồi giảm */
  lastSale: { name: string; slug: string; total: number; real: number; fake: number } | null;
}

export async function getShopReport(slug: string): Promise<ShopReport | null> {
  const shop = (await listShops()).find((s) => s.slug === slug);
  if (!shop) return null;
  const rows = (await db
    .select()
    .from(products)
    .where(and(eq(products.platform, shop.platform), eq(products.shopName, shop.shopName)))) as Product[];
  const latest = await platformLatest();
  const avail = rows.filter((p) => !isUnavailable(p, latest));
  const hist = await loadHistory(rows.map((r) => r.id));
  const now = Date.now();
  const days = (id: number) => {
    const pts = hist.get(id);
    return pts?.length ? (now - pts[0].at) / DAY : 0;
  };
  const claimedRows = rows.filter((p) => p.discountPct >= 10 && days(p.id) >= 14);
  const inflated = claimedRows.filter((p) => p.discountPct - Math.max(0, p.realDropPct) >= 20).length;

  // Đợt sale lớn gần nhất đã qua mà các món của shop có đủ dữ liệu
  let lastSale: ShopReport["lastSale"] = null;
  for (const sp of salePages().filter((x) => x.state === "past").reverse()) {
    const r = await saleReport(sp.event, new Date(), rows.map((x) => x.id));
    if (r.total >= SHOP_MIN_PRODUCTS) {
      lastSale = { name: sp.event.name.replace(/ – .*/, ""), slug: sp.slug, total: r.total, real: r.real.length, fake: r.fake.length };
      break;
    }
  }

  const ratings = rows.map((p) => p.shopRating).filter((x): x is number => x != null);
  return {
    shop,
    shopRating: ratings.length ? Math.max(...ratings) : null,
    deals: await enrichDeals([...avail].sort((a, b) => b.dealScore - a.dealScore).slice(0, 24)),
    tracked: rows.length,
    available: avail.length,
    trackedDays: Math.floor(Math.max(0, ...rows.map((r) => days(r.id)))),
    realNow: avail.filter((p) => p.realDropPct >= 5).length,
    claimed: claimedRows.length,
    inflated,
    lastSale,
  };
}
