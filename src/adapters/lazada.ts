import { createHmac } from "node:crypto";
import type { ProductInput, SourceAdapter } from "./types";

/**
 * Lazada Open Platform – Affiliate API (dành cho publisher).
 * Ký request: sign = HMAC-SHA256(appSecret, apiPath + nối các cặp key+value đã sắp xếp theo key), dạng HEX IN HOA.
 * Gateway VN: https://api.lazada.vn/rest
 * LƯU Ý: tên endpoint/tham số affiliate khác nhau theo phiên bản tài liệu; kiểm tra lại trong
 * Lazada Open Platform > API Documentation > Affiliate sau khi app được duyệt, rồi chỉnh LAZADA_FEED_PATH nếu cần.
 */
export function signLazada(apiPath: string, params: Record<string, string>, secret: string) {
  const base = apiPath + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

async function call<T>(apiPath: string, extra: Record<string, string>): Promise<T> {
  const appKey = process.env.LAZADA_APP_KEY!;
  const secret = process.env.LAZADA_APP_SECRET!;
  const gateway = process.env.LAZADA_GATEWAY || "https://api.lazada.vn/rest";
  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    ...(process.env.LAZADA_ACCESS_TOKEN ? { access_token: process.env.LAZADA_ACCESS_TOKEN } : {}),
    ...extra,
  };
  params.sign = signLazada(apiPath, params, secret);
  const res = await fetch(`${gateway}${apiPath}?${new URLSearchParams(params)}`);
  const json = (await res.json()) as { code?: string; message?: string; result?: T; data?: T } & T;
  if (json.code && json.code !== "0") throw new Error(`Lazada API ${json.code}: ${json.message}`);
  return (json.result ?? json.data ?? json) as T;
}

interface LazadaItem {
  productId?: string | number;
  itemId?: string | number;
  productName?: string;
  title?: string;
  pictures?: string[];
  imageUrl?: string;
  discountPrice?: number | string;
  price?: number | string;
  originalPrice?: number | string;
  ratingScore?: number | string;
  sales7d?: number;
  sold?: number;
  totalCommissionRate?: number | string;
  commissionRate?: number | string;
  categoryL1Name?: string;
  sellerName?: string;
  isLazMall?: boolean | string;
  trackingLink?: string;
  productUrl?: string;
}

export function mapLazadaItem(i: LazadaItem): ProductInput | null {
  const id = i.productId ?? i.itemId;
  const price = Number(i.discountPrice ?? i.price);
  if (!id || !price) return null;
  const original = Number(i.originalPrice ?? 0) || undefined;
  const rate = Number(i.totalCommissionRate ?? i.commissionRate ?? 0);
  return {
    platform: "lazada",
    externalId: String(id),
    name: i.productName ?? i.title ?? "Sản phẩm Lazada",
    imageUrl: i.pictures?.[0] ?? i.imageUrl,
    shopName: i.sellerName,
    shopType: i.isLazMall === true || i.isLazMall === "true" ? "mall" : undefined,
    category: i.categoryL1Name,
    price,
    originalPrice: original && original > price ? original : undefined,
    discountPct: original && original > price ? Math.round((1 - price / original) * 100) : 0,
    rating: i.ratingScore != null ? Number(i.ratingScore) : undefined,
    sold: i.sold ?? i.sales7d,
    commissionRate: rate > 1 ? rate / 100 : rate || undefined,
    affiliateUrl: i.trackingLink || i.productUrl || `https://www.lazada.vn/products/i${id}.html`,
  };
}

export const lazadaAdapter: SourceAdapter = {
  name: "lazada",
  async fetchProducts() {
    if (!process.env.LAZADA_APP_KEY || !process.env.LAZADA_APP_SECRET || !process.env.LAZADA_USER_TOKEN) {
      console.warn("[lazada] Thiếu LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_USER_TOKEN, bỏ qua");
      return [];
    }
    const path = process.env.LAZADA_FEED_PATH || "/marketing/product/feed";
    const out: ProductInput[] = [];
    for (let page = 1; page <= Number(process.env.LAZADA_PAGES ?? 3); page++) {
      const r = await call<{ data?: LazadaItem[] } | LazadaItem[]>(path, {
        userToken: process.env.LAZADA_USER_TOKEN!,
        offerType: process.env.LAZADA_OFFER_TYPE || "1",
        page: String(page),
        limit: "50",
      });
      const items = Array.isArray(r) ? r : r.data ?? [];
      out.push(...items.map(mapLazadaItem).filter((x): x is ProductInput => !!x));
      if (items.length < 50) break;
    }
    return out;
  },
};
