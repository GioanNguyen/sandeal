import { genericOgImage, listOgImage, OG_SIZE } from "@/lib/og";
import { getList } from "@/lib/play";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Danh sách deal chia sẻ trên Săn Deal";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const l = await getList((await params).slug);
  if (!l) return genericOgImage("Danh sách deal", "Deal giảm thật Shopee, Lazada, TikTok Shop");
  return listOgImage(l.title, l.items);
}
