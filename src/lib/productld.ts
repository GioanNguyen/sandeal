/**
 * Dữ liệu có cấu trúc (JSON-LD) cho trang sản phẩm.
 *
 * Săn Deal là trang SO GIÁ, không bán hàng: khai `AggregateOffer` (giá thấp nhất / cao nhất / số nơi bán) – dạng Google dành
 * cho trang so giá ("đoạn trích về sản phẩm"), thay vì `Offer` của trang bán hàng (Google sẽ đòi phí ship, chính sách đổi trả
 * của người bán – thông tin của shop, Săn Deal không biết và không được khai thay).
 * Không khai aggregateRating/review: điểm sao lấy từ sàn, Google không cho dùng đánh giá lấy từ trang khác.
 */
export const LD_NAME_MAX = 150;

/** Cắt tên còn ≤ max ký tự, ở ranh giới từ */
export function ldName(name: string, max = LD_NAME_MAX): string {
  const s = name.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–\-|/(]+$/, "")}…`;
}

export interface ProductLdInput {
  name: string;
  url: string;
  sku: string;
  images: string[];
  category?: string | null;
  description: string;
  price: number;
  /** Giá rẻ nhất của cùng món ở từng sàn (gồm cả món này) – từ bảng so sánh giá; trống nếu chỉ có 1 nơi bán */
  otherPrices?: number[];
  brand?: string | null;
  /** Món không còn thấy trên sàn: không khai giá */
  gone: boolean;
}

/**
 * null khi món đã vắng trên sàn: Google bắt buộc Product phải có offers, review hoặc aggregateRating – không khai được giá
 * (không biết chắc) thì bỏ hẳn khối Product để không bị báo lỗi nghiêm trọng.
 */
export function productJsonLd(i: ProductLdInput) {
  const others = (i.otherPrices ?? []).filter((x) => Number.isFinite(x) && x > 0);
  const prices = [i.price, ...others].filter((x) => Number.isFinite(x) && x > 0);
  if (i.gone || !prices.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: ldName(i.name),
    url: i.url,
    sku: i.sku,
    image: i.images.length ? i.images : undefined,
    category: i.category ?? undefined,
    description: i.description,
    brand: i.brand ? { "@type": "Brand", name: i.brand } : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      // otherPrices đã gồm cả món này (danh sách so sàn) thì đếm theo danh sách, không thì chỉ 1 nơi bán
      offerCount: Math.max(1, others.length),
    },
  };
}
