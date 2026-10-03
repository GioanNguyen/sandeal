import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { enabledAdapters } from "@/adapters";
import { productRequests, products, type Product } from "@/db/schema";
import { platformLatest, staleCutoff } from "./availability";
import { upsertProduct } from "./ingest";
import { db, ensureMigrated } from "./db";
import { refFromInput, type ProductRef } from "./links";

export type CheckResult =
  | { status: "found"; productId: number; isNew: boolean }
  | { status: "queued"; ref: ProductRef }
  | { status: "invalid" };

async function tryAdapters(ref: ProductRef, opts: { restockCutoff?: Date | null; skipMock?: boolean } = {}): Promise<number | null> {
  for (const a of enabledAdapters()) {
    if (!a.lookup || (opts.skipMock && a.name === "mock")) continue;
    try {
      const p = await a.lookup(ref);
      if (p) return await upsertProduct(p, new Date(), { restockCutoff: opts.restockCutoff });
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

/**
 * Worker: kiểm tra lại từng món đã hơn 1 ngày không thấy trong nguồn deal nhưng có người quan tâm
 * (đang theo dõi, hoặc được xem trong 7 ngày). Nguồn deal chỉ trả về món đang nổi, nên một món vắng mặt
 * chưa chắc đã hết hàng – tra cứu trực tiếp theo mã để biết món còn bán hay không và cập nhật giá.
 */
export async function refreshMissing(limit = 40, now = new Date()): Promise<number> {
  const rows = (await db
    .select()
    .from(products)
    .where(
      and(
        sql`${products.lastSeenAt} < (select max(p2.last_seen_at) from products p2 where p2.platform = ${products.platform}) - interval '1 day'`,
        sql`(exists (select 1 from watches w where w.product_id = ${products.id})
          or exists (select 1 from product_views v where v.product_id = ${products.id} and v.created_at >= ${new Date(now.getTime() - 7 * 86_400_000)}))`,
      ),
    )
    .orderBy(desc(products.lastSeenAt))
    .limit(limit)) as Product[];
  if (!rows.length) return 0;
  const latest = await platformLatest();
  let found = 0;
  for (const p of rows) {
    const id = await tryAdapters(
      { platform: p.platform as ProductRef["platform"], externalId: p.externalId, url: p.affiliateUrl },
      // Dữ liệu mẫu không phải sàn thật: không dùng để "xác nhận" món còn bán
      { restockCutoff: staleCutoff(latest.get(p.platform)), skipMock: true },
    );
    if (id) found++;
  }
  return found;
}

/**
 * Quản trị viên bấm "Kiểm tra lại" 1 món: tra cứu trực tiếp trên sàn theo mã, cập nhật giá / lần thấy cuối.
 * Trả về false khi nguồn không tìm thấy món (có thể đã ngừng bán) hoặc chưa có nguồn nào hỗ trợ tra cứu theo mã.
 */
export async function recheckProduct(id: number): Promise<{ found: boolean; product?: Product }> {
  await ensureMigrated();
  const [p] = (await db.select().from(products).where(eq(products.id, id)).limit(1)) as Product[];
  if (!p) return { found: false };
  const latest = await platformLatest();
  const got = await tryAdapters(
    { platform: p.platform as ProductRef["platform"], externalId: p.externalId, url: p.affiliateUrl },
    { restockCutoff: staleCutoff(latest.get(p.platform)), skipMock: true },
  );
  if (!got) return { found: false, product: p };
  const [fresh] = (await db.select().from(products).where(eq(products.id, id)).limit(1)) as Product[];
  return { found: true, product: fresh };
}
