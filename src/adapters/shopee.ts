import { createHash } from "node:crypto";
import type { ConversionInput, ProductInput, SourceAdapter } from "./types";

/**
 * Shopee Affiliate Open API (GraphQL).
 * Ký: Authorization: SHA256 Credential={AppId}, Timestamp={ts}, Signature=sha256(AppId+ts+payload+Secret)
 * Kiểm tra lại tên trường/tham số trong API Explorer: https://open-api.affiliate.shopee.vn/explorer/v2
 */
const PRODUCT_QUERY = `query ($keyword: String, $page: Int, $limit: Int, $sortType: Int) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType) {
    nodes {
      itemId shopId productName shopName
      priceMin priceMax priceDiscountRate
      commissionRate sales ratingStar
      imageUrl offerLink productLink productCatIds
    }
    pageInfo { page limit hasNextPage }
  }
}`;

interface ShopeeNode {
  itemId: number | string;
  shopId?: number | string;
  productName: string;
  shopName?: string;
  priceMin: string | number;
  priceMax?: string | number;
  priceDiscountRate?: number;
  commissionRate?: string | number;
  sales?: number;
  ratingStar?: string | number;
  imageUrl?: string;
  offerLink?: string;
  productLink?: string;
  productCatIds?: number[];
}

export function signShopee(appId: string, secret: string, payload: string, ts: number) {
  const signature = createHash("sha256").update(`${appId}${ts}${payload}${secret}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const appId = process.env.SHOPEE_APP_ID!;
  const secret = process.env.SHOPEE_SECRET!;
  const endpoint = process.env.SHOPEE_ENDPOINT || "https://open-api.affiliate.shopee.vn/graphql";
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: signShopee(appId, secret, payload, ts) },
      body: payload,
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: number } }[] };
    const rateLimited = json.errors?.some((e) => e.extensions?.code === 10030);
    if (rateLimited) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (json.errors?.length) throw new Error(`Shopee API: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data as T;
  }
  throw new Error("Shopee API: vượt hạn mức request");
}

export function mapShopeeNode(n: ShopeeNode): ProductInput {
  const price = Number(n.priceMin);
  const discountPct = Number(n.priceDiscountRate ?? 0);
  return {
    platform: "shopee",
    externalId: String(n.itemId),
    name: n.productName,
    shopName: n.shopName,
    imageUrl: n.imageUrl,
    category: n.productCatIds?.[0] != null ? String(n.productCatIds[0]) : undefined,
    price,
    originalPrice: discountPct > 0 && discountPct < 100 ? Math.round(price / (1 - discountPct / 100)) : undefined,
    discountPct,
    rating: n.ratingStar != null ? Number(n.ratingStar) : undefined,
    sold: n.sales,
    commissionRate: n.commissionRate != null ? Number(n.commissionRate) : undefined,
    affiliateUrl: n.offerLink || n.productLink || `https://shopee.vn/product/${n.shopId}/${n.itemId}`,
  };
}

const CONVERSION_QUERY = `query ($start: Int64, $end: Int64, $scrollId: String) {
  conversionReport(purchaseTimeStart: $start, purchaseTimeEnd: $end, limit: 500, scrollId: $scrollId) {
    nodes {
      conversionId purchaseTime totalCommission conversionStatus
      orders { orderId orderStatus items { itemPrice qty itemTotalCommission } }
    }
    pageInfo { hasNextPage scrollId }
  }
}`;

interface ShopeeConversion {
  conversionId: string | number;
  purchaseTime: number;
  totalCommission?: string | number;
  conversionStatus?: string;
  orders?: { orderId: string; orderStatus?: string; items?: { itemPrice?: string | number; qty?: number }[] }[];
}

export function mapShopeeConversion(c: ShopeeConversion): ConversionInput {
  const amount = (c.orders ?? []).flatMap((o) => o.items ?? []).reduce((s, i) => s + Number(i.itemPrice ?? 0) * (i.qty ?? 1), 0);
  const st = `${c.conversionStatus ?? c.orders?.[0]?.orderStatus ?? ""}`.toUpperCase();
  return {
    source: "shopee",
    externalId: String(c.conversionId),
    platform: "shopee",
    orderAmount: amount,
    commission: Number(c.totalCommission ?? 0),
    status: st.includes("CANCEL") || st.includes("INVALID") ? "cancelled" : st.includes("COMPLETE") ? "completed" : "pending",
    purchasedAt: new Date(c.purchaseTime * 1000),
    raw: c,
  };
}

export const shopeeAdapter: SourceAdapter = {
  name: "shopee",
  async fetchProducts() {
    if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) {
      console.warn("[shopee] Thiếu SHOPEE_APP_ID/SHOPEE_SECRET, bỏ qua");
      return [];
    }
    const keywords = (process.env.SHOPEE_KEYWORDS || "").split(",").map((k) => k.trim()).filter(Boolean);
    const out: ProductInput[] = [];
    for (const keyword of keywords) {
      for (let page = 1; page <= 2; page++) {
        const data = await gql<{ productOfferV2: { nodes: ShopeeNode[]; pageInfo: { hasNextPage: boolean } } }>(
          PRODUCT_QUERY,
          { keyword, page, limit: 50, sortType: 2 },
        );
        out.push(...data.productOfferV2.nodes.map(mapShopeeNode));
        if (!data.productOfferV2.pageInfo.hasNextPage) break;
      }
    }
    return out;
  },
  async fetchConversions(since) {
    if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) return [];
    const out: ConversionInput[] = [];
    let scrollId: string | undefined;
    // Shopee giới hạn khoảng thời gian ~90 ngày/lần và scrollId hết hạn sau ~30 giây
    for (let page = 0; page < 20; page++) {
      const data = await gql<{ conversionReport: { nodes: ShopeeConversion[]; pageInfo: { hasNextPage: boolean; scrollId?: string } } }>(
        CONVERSION_QUERY,
        { start: Math.floor(since.getTime() / 1000), end: Math.floor(Date.now() / 1000), scrollId },
      );
      out.push(...data.conversionReport.nodes.map(mapShopeeConversion));
      if (!data.conversionReport.pageInfo.hasNextPage) break;
      scrollId = data.conversionReport.pageInfo.scrollId;
    }
    return out;
  },
};
