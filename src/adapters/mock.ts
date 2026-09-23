import type { Platform, ProductInput, SourceAdapter, VoucherInput } from "./types";

/** Dữ liệu mẫu để chạy thử khi chưa có API key. Giá dao động ngẫu nhiên mỗi lần sync. */
const CATALOG: [string, string, number][] = [
  ["Tai nghe Bluetooth chống ồn ANC", "Điện tử", 1_290_000],
  ["Nồi chiên không dầu 6L", "Gia dụng", 1_590_000],
  ["Sữa rửa mặt dịu nhẹ 236ml", "Làm đẹp", 329_000],
  ["Balo laptop chống nước 15.6\"", "Thời trang", 459_000],
  ["Bàn phím cơ không dây", "Điện tử", 890_000],
  ["Máy lọc không khí mini", "Gia dụng", 2_190_000],
  ["Kem chống nắng SPF50+", "Làm đẹp", 285_000],
  ["Giày chạy bộ nam", "Thời trang", 1_150_000],
  ["Sạc dự phòng 20000mAh 22.5W", "Điện tử", 520_000],
  ["Bình giữ nhiệt 750ml", "Gia dụng", 245_000],
  ["Serum Vitamin C 30ml", "Làm đẹp", 399_000],
  ["Áo khoác gió unisex", "Thời trang", 350_000],
  ["Chuột không dây im lặng", "Điện tử", 199_000],
  ["Máy hút bụi cầm tay", "Gia dụng", 1_790_000],
  ["Dầu gội thảo dược 500ml", "Làm đẹp", 159_000],
  ["Đồng hồ thông minh", "Điện tử", 1_490_000],
];
const PLATFORMS: Platform[] = ["shopee", "lazada", "tiktok"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function mockProducts(random: () => number = Math.random): ProductInput[] {
  const out: ProductInput[] = [];
  CATALOG.forEach(([name, category, base], i) => {
    PLATFORMS.forEach((platform, j) => {
      const fixed = rng(i * 31 + j * 7 + 1);
      const listPrice = Math.round((base * (0.9 + fixed() * 0.3)) / 1000) * 1000;
      const discountPct = Math.round(random() * 55);
      const price = Math.round((listPrice * (1 - discountPct / 100)) / 1000) * 1000;
      out.push({
        platform,
        externalId: `mock-${platform}-${i}`,
        name,
        category,
        shopName: `${["Official", "Mall", "Store"][j]} ${category}`,
        imageUrl: `https://picsum.photos/seed/sandeal${i}/400/400`,
        price,
        originalPrice: listPrice,
        discountPct,
        rating: Math.round((3.8 + fixed() * 1.2) * 10) / 10,
        sold: Math.round(fixed() ** 2 * 20000),
        commissionRate: Math.round((0.02 + fixed() * 0.08) * 100) / 100,
        affiliateUrl: `https://example.com/${platform}/${i}`,
      });
    });
  });
  return out;
}

export const mockAdapter: SourceAdapter = {
  name: "mock",
  async fetchProducts() {
    return mockProducts();
  },
  async fetchVouchers(): Promise<VoucherInput[]> {
    const now = Date.now();
    const d = (days: number) => new Date(now + days * 86_400_000);
    return [
      { source: "mock", externalId: "v1", platform: "shopee", code: "SHOPEE50K", title: "Giảm 50K đơn từ 300K", discountText: "50.000đ", minSpend: 300_000, startAt: d(-1), endAt: d(3), affiliateUrl: "https://example.com/shopee/voucher" },
      { source: "mock", externalId: "v2", platform: "shopee", title: "Freeship Xtra toàn quốc", discountText: "Freeship", minSpend: 0, startAt: d(-2), endAt: d(5), affiliateUrl: "https://example.com/shopee/freeship" },
      { source: "mock", externalId: "v3", platform: "lazada", code: "LAZ10", title: "Giảm 10% tối đa 100K", discountText: "10%", minSpend: 200_000, startAt: d(0), endAt: d(2), affiliateUrl: "https://example.com/lazada/voucher" },
      { source: "mock", externalId: "v4", platform: "tiktok", code: "TTS30K", title: "Giảm 30K cho đơn đầu tiên", discountText: "30.000đ", minSpend: 99_000, startAt: d(-3), endAt: d(10), affiliateUrl: "https://example.com/tiktok/voucher" },
      { source: "mock", externalId: "v5", platform: "lazada", title: "Hoàn xu 15% ngành Điện tử", discountText: "15% hoàn xu", startAt: d(-1), endAt: d(1), affiliateUrl: "https://example.com/lazada/cashback" },
    ];
  },
};
