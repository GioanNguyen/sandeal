import type { ConversionInput, Platform, ProductInput, SourceAdapter, VoucherInput } from "./types";

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
        shopType: fixed() < 0.45 ? "mall" : fixed() < 0.6 ? "preferred" : undefined,
        shopRating: Math.round((4.3 + fixed() * 0.7) * 10) / 10,
        imageUrl: `https://picsum.photos/seed/sandeal${i}/400/400`,
        images: [`https://picsum.photos/seed/sandeal${i}b/400/400`],
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
  /** Dữ liệu mẫu: tạo sản phẩm giả cho mọi link hợp lệ để thử tính năng dán link */
  async lookup(ref) {
    const r = rng([...ref.externalId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 100000);
    const [name, category, base] = CATALOG[Math.floor(r() * CATALOG.length)];
    const discountPct = Math.round(r() * 40);
    const listPrice = Math.round((base * (0.9 + r() * 0.3)) / 1000) * 1000;
    return {
      platform: ref.platform,
      externalId: ref.externalId,
      name: `${name} (dữ liệu mẫu #${ref.externalId.slice(-4)})`,
      category,
      shopName: "Shop mẫu",
      imageUrl: `https://picsum.photos/seed/sandeal-${ref.externalId}/400/400`,
      price: Math.round((listPrice * (1 - discountPct / 100)) / 1000) * 1000,
      originalPrice: listPrice,
      discountPct,
      rating: Math.round((3.8 + r() * 1.2) * 10) / 10,
      sold: Math.round(r() * 5000),
      affiliateUrl: ref.url,
    };
  },
  async fetchProducts() {
    return mockProducts();
  },
  async fetchVouchers(): Promise<VoucherInput[]> {
    const now = Date.now();
    const d = (days: number) => new Date(now + days * 86_400_000);
    const hrs = (h: number) => new Date(now + h * 3_600_000);
    return [
      { source: "mock", externalId: "v1", platform: "shopee", code: "SHOPEE50K", title: "Giảm 50K đơn từ 300K", discountText: "50.000đ", minSpend: 300_000, startAt: d(-1), endAt: d(3), affiliateUrl: "https://example.com/shopee/voucher" },
      { source: "mock", externalId: "v2", platform: "shopee", title: "Freeship Xtra toàn quốc", discountText: "Freeship", minSpend: 0, startAt: d(-2), endAt: d(5), affiliateUrl: "https://example.com/shopee/freeship" },
      { source: "mock", externalId: "v3", platform: "lazada", code: "LAZ10", title: "Giảm 10% tối đa 100K", discountText: "10%", minSpend: 200_000, startAt: d(0), endAt: d(2), affiliateUrl: "https://example.com/lazada/voucher" },
      { source: "mock", externalId: "v4", platform: "tiktok", code: "TTS30K", title: "Giảm 30K cho đơn đầu tiên", discountText: "30.000đ", minSpend: 99_000, startAt: d(-3), endAt: d(10), affiliateUrl: "https://example.com/tiktok/voucher" },
      { source: "mock", externalId: "v6", platform: "shopee", code: "FLASH15", title: "Flash: giảm 15% tối đa 60K", discountText: "15%", minSpend: 150_000, startAt: hrs(-5), endAt: hrs(0.75), affiliateUrl: "https://example.com/shopee/flash" },
      { source: "mock", externalId: "v7", platform: "tiktok", code: "TTSLIVE", title: "Giảm 40K khung giờ live", discountText: "40.000đ", minSpend: 250_000, startAt: hrs(-3), endAt: hrs(2.5), affiliateUrl: "https://example.com/tiktok/live" },
      { source: "mock", externalId: "v5", platform: "lazada", title: "Hoàn xu 15% ngành Điện tử", discountText: "15% hoàn xu", startAt: d(-1), endAt: d(1), affiliateUrl: "https://example.com/lazada/cashback" },
    ];
  },
  async fetchConversions(since: Date): Promise<ConversionInput[]> {
    // Đơn hàng giả lập ổn định theo ngày để thử trang thống kê
    const out: ConversionInput[] = [];
    const days = Math.ceil((Date.now() - since.getTime()) / 86_400_000);
    for (let d = 0; d < days; d++) {
      const r = rng(d * 97 + 13);
      const n = Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const amount = Math.round((150_000 + r() * 1_500_000) / 1000) * 1000;
        const rate = 0.03 + r() * 0.07;
        const platform = PLATFORMS[Math.floor(r() * 3)];
        const status = d < 7 ? "pending" : r() < 0.1 ? "cancelled" : "completed";
        out.push({
          source: "mock",
          externalId: `mock-${d}-${k}`,
          platform,
          orderAmount: amount,
          commission: status === "cancelled" ? 0 : Math.round(amount * rate),
          status,
          purchasedAt: new Date(Date.now() - d * 86_400_000 - r() * 80_000_000),
        });
      }
    }
    return out;
  },
};
