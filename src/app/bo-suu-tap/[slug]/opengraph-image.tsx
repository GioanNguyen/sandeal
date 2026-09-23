import { collectionBySlug } from "@/lib/collections";
import { genericOgImage, OG_SIZE } from "@/lib/og";
import { listDeals } from "@/lib/queries";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Bộ sưu tập deal trên Săn Deal";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const c = collectionBySlug((await params).slug);
  if (!c) return genericOgImage("Bộ sưu tập deal", "Deal giảm thật theo chủ đề");
  const { total } = await listDeals({ ...c.filter, pageSize: 1 });
  return genericOgImage(c.title, `${total} deal đang giảm thật · cập nhật liên tục`);
}
