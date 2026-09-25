import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/mail";

// Đọc SITE_URL lúc chạy (không đóng cứng giá trị lúc build)
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/go/", "/account", "/admin", "/auth/", "/login", "/unsubscribe"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
