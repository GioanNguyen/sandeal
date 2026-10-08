/**
 * Đổi link mua của món Shopee chưa có link affiliate (món khách góp qua tiện ích, file CSV thiếu "Link ưu đãi"…) sang link
 * affiliate, bằng công cụ tạo link hàng loạt của Shopee Affiliate:
 *   1. xuất danh sách link sản phẩm của các món đó (affLinkExport)
 *   2. quản trị viên dán / tải danh sách lên Shopee Affiliate, tải về file kết quả
 *   3. tải file kết quả lên đây (parseAffLinks + applyAffLinks): mỗi dòng có link sản phẩm gốc và link s.shopee.vn
 *      -> khớp theo mã sản phẩm, thay link mua.
 * Không phụ thuộc tên cột: Shopee đổi mẫu file thì vẫn đọc được, miễn mỗi dòng có đủ 2 link (CSV, dán từ Excel, văn bản).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { clicks, products, watches } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { parseProductUrl, plainProductUrl } from "./links";
import { memoClear } from "./memo";
import { issueSql, SHOPEE_AFF_RE } from "./producthealth";

export const EXPORT_MAX = 5000;

export interface AffExport {
  rows: { id: number; name: string; url: string }[];
  /** Món không xuất được vì không biết link sản phẩm đầy đủ (thiếu mã shop) */
  noLink: number;
}

/** Món Shopee chưa có link affiliate, món khách quan tâm trước (bấm mua, theo dõi giá), món ẩn bỏ qua */
export async function affLinkExport(max = EXPORT_MAX): Promise<AffExport> {
  await ensureMigrated();
  const clk = db.select({ pid: clicks.productId, n: sql<number>`count(*)`.as("cn") }).from(clicks).groupBy(clicks.productId).as("c");
  const wat = db.select({ pid: watches.productId, n: sql<number>`count(*)`.as("wn") }).from(watches).groupBy(watches.productId).as("w");
  const list = await db
    .select({ id: products.id, name: products.name, platform: products.platform, externalId: products.externalId, productUrl: products.productUrl, affiliateUrl: products.affiliateUrl })
    .from(products)
    .leftJoin(clk, sql`${clk.pid} = ${products.id}`)
    .leftJoin(wat, sql`${wat.pid} = ${products.id}`)
    .where(and(issueSql("no_aff"), sql`not ${products.hidden}`))
    .orderBy(desc(sql`coalesce(${clk.n}, 0) + 10 * coalesce(${wat.n}, 0)`), desc(products.lastSeenAt))
    .limit(max);
  const rows: AffExport["rows"] = [];
  let noLink = 0;
  for (const p of list) {
    const u = plainProductUrl(p);
    if (u.exact && !/\/product\/0\//.test(u.url)) rows.push({ id: p.id, name: p.name, url: u.url });
    else noLink++;
  }
  return { rows, noLink };
}

const URL_RE = /https?:\/\/[^\s"',;<>|]+/gi;

export interface AffParse {
  /** mã sản phẩm Shopee -> link affiliate */
  pairs: Map<string, string>;
  /** dòng có link affiliate nhưng không thấy link sản phẩm gốc đi kèm */
  noOrigin: number;
}

/** Đọc file kết quả / văn bản dán: mỗi dòng lấy link sản phẩm Shopee đầu tiên và link affiliate đầu tiên */
export function parseAffLinks(text: string): AffParse {
  const pairs = new Map<string, string>();
  let noOrigin = 0;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const urls = line.match(URL_RE) ?? [];
    if (!urls.length) continue;
    const aff = urls.find((u) => SHOPEE_AFF_RE.test(u));
    if (!aff) continue;
    let origin: string | undefined;
    for (const u of urls) {
      if (u === aff) continue;
      const ref = parseProductUrl(u);
      if (ref?.platform === "shopee") {
        origin = ref.externalId;
        break;
      }
    }
    if (!origin) {
      noOrigin++;
      continue;
    }
    pairs.set(origin, aff.replace(/[).\]]+$/, ""));
  }
  return { pairs, noOrigin };
}

export interface AffApply {
  updated: number;
  /** link sản phẩm trong file không khớp món nào trên web */
  notFound: number;
  noOrigin: number;
}

export async function applyAffLinks(p: AffParse): Promise<AffApply> {
  await ensureMigrated();
  const ids = [...p.pairs.keys()];
  if (!ids.length) return { updated: 0, notFound: 0, noOrigin: p.noOrigin };
  let updated = 0;
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db.select({ id: products.id, externalId: products.externalId, affiliateUrl: products.affiliateUrl }).from(products).where(and(eq(products.platform, "shopee"), inArray(products.externalId, chunk)));
    for (const r of rows) {
      found.add(r.externalId);
      const aff = p.pairs.get(r.externalId)!;
      if (r.affiliateUrl === aff) continue;
      await db.update(products).set({ affiliateUrl: aff }).where(eq(products.id, r.id));
      updated++;
    }
  }
  if (updated) memoClear("home:");
  return { updated, notFound: ids.length - found.size, noOrigin: p.noOrigin };
}

/** Tệp xuất: CSV (1 cột link, mở được bằng Excel) hoặc văn bản mỗi dòng 1 link (dán thẳng vào ô tạo link) */
export function affExportFile(e: AffExport, format: "csv" | "txt"): string {
  if (format === "txt") return e.rows.map((r) => r.url).join("\n") + "\n";
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "﻿" + ["Link sản phẩm,Tên sản phẩm,Mã Săn Deal", ...e.rows.map((r) => [q(r.url), q(r.name), r.id].join(","))].join("\r\n") + "\r\n";
}
