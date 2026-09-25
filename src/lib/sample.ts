/** Sản phẩm do nguồn "mock" tạo ra (dữ liệu mẫu để chạy thử), không phải giá thật trên sàn */
export function isSampleProduct(p: { externalId: string; name: string; affiliateUrl?: string | null }) {
  return p.externalId.startsWith("mock-") || p.name.includes("(dữ liệu mẫu") || (p.affiliateUrl ?? "").startsWith("https://example.com/");
}
