import { siteUrl } from "@/lib/mail";
import { indexXml, sitemapFiles } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";

/** Mục lục sitemap: trỏ tới các file con theo loại trang */
export async function GET() {
  const base = siteUrl();
  const files = await sitemapFiles();
  return new Response(indexXml(files.map((f) => ({ loc: `${base}/sitemap/${f.name}`, lastmod: f.lastmod }))), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
