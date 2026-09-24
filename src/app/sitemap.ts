import { roundupDefs } from "@/lib/roundups";
import { productPath } from "@/lib/slug";
import type { MetadataRoute } from "next";
import { desc } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { listCategories } from "@/lib/queries";
import { COLLECTIONS } from "@/lib/collections";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureMigrated();
  const base = siteUrl();
  const [cats, prods, tops] = await Promise.all([
    listCategories(),
    db.select({ id: products.id, name: products.name, at: products.lastSeenAt }).from(products).orderBy(desc(products.dealScore)).limit(5000),
    roundupDefs(),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/vouchers`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/cach-hoat-dong`, changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${base}/bo-suu-tap`, changeFrequency: "daily" as const, priority: 0.8 },
    ...COLLECTIONS.map((c) => ({ url: `${base}/bo-suu-tap/${c.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    { url: `${base}/top`, changeFrequency: "daily" as const, priority: 0.8 },
    ...tops.map((t) => ({ url: `${base}/top/${t.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...cats.map((c) => ({ url: `${base}/danh-muc/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...prods.map((p) => ({ url: `${base}${productPath(p)}`, lastModified: p.at, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
