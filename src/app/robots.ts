import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/mail";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/go/", "/account", "/admin", "/auth/", "/login", "/unsubscribe"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
