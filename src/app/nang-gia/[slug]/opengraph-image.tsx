import { genericOgImage, OG_SIZE } from "@/lib/og";
import { raiseReport, saleBySlug, saleTitle } from "@/lib/salepages";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Tỉ lệ món tăng giá trước đợt sale";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const s = saleBySlug((await params).slug);
  if (!s) return genericOgImage("Ai nâng giá trước sale?", "Tính từ lịch sử giá Săn Deal ghi nhận");
  const t = saleTitle(s.event);
  const r = await raiseReport(s.event);
  if (r.total < 10) return genericOgImage(`Ai nâng giá trước ${t}?`, "So giá trước sale – không tin giá ảo");
  return genericOgImage(`${Math.round(r.rate * 100)}% món tăng giá trước ${t}`, `${r.raised.length}/${r.total} món Săn Deal theo dõi · xem theo shop, danh mục`);
}
