import type { MetadataRoute } from "next";
import { desc } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { listCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureMigrated();
  const base = siteUrl();
  const [cats, prods] = await Promise.all([
    listCategories(),
    db.select({ id: products.id, at: products.lastSeenAt }).from(products).orderBy(desc(products.dealScore)).limit(5000),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/vouchers`, changeFrequency: "hourly", priority: 0.9 },
    ...cats.map((c) => ({ url: `${base}/danh-muc/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...prods.map((p) => ({ url: `${base}/product/${p.id}`, lastModified: p.at, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
