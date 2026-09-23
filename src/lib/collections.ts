import type { DealFilter } from "./queries";

/** Bộ sưu tập theo chủ đề: chỉ là bộ lọc có sẵn, dữ liệu vẫn là deal thật đang có */
export interface Collection {
  slug: string;
  title: string;
  description: string;
  icon: "sparkles" | "calendar" | "flame" | "tag" | "scale" | "ticket";
  filter: DealFilter;
  /** Theo mùa: [tháng-ngày bắt đầu, tháng-ngày kết thúc] (MM-DD, giờ VN) */
  season?: [string, string];
}

export const COLLECTIONS: Collection[] = [
  {
    slug: "qua-tang-20-10",
    title: "Quà tặng 20/10 giảm thật",
    description: "Mỹ phẩm, đồng hồ, tai nghe, bình giữ nhiệt… đang rẻ hơn thường ngày, kịp tặng dịp 20/10.",
    icon: "sparkles",
    filter: { keywords: ["serum", "kem", "đồng hồ", "tai nghe", "bình giữ nhiệt", "son", "nước hoa"], minDrop: 5, sort: "drop" },
    season: ["09-20", "10-20"],
  },
  {
    slug: "chuan-bi-11-11",
    title: "Chuẩn bị săn 11.11",
    description: "Món đang giảm sâu nhất, theo dõi trước để biết 11.11 có rẻ hơn thật không.",
    icon: "calendar",
    filter: { minDrop: 20, sort: "drop" },
    season: ["10-12", "11-11"],
  },
  {
    slug: "do-cong-nghe-duoi-500k",
    title: "Đồ công nghệ dưới 500K",
    description: "Tai nghe, chuột, sạc dự phòng… giá dưới 500.000đ, xếp theo điểm deal.",
    icon: "flame",
    filter: { categories: ["Điện tử"], maxPrice: 500_000 },
  },
  {
    slug: "lam-dep-duoi-200k",
    title: "Làm đẹp dưới 200K",
    description: "Skincare, dầu gội, kem chống nắng giá dưới 200.000đ đang giảm thật.",
    icon: "sparkles",
    filter: { categories: ["Làm đẹp"], maxPrice: 200_000 },
  },
  {
    slug: "gia-dung-giam-sau",
    title: "Gia dụng giảm sâu",
    description: "Nồi chiên, máy hút bụi, máy lọc không khí đang rẻ hơn thường ngày từ 15%.",
    icon: "tag",
    filter: { categories: ["Gia dụng"], minDrop: 15, sort: "drop" },
  },
  {
    slug: "thoi-trang-giam-30",
    title: "Thời trang giảm thật từ 30%",
    description: "Giày, balo, áo khoác đang rẻ hơn giá thường ngày ít nhất 30%.",
    icon: "ticket",
    filter: { categories: ["Thời trang"], minDrop: 30, sort: "drop" },
  },
];

const mmdd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(5, 10);

export function isInSeason(c: Collection, now = new Date()) {
  if (!c.season) return true;
  const t = mmdd(now);
  const [a, b] = c.season;
  return a <= b ? t >= a && t <= b : t >= a || t <= b;
}

/** Bộ sưu tập hiển thị: đang vào mùa trước, rồi các bộ quanh năm */
export function activeCollections(now = new Date()) {
  return COLLECTIONS.filter((c) => isInSeason(c, now)).sort((a, b) => Number(!!b.season) - Number(!!a.season));
}

export const collectionBySlug = (slug: string) => COLLECTIONS.find((c) => c.slug === slug);

export const PRICE_BANDS = [
  { max: 99_000, label: "Dưới 99K" },
  { max: 199_000, label: "Dưới 199K" },
  { max: 499_000, label: "Dưới 499K" },
  { max: 999_000, label: "Dưới 999K" },
];
