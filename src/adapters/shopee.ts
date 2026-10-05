import { createHash } from "node:crypto";
import { lineStatus } from "@/lib/convstatus";
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
      imageUrl offerLink productLink productCatIds __SHOP_FIELDS__
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
  /** 1 = Shopee Mall, 2 = Shop yêu thích, 4 = Yêu thích+ (theo tài liệu Affiliate Open API) */
  shopType?: number[] | number;
}

export function signShopee(appId: string, secret: string, payload: string, ts: number) {
  const signature = createHash("sha256").update(`${appId}${ts}${payload}${secret}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`;
}

/** Trường loại shop; nếu tài khoản/phiên bản API không hỗ trợ thì tự bỏ và gọi lại */
let shopFields = process.env.SHOPEE_SHOP_FIELDS ?? "shopType";

async function gql<T>(rawQuery: string, variables: Record<string, unknown>): Promise<T> {
  try {
    return await gqlOnce<T>(rawQuery.replaceAll("__SHOP_FIELDS__", shopFields), variables);
  } catch (err) {
    if (shopFields && /shopType|field|Cannot query/i.test((err as Error).message)) {
      console.warn("[shopee] API không hỗ trợ trường shopType, bỏ qua");
      shopFields = "";
      return gqlOnce<T>(rawQuery.replaceAll("__SHOP_FIELDS__", ""), variables);
    }
    throw err;
  }
}

async function gqlOnce<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
  const types = n.shopType == null ? [] : Array.isArray(n.shopType) ? n.shopType : [n.shopType];
  return {
    platform: "shopee",
    externalId: String(n.itemId),
    name: n.productName,
    shopName: n.shopName,
    shopType: types.includes(1) ? "mall" : types.some((t) => t === 2 || t === 4) ? "preferred" : undefined,
    imageUrl: n.imageUrl,
    category: n.productCatIds?.[0] != null ? String(n.productCatIds[0]) : undefined,
    price,
    originalPrice: discountPct > 0 && discountPct < 100 ? Math.round(price / (1 - discountPct / 100)) : undefined,
    discountPct,
    rating: n.ratingStar != null ? Number(n.ratingStar) : undefined,
    sold: n.sales,
    commissionRate: n.commissionRate != null ? Number(n.commissionRate) : undefined,
    affiliateUrl: n.offerLink || n.productLink || `https://shopee.vn/product/${n.shopId}/${n.itemId}`,
    productUrl: n.shopId != null ? `https://shopee.vn/product/${n.shopId}/${n.itemId}` : undefined,
  };
}

const CONVERSION_QUERY = `query ($start: Int64, $end: Int64, $scrollId: String) {
  conversionReport(purchaseTimeStart: $start, purchaseTimeEnd: $end, limit: 500, scrollId: $scrollId) {
    nodes {
      conversionId purchaseTime totalCommission conversionStatus __CONV_FIELDS__
      orders { orderId orderStatus items { itemPrice qty itemTotalCommission __ITEM_FIELDS__ } }
    }
    pageInfo { hasNextPage scrollId }
  }
}`;
// Trường chi tiết (mã sản phẩm, giờ bấm, sub_id) để ghép đơn với món và kênh; API cũ không có thì tự bỏ
const CONV_FIELDS = "clickTime utmContent";
const ITEM_FIELDS = "itemId itemName shopId modelId completeTime displayItemStatus";
let convDetail = true;

interface ShopeeConversion {
  conversionId: string | number;
  purchaseTime: number;
  totalCommission?: string | number;
  conversionStatus?: string;
  clickTime?: number;
  utmContent?: string;
  orders?: {
    orderId: string;
    orderStatus?: string;
    items?: { itemPrice?: string | number; qty?: number; itemTotalCommission?: string | number; itemId?: string | number; itemName?: string; shopId?: string | number; modelId?: string | number; completeTime?: number; displayItemStatus?: string }[];
  }[];
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
    orders: (c.orders ?? []).map((o) => ({
      orderId: String(o.orderId),
      lines: (o.items ?? []).map((i, k) => {
        const status = lineStatus(i.displayItemStatus || o.orderStatus || c.conversionStatus);
        return {
          lineKey: i.itemId ? `${i.itemId}${i.modelId ? `:${i.modelId}` : ""}` : `#${k + 1}`,
          itemId: i.itemId ? String(i.itemId) : null,
          itemName: i.itemName ?? null,
          shopId: i.shopId ? String(i.shopId) : null,
          price: Number(i.itemPrice ?? 0),
          qty: i.qty ?? 1,
          commission: Number(i.itemTotalCommission ?? 0),
          status,
          purchasedAt: new Date(c.purchaseTime * 1000),
          completedAt: i.completeTime ? new Date(i.completeTime * 1000) : null,
          clickedAt: c.clickTime ? new Date(c.clickTime * 1000) : null,
          subIds: c.utmContent || null,
        };
      }),
    })),
  };
}

const LOOKUP_QUERY = `query ($itemId: Int64, $shopId: Int64) {
  productOfferV2(itemId: $itemId, shopId: $shopId, page: 1, limit: 1) {
    nodes {
      itemId shopId productName shopName
      priceMin priceMax priceDiscountRate
      commissionRate sales ratingStar
      imageUrl offerLink productLink productCatIds __SHOP_FIELDS__
    }
  }
}`;

export const shopeeAdapter: SourceAdapter = {
  name: "shopee",
  async lookup(ref) {
    if (ref.platform !== "shopee" || !process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) return null;
    const data = await gql<{ productOfferV2: { nodes: ShopeeNode[] } }>(LOOKUP_QUERY, {
      itemId: Number(ref.externalId),
      shopId: ref.shopId ? Number(ref.shopId) : undefined,
    });
    const node = data.productOfferV2.nodes[0];
    return node ? mapShopeeNode(node) : null;
  },
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
      type Report = { conversionReport: { nodes: ShopeeConversion[]; pageInfo: { hasNextPage: boolean; scrollId?: string } } };
      const vars = { start: Math.floor(since.getTime() / 1000), end: Math.floor(Date.now() / 1000), scrollId };
      const q = (detail: boolean) => CONVERSION_QUERY.replace("__CONV_FIELDS__", detail ? CONV_FIELDS : "").replace("__ITEM_FIELDS__", detail ? ITEM_FIELDS : "");
      let data: Report;
      try {
        data = await gql<Report>(q(convDetail), vars);
      } catch (err) {
        if (!convDetail || !/field|Cannot query|unknown/i.test((err as Error).message)) throw err;
        console.warn("[shopee] báo cáo đơn không có trường chi tiết, dùng bản cơ bản:", (err as Error).message.slice(0, 200));
        convDetail = false;
        data = await gql<Report>(q(false), vars);
      }
      out.push(...data.conversionReport.nodes.map(mapShopeeConversion));
      if (!data.conversionReport.pageInfo.hasNextPage) break;
      scrollId = data.conversionReport.pageInfo.scrollId;
    }
    return out;
  },
};
