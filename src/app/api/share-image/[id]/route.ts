import { getProduct } from "@/lib/queries";
import { productSquareImage } from "@/lib/og";
import { siteUrl } from "@/lib/mail";
import { timeWeightedMedian } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ảnh vuông kèm giá & biểu đồ để người dùng chia sẻ (nút "Chia sẻ ảnh giá" trên trang sản phẩm) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getProduct(Number((await params).id));
  if (!p) return new Response("Không tìm thấy", { status: 404 });
  // Cùng cách tính "giá thường ngày" với thẻ deal: suy từ mức giảm thật đã lưu
  const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.prices.length ? timeWeightedMedian(p.prices, new Date()) : p.price;
  const low = Math.min(p.price, ...p.prices.map((x) => x.price));
  const res = await productSquareImage({
    ...p,
    usual,
    low,
    at: p.lastSeenAt,
    domain: new URL(siteUrl()).host,
    history: p.prices.slice(-60).map((x) => x.price),
  });
  res.headers.set("Cache-Control", "public, max-age=600");
  res.headers.set("Content-Disposition", `inline; filename="san-deal-${p.id}.png"`);
  return res;
}
