import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { enabledAdapters } from "@/adapters";
import { productRequests, products } from "@/db/schema";
import { upsertProduct } from "./ingest";
import { db, ensureMigrated } from "./db";
import { refFromInput, type ProductRef } from "./links";

export type CheckResult =
  | { status: "found"; productId: number; isNew: boolean }
  | { status: "queued"; ref: ProductRef }
  | { status: "invalid" };

async function tryAdapters(ref: ProductRef): Promise<number | null> {
  for (const a of enabledAdapters()) {
    if (!a.lookup) continue;
    try {
      const p = await a.lookup(ref);
      if (p) return await upsertProduct(p);
    } catch (err) {
      console.warn(`[lookup] ${a.name} lỗi:`, (err as Error).message);
    }
  }
  return null;
}

/** Người dùng dán link: tìm trong DB, không có thì tra cứu qua API, vẫn không có thì xếp hàng chờ. */
export async function checkLink(input: string): Promise<CheckResult> {
  await ensureMigrated();
  const ref = await refFromInput(input);
  if (!ref) return { status: "invalid" };

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.platform, ref.platform), eq(products.externalId, ref.externalId)))
    .limit(1);
  if (existing) return { status: "found", productId: existing.id, isNew: false };

  const id = await tryAdapters(ref);
  if (id) return { status: "found", productId: id, isNew: true };

  await db
    .insert(productRequests)
    .values({ platform: ref.platform, externalId: ref.externalId, shopId: ref.shopId ?? null, url: ref.url })
    .onConflictDoUpdate({
      target: [productRequests.platform, productRequests.externalId],
      set: { count: sql`${productRequests.count} + 1`, updatedAt: new Date() },
    });
  return { status: "queued", ref };
}

/** Worker: thử tra cứu lại các link đang chờ (tối đa 10 lần mỗi link) */
export async function retryProductRequests(limit = 50): Promise<number> {
  const pending = await db
    .select()
    .from(productRequests)
    .where(and(isNull(productRequests.productId), lt(productRequests.attempts, 10)))
    .limit(limit);
  let resolved = 0;
  for (const r of pending) {
    const id = await tryAdapters({ platform: r.platform as ProductRef["platform"], externalId: r.externalId, shopId: r.shopId ?? undefined, url: r.url });
    await db
      .update(productRequests)
      .set({ attempts: r.attempts + 1, productId: id, updatedAt: new Date() })
      .where(eq(productRequests.id, r.id));
    if (id) resolved++;
  }
  return resolved;
}
