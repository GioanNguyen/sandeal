import { coverFor } from "@/lib/guide-covers";
import { findGuide } from "@/lib/guides-db";
import { siteUrl } from "@/lib/mail";
import { genericOgImage, guideCoverImage, OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Hướng dẫn săn deal";

/** Ảnh xem trước khi chia sẻ link bài hướng dẫn */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = await findGuide((await params).slug);
  if (!g) return genericOgImage("Hướng dẫn săn deal", "Mẹo mua sắm online không bị hớ");
  const c = coverFor(g);
  return guideCoverImage({ title: g.title, ...c, domain: new URL(siteUrl()).host }, "og");
}
