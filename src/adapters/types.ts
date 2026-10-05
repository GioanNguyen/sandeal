export type Platform = "shopee" | "lazada" | "tiktok";

export interface ProductInput {
  platform: Platform;
  externalId: string;
  name: string;
  imageUrl?: string;
  /** Ảnh phụ (không gồm ảnh chính) */
  images?: string[];
  shopName?: string;
  shopType?: "mall" | "preferred";
  shopRating?: number;
  category?: string;
  price: number;
  originalPrice?: number;
  discountPct: number;
  rating?: number;
  sold?: number;
  commissionRate?: number;
  affiliateUrl: string;
  /** Link sản phẩm thường (không phải link tiếp thị liên kết), nếu nguồn có */
  productUrl?: string;
}

export interface VoucherInput {
  source: string;
  externalId: string;
  platform: Platform;
  code?: string;
  title: string;
  description?: string;
  discountText?: string;
  minSpend?: number;
  startAt?: Date;
  endAt?: Date;
  affiliateUrl: string;
  discountType?: "percent" | "fixed" | "freeship" | "cashback";
  discountValue?: number;
  maxDiscount?: number;
}

export interface ConversionInput {
  source: string;
  externalId: string;
  platform: Platform;
  orderAmount: number;
  commission: number;
  status: "pending" | "completed" | "cancelled";
  purchasedAt: Date;
  raw?: unknown;
  /** Chi tiết từng đơn con và từng sản phẩm (khi nguồn có) – lưu vào conversion_items */
  orders?: { orderId: string; lines: import("@/lib/revenue").ConversionLine[] }[];
}

/** Mỗi nguồn dữ liệu (sàn / mạng affiliate) là một adapter */
export interface SourceAdapter {
  name: string;
  fetchProducts?(): Promise<ProductInput[]>;
  fetchVouchers?(): Promise<VoucherInput[]>;
  /** Tra cứu 1 sản phẩm theo mã (khi người dùng dán link) */
  lookup?(ref: { platform: Platform; externalId: string; shopId?: string; url: string }): Promise<ProductInput | null>;
  /** Đơn hàng/hoa hồng phát sinh từ `since` (báo cáo của mạng affiliate) */
  fetchConversions?(since: Date): Promise<ConversionInput[]>;
}
