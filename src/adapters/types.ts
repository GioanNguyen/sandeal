export type Platform = "shopee" | "lazada" | "tiktok";

export interface ProductInput {
  platform: Platform;
  externalId: string;
  name: string;
  imageUrl?: string;
  shopName?: string;
  category?: string;
  price: number;
  originalPrice?: number;
  discountPct: number;
  rating?: number;
  sold?: number;
  commissionRate?: number;
  affiliateUrl: string;
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
}

/** Mỗi nguồn dữ liệu (sàn / mạng affiliate) là một adapter */
export interface SourceAdapter {
  name: string;
  fetchProducts?(): Promise<ProductInput[]>;
  fetchVouchers?(): Promise<VoucherInput[]>;
}
