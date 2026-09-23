import { getProduct } from "@/lib/queries";
import { genericOgImage, OG_SIZE, productOgImage } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Giá và lịch sử giá sản phẩm trên Săn Deal";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProduct(Number((await params).id));
  if (!p) return genericOgImage("Deal giảm thật", "Lịch sử giá Shopee, Lazada, TikTok Shop");
  return productOgImage({ ...p, history: p.prices.slice(-40).map((x) => x.price) });
}
