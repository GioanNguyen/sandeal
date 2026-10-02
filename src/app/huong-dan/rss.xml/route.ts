import { guidePublishAt, publishedGuides } from "@/lib/guides";
import { siteUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Nguồn tin RSS các bài hướng dẫn (Google, ứng dụng đọc tin và các công cụ tự đăng bài đọc được) */
export function GET() {
  const site = siteUrl();
  const items = publishedGuides()
    .slice(0, 30)
    .map((g) => {
      const url = `${site}/huong-dan/${g.slug}`;
      return `<item><title>${esc(g.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${guidePublishAt(g).toUTCString()}</pubDate><description>${esc(g.description)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Săn Deal – Hướng dẫn săn deal</title><link>${site}/huong-dan</link><atom:link href="${site}/huong-dan/rss.xml" rel="self" type="application/rss+xml"/><description>Mẹo mua sắm online trên Shopee, Lazada, TikTok Shop. Bài mới mỗi tuần.</description><language>vi</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
