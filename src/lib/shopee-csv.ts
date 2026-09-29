/**
 * Nhập sản phẩm từ file CSV "Lấy link sản phẩm hàng loạt" của Shopee Affiliate (affiliate.shopee.vn),
 * dùng khi chưa có Shopee Affiliate Open API.
 *
 * Cột của file: Mã sản phẩm, Tên sản phẩm, Giá, Doanh thu, Tên cửa hàng, Tỉ lệ hoa hồng, Hoa hồng, Link sản phẩm, Link ưu đãi
 * File KHÔNG có ảnh, giá gốc, danh mục, điểm đánh giá: các thông tin này được giữ nguyên nếu món đã có trong DB
 * (từ tiện ích góp giá hoặc nguồn khác), còn món mới thì để trống.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { ProductInput } from "@/adapters/types";
import { products, type Product } from "@/db/schema";
import { platformLatest, staleCutoff } from "./availability";
import { db, ensureMigrated } from "./db";
import { upsertProduct } from "./ingest";

/** Đọc CSV (có ngoặc kép, dấu phẩy/xuống dòng trong ô, BOM, CRLF) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const UNITS: Record<string, number> = { k: 1e3, n: 1e3, "nghìn": 1e3, tr: 1e6, m: 1e6, "triệu": 1e6, "tỷ": 1e9, ty: 1e9, b: 1e9 };

/**
 * Số kiểu Shopee: "29,9k" → 29900 · "1,1tr" → 1100000 · "₫7.176" → 7176 · "2tr+" → 2000000.
 * Trả về cả bước làm tròn của cách viết rút gọn (để biết giá hiển thị sai lệch tối đa bao nhiêu).
 */
export function parseVnNumber(raw: string): { value: number; step: number } | null {
  const s = raw.normalize("NFC").toLowerCase().replace(/[₫đ\s+]|vnd/g, "");
  const m = s.match(/^([\d.,]+)([a-zỷệìố]*)$/);
  if (!m) return null;
  const unit = m[2] ? UNITS[m[2]] : 1;
  if (!unit) return null;
  let num = m[1];
  let decimals = 0;
  if (unit > 1) {
    // Có đơn vị: dấu phẩy là phần thập phân ("29,9k"), dấu chấm cũng có thể là thập phân ("1.1tr")
    const parts = num.replace(",", ".").split(".");
    decimals = parts.length > 1 ? parts[parts.length - 1].length : 0;
    num = parts.length > 1 ? `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}` : parts[0];
  } else {
    // Không đơn vị: dấu chấm/phẩy là phân cách hàng nghìn ("7.176", "29,900")
    num = num.replace(/[.,]/g, "");
  }
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return { value: Math.round(n * unit), step: unit > 1 ? unit / 10 ** decimals : 1 };
}

