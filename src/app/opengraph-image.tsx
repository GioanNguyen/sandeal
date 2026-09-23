import { genericOgImage, OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Săn Deal – deal giảm thật Shopee, Lazada, TikTok Shop";

export default function Image() {
  return genericOgImage("Chỉ săn deal giảm thật", "Lịch sử giá, mã giảm giá còn hạn, so sánh 3 sàn");
}
