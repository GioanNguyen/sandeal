import { genericOgImage, OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Đoán giá deal hôm nay – Săn Deal";

export default function Image() {
  return genericOgImage("Bạn đoán được giá sale không?", "5 câu mỗi ngày · rủ bạn bè so điểm");
}
