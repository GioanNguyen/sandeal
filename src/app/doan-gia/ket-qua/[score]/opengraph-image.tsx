import { genericOgImage, OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Kết quả Đoán giá deal";

export default async function Image({ params }: { params: Promise<{ score: string }> }) {
  const s = Math.max(0, Math.min(5, Number.parseInt((await params).score, 10) || 0));
  return genericOgImage(`Mình đoán đúng ${s}/5 giá deal!`, "Bạn được mấy điểm? Chơi Đoán giá trên Săn Deal");
}
