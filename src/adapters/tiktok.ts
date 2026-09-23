import { createHmac } from "node:crypto";
import type { ProductInput, SourceAdapter } from "./types";

/**
 * TikTok Shop Partner API – Affiliate Creator: tìm sản phẩm open collaboration.
 * Cần app được cấp scope affiliate + access token của tài khoản creator (Partner Center).
 * Ký: sign = HMAC-SHA256(appSecret, appSecret + path + nối key+value (sắp xếp, bỏ sign/access_token) + body + appSecret), hex thường.
 * Kiểm tra lại phiên bản API và trường dữ liệu trong https://partner.tiktokshop.com/docv2 trước khi chạy thật.
 */
export function signTikTok(path: string, query: Record<string, string>, body: string, secret: string) {
  const keys = Object.keys(query).filter((k) => k !== "sign" && k !== "access_token").sort();
  const base = secret + path + keys.map((k) => `${k}${query[k]}`).join("") + body + secret;
  return createHmac("sha256", secret).update(base).digest("hex");
}

interface TikTokProduct {
  id: string;
  title: string;
  main_image_url?: string;
  original_price?: { minimum_amount?: string; maximum_amount?: string };
  sales_price?: { minimum_amount?: string; maximum_amount?: string };
  commission?: { rate?: number; amount?: string };
  units_sold?: number;
  sale_region?: string;
  shop?: { name?: string };
  category_chains?: { local_name?: string; is_leaf?: boolean }[];
  detail_link?: string;
  product_rating?: number;
}

export function mapTikTokProduct(p: TikTokProduct, promotionLink?: string): ProductInput | null {
  const price = Number(p.sales_price?.minimum_amount ?? p.original_price?.minimum_amount);
  if (!price) return null;
  const original = Number(p.original_price?.minimum_amount ?? 0) || undefined;
  const rate = p.commission?.rate ?? 0; // đơn vị: phần vạn (vd 1000 = 10%)
  return {
    platform: "tiktok",
    externalId: String(p.id),
    name: p.title,
    imageUrl: p.main_image_url,
    shopName: p.shop?.name,
    category: p.category_chains?.[0]?.local_name,
    price,
    originalPrice: original && original > price ? original : undefined,
    discountPct: original && original > price ? Math.round((1 - price / original) * 100) : 0,
    rating: p.product_rating,
    sold: p.units_sold,
    commissionRate: rate ? rate / 10_000 : undefined,
    affiliateUrl: promotionLink || p.detail_link || `https://shop.tiktok.com/view/product/${p.id}`,
  };
}

export const tiktokAdapter: SourceAdapter = {
  name: "tiktok",
  async fetchProducts() {
    const appKey = process.env.TIKTOK_APP_KEY;
    const secret = process.env.TIKTOK_APP_SECRET;
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    if (!appKey || !secret || !token) {
      console.warn("[tiktok] Thiếu TIKTOK_APP_KEY / TIKTOK_APP_SECRET / TIKTOK_ACCESS_TOKEN, bỏ qua");
      return [];
    }
    const base = process.env.TIKTOK_API_BASE || "https://open-api.tiktokglobalshop.com";
    const path = process.env.TIKTOK_SEARCH_PATH || "/affiliate_creator/202405/open_collaborations/products/search";
    const keywords = (process.env.TIKTOK_KEYWORDS || process.env.SHOPEE_KEYWORDS || "").split(",").map((k) => k.trim()).filter(Boolean);
    const out: ProductInput[] = [];

    for (const keyword of keywords) {
      let pageToken = "";
      for (let page = 0; page < 2; page++) {
        const query: Record<string, string> = {
          app_key: appKey,
          timestamp: String(Math.floor(Date.now() / 1000)),
          page_size: "20",
          ...(pageToken ? { page_token: pageToken } : {}),
        };
        const body = JSON.stringify({ title_keywords: [keyword], sort_field: "units_sold", sort_order: "DESC" });
        query.sign = signTikTok(path, query, body, secret);
        const res = await fetch(`${base}${path}?${new URLSearchParams(query)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tts-access-token": token },
          body,
        });
        const json = (await res.json()) as { code: number; message: string; data?: { products?: TikTokProduct[]; next_page_token?: string } };
        if (json.code !== 0) throw new Error(`TikTok Shop API ${json.code}: ${json.message}`);
        out.push(...(json.data?.products ?? []).map((p) => mapTikTokProduct(p)).filter((x): x is ProductInput => !!x));
        pageToken = json.data?.next_page_token ?? "";
        if (!pageToken) break;
      }
    }
    return out;
  },
};
