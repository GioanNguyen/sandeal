import { getCurrentUser, isAdmin } from "@/lib/auth";
import { coverFor } from "@/lib/guide-covers";
import { findGuide } from "@/lib/guides-db";
import { siteUrl } from "@/lib/mail";
import { guideCoverImage } from "@/lib/og";

export const runtime = "nodejs";

/**
 * Ảnh bìa bài hướng dẫn: /huong-dan/<slug>/anh-bia (ảnh dọc 4:5 đăng Facebook), ?kieu=og cho ảnh ngang 1200×630.
 * Bài chưa tới ngày đăng chỉ quản trị viên xem được (để duyệt trước).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  let g = await findGuide(slug);
  let preview = false;
  if (!g) {
    const u = await getCurrentUser();
    if (u && isAdmin(u.email)) {
      g = await findGuide(slug, new Date(), true);
      preview = true;
    }
  }
  if (!g) return new Response("Không có bài này", { status: 404 });
  const kind = new URL(req.url).searchParams.get("kieu") === "og" ? "og" : "fb";
  const c = coverFor(g);
  const img = await guideCoverImage({ title: g.title, ...c, domain: new URL(siteUrl()).host }, kind);
  img.headers.set("cache-control", preview ? "private, no-store" : "public, max-age=3600, s-maxage=86400");
  return img;
}
