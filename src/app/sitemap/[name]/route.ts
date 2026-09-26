import { sitemapUrls, urlsetXml } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const urls = await sitemapUrls((await params).name);
  if (!urls) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(urls), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