/** "24,5%" → 0.245 */
export function parsePercent(raw: string): number | null {
  const n = Number(raw.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 && n < 100 ? n / 100 : null;
}

/**
 * Giá trong file bị rút gọn ("1,1tr" có thể là 1.050.000–1.149.999). Hoa hồng thì ghi đủ số,
 * nên giá ≈ hoa hồng / tỉ lệ; dùng giá suy ra khi nó khớp với giá rút gọn, không khớp thì dùng giá rút gọn.
 */
export function exactPrice(shown: { value: number; step: number }, commission: number | null, rate: number | null): number {
  if (shown.step <= 1 || !commission || !rate) return shown.value;
  const derived = Math.round(commission / rate / 100) * 100;
  return Math.abs(derived - shown.value) <= shown.step / 2 ? derived : shown.value;
}

const COLS = {
  id: "mã sản phẩm",
  name: "tên sản phẩm",
  price: "giá",
  sold: "doanh thu",
  shop: "tên cửa hàng",
  rate: "tỉ lệ hoa hồng",
  commission: "hoa hồng",
  link: "link sản phẩm",
  offer: "link ưu đãi",
} as const;

export interface CsvResult {
  items: ProductInput[];
  skipped: { line: number; reason: string }[];
}

export function mapShopeeCsv(text: string): CsvResult {
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.normalize("NFC").trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, name]) => [k, head.indexOf(name)])) as Record<keyof typeof COLS, number>;
  if (idx.id < 0 || idx.name < 0 || idx.price < 0) {
    throw new Error("Không đúng mẫu file: cần các cột “Mã sản phẩm”, “Tên sản phẩm”, “Giá” (file “Lấy link sản phẩm hàng loạt” của Shopee Affiliate)");
  }
  const get = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  const items: ProductInput[] = [];
  const skipped: CsvResult["skipped"] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = get(r, "id").replace(/\D/g, "");
    const name = get(r, "name").replace(/\s+/g, " ");
    const shown = parseVnNumber(get(r, "price"));
    if (!id || !name) return skipped.push({ line, reason: "thiếu mã hoặc tên" });
    if (!shown || shown.value < 1000) return skipped.push({ line, reason: `giá không đọc được “${get(r, "price")}”` });
    if (seen.has(id)) return skipped.push({ line, reason: "trùng mã" });
    seen.add(id);
    const rate = parsePercent(get(r, "rate"));
    const commission = parseVnNumber(get(r, "commission"))?.value ?? null;
    const link = get(r, "link");
    const offer = get(r, "offer");
    const shopId = link.match(/shopee\.vn\/product\/(\d+)\/\d+/)?.[1];
    const productUrl = /^https:\/\/shopee\.vn\//.test(link) ? link : shopId ? `https://shopee.vn/product/${shopId}/${id}` : `https://shopee.vn/product/0/${id}`;
    items.push({
      platform: "shopee",
      externalId: id,
      name,
      shopName: get(r, "shop") || undefined,
      price: exactPrice(shown, commission, rate),
      discountPct: 0,
      sold: parseVnNumber(get(r, "sold"))?.value,
      commissionRate: rate ?? undefined,
      // Link ưu đãi (s.shopee.vn) là link affiliate; không có thì dùng link sản phẩm (không tính hoa hồng)
      affiliateUrl: /^https:\/\/s\.shopee\.vn\//.test(offer) ? offer : productUrl,
    });
  });
  return { items, skipped };
}

/** Giữ các thông tin file không có (ảnh, giá gốc, danh mục…) từ bản ghi đang có */
export function mergeExisting(p: ProductInput, e: Product | undefined): ProductInput {
  if (!e) return p;
  // Giá gốc đã có (từ tiện ích) thì giữ nguyên dù giá mới cao hơn; chỉ hiện giá gạch khi còn lớn hơn giá bán
  const originalPrice = e.originalPrice ?? undefined;
  return {
    ...p,
    imageUrl: p.imageUrl ?? e.imageUrl ?? undefined,
    images: p.images ?? e.images ?? undefined,
    shopType: p.shopType ?? (e.shopType as ProductInput["shopType"]) ?? undefined,
    shopRating: p.shopRating ?? e.shopRating ?? undefined,
    category: p.category ?? e.category ?? undefined,
    rating: p.rating ?? e.rating ?? undefined,
    originalPrice,
    discountPct: originalPrice && originalPrice > p.price ? Math.round((1 - p.price / originalPrice) * 100) : 0,
  };
}

export interface ImportReport {
  imported: number;
  created: number;
  updated: number;
  noImage: number;
  skipped: CsvResult["skipped"];
}

export async function importShopeeCsv(text: string, now = new Date()): Promise<ImportReport> {
  await ensureMigrated();
  const { items, skipped } = mapShopeeCsv(text);
  const existing = items.length
    ? ((await db
        .select()
        .from(products)
        .where(and(eq(products.platform, "shopee"), inArray(products.externalId, items.map((p) => p.externalId))))) as Product[])
    : [];
  const byId = new Map(existing.map((e) => [e.externalId, e]));
  const cutoff = staleCutoff((await platformLatest()).get("shopee"));
  let noImage = 0;
  for (const p of items) {
    const merged = mergeExisting(p, byId.get(p.externalId));
    if (!merged.imageUrl) noImage++;
    await upsertProduct(merged, now, { restockCutoff: cutoff });
  }
  if (items.length) {
    const { groupProducts } = await import("@/worker/grouping");
    await groupProducts(now).catch((err) => console.warn("[csv] gom nhóm lỗi:", (err as Error).message));
  }
  return { imported: items.length, created: items.length - byId.size, updated: byId.size, noImage, skipped };
}
