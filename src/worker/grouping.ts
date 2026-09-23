import { gte, inArray, isNotNull } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "@/lib/db";
import { groupItems } from "@/lib/match";

/** Gom nhóm sản phẩm giống nhau giữa các sàn (chạy sau mỗi lần đồng bộ). Trả về số nhóm. */
export async function groupProducts(now = new Date()): Promise<number> {
  const items = await db
    .select({ id: products.id, platform: products.platform, name: products.name })
    .from(products)
    .where(gte(products.lastSeenAt, new Date(now.getTime() - 14 * 86_400_000)));
  const map = groupItems(items);
  const byKey = new Map<string, number[]>();
  for (const [id, key] of map) (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(id);

  await db.transaction(async (tx) => {
    await tx.update(products).set({ groupKey: null }).where(isNotNull(products.groupKey));
    for (const [key, ids] of byKey) await tx.update(products).set({ groupKey: key }).where(inArray(products.id, ids));
  });
  return byKey.size;
}

