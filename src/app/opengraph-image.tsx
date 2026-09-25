import { homeOgImage, OG_SIZE } from "@/lib/og";
import { siteUrl } from "@/lib/mail";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Săn Deal – săn deal giảm thật Shopee, Lazada, TikTok Shop";
// Ảnh tĩnh, vẽ sẵn lúc build (tên miền lấy từ SITE_URL lúc build: make-release/vps-update đều đặt sẵn)

export default function Image() {
  return homeOgImage(new URL(siteUrl()).host);
}
