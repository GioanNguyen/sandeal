import type { Platform, SourceAdapter, VoucherInput } from "./types";

/**
 * AccessTrade Publisher API – thông tin khuyến mãi / mã giảm giá.
 * Tài liệu: https://developers.accesstrade.vn/api-publisher-vietnamese
 */
interface ATCoupon {
  id: string | number;
  name?: string;
  content?: string;
  merchant?: string;
  domain?: string;
  aff_link?: string;
  link?: string;
  start_time?: string;
  end_time?: string;
  start_date?: string;
  end_date?: string;
  discount_value?: number | string;
  discount_percentage?: number | string;
  min_spend?: number | string;
  max_value?: number | string;
  coupons?: { coupon_code?: string; coupon_desc?: string }[];
}

const toPlatform = (merchant = ""): Platform | null => {
  const m = merchant.toLowerCase();
  if (m.includes("shopee")) return "shopee";
  if (m.includes("lazada")) return "lazada";
  if (m.includes("tiktok")) return "tiktok";
  return null;
};

const toDate = (s?: string) => (s ? new Date(s.replace(" ", "T")) : undefined);

export function mapATCoupon(c: ATCoupon): VoucherInput | null {
  const platform = toPlatform(c.merchant || c.domain);
  if (!platform) return null;
  const pct = Number(c.discount_percentage || 0);
  const val = Number(c.discount_value || 0);
  return {
    source: "accesstrade",
    externalId: String(c.id),
    platform,
    code: c.coupons?.[0]?.coupon_code || undefined,
    title: c.name || c.coupons?.[0]?.coupon_desc || "Khuyến mãi",
    description: c.content,
    discountText: pct ? `${pct}%` : val ? `${val.toLocaleString("vi-VN")}đ` : undefined,
    minSpend: c.min_spend ? Number(c.min_spend) : undefined,
    ...(pct ? { discountType: "percent" as const, discountValue: pct } : val ? { discountType: "fixed" as const, discountValue: val } : {}),
    maxDiscount: c.max_value ? Number(c.max_value) : undefined,
    startAt: toDate(c.start_time || c.start_date),
    endAt: toDate(c.end_time || c.end_date),
    affiliateUrl: c.aff_link || c.link || "#",
  };
}

export const accesstradeAdapter: SourceAdapter = {
  name: "accesstrade",
  async fetchVouchers() {
    const token = process.env.ACCESSTRADE_TOKEN;
    if (!token) {
      console.warn("[accesstrade] Thiếu ACCESSTRADE_TOKEN, bỏ qua");
      return [];
    }
    const merchants = (process.env.ACCESSTRADE_MERCHANTS || "shopee,lazada,tiktokshop").split(",");
    const out: VoucherInput[] = [];
    for (const merchant of merchants) {
      const url = `https://api.accesstrade.vn/v1/offers_informations/coupon?merchant=${encodeURIComponent(merchant.trim())}&limit=100&page=1`;
      const res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
      if (!res.ok) {
        console.warn(`[accesstrade] ${merchant}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { data?: ATCoupon[] };
      for (const c of json.data ?? []) {
        const v = mapATCoupon({ merchant, ...c });
        if (v) out.push(v);
      }
    }
    return out;
  },
};
