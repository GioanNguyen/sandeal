/**
 * Việc định kỳ: lấy ảnh cho món chưa có ảnh (vd món nhập từ file CSV Shopee – file không có ảnh).
 * Tra cứu từng món theo mã qua API của sàn (hiện có: Shopee Affiliate Open API – cần SHOPEE_APP_ID, SHOPEE_SECRET),
 * CHỈ cập nhật ảnh (không đổi giá, danh mục… của món). Ngoài ra tiện ích trình duyệt cũng tự bổ sung ảnh khi có người xem trang sàn.
 *
 * .env: IMAGE_FILL=0 để tắt · IMAGE_FILL_PER_RUN (mặc định 100 món mỗi lần, mỗi giờ)
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { enabledAdapters } from "@/adapters";
import { shopeeAdapter } from "@/adapters/shopee";
import type { SourceAdapter } from "@/adapters/types";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";

const HOUR = 3_600_000;
export const imageFillEnabled = () => process.env.IMAGE_FILL !== "0";

/** Nguồn tra cứu được theo mã món (bỏ dữ liệu mẫu) */
export function lookupSources(): SourceAdapter[] {
  const list: SourceAdapter[] = [];
  if (process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET) list.push(shopeeAdapter);
  for (const a of enabledAdapters()) if (a.lookup && a.name !== "mock" && !list.includes(a)) list.push(a);
  return list;
}

/** Sàn nào tra cứu ảnh được */
export const lookupPlatforms = () => new Set(lookupSources().map((a) => a.name));

// Món đã thử gần đây (không tra lại trong 24 giờ)
const g = globalThis as unknown as { __imgFillTried?: Map<number, number> };
const tried = (g.__imgFillTried ??= new Map());

export interface ImageFillResult {
  checked: number;
  filled: number;
  skipped?: string;
  errors: number;
}

export async function runFillImages(opts: { limit?: number; sources?: SourceAdapter[]; now?: Date; delayMs?: number } = {}): Promise<ImageFillResult> {
  await ensureMigrated();
  const sources = opts.sources ?? lookupSources();
  if (!sources.length) return { checked: 0, filled: 0, errors: 0, skipped: "Chưa có nguồn tra cứu theo mã (cần SHOPEE_APP_ID, SHOPEE_SECRET của Shopee Affiliate Open API)" };
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? Math.max(1, Number(process.env.IMAGE_FILL_PER_RUN ?? 100) || 100);
  const platforms = [...new Set(sources.map((s) => s.name))];
  const rows = await db
    .select({ id: products.id, platform: products.platform, externalId: products.externalId, productUrl: products.productUrl, affiliateUrl: products.affiliateUrl })
    .from(products)
    .where(and(sql`coalesce(${products.imageUrl}, '') = ''`, sql`not ${products.hidden}`, sql`${products.platform} in (${sql.join(platforms.map((p) => sql`${p}`), sql`, `)})`))
    .orderBy(desc(products.lastSeenAt))
    .limit(limit * 3);
  const todo = rows.filter((r) => (tried.get(r.id) ?? 0) < now.getTime() - 24 * HOUR).slice(0, limit);
  let filled = 0;
  let errors = 0;
  for (const r of todo) {
    tried.set(r.id, now.getTime());
    const shopId = r.productUrl?.match(/shopee\.vn\/product\/(\d+)\//)?.[1];
    const ref = { platform: r.platform as "shopee" | "lazada" | "tiktok", externalId: r.externalId, shopId, url: r.productUrl || r.affiliateUrl };
    for (const s of sources) {
      if (s.name !== r.platform || !s.lookup) continue;
      try {
        const p = await s.lookup(ref);
        if (p?.imageUrl) {
          await db
            .update(products)
            .set({ imageUrl: p.imageUrl, ...(p.images?.length ? { images: p.images.slice(0, 4) } : {}), ...(p.productUrl && !r.productUrl ? { productUrl: p.productUrl } : {}) })
            .where(and(eq(products.id, r.id), sql`coalesce(${products.imageUrl}, '') = ''`));
          filled++;
          break;
        }
      } catch {
        errors++;
      }
    }
    if (opts.delayMs ?? 300) await new Promise((res) => setTimeout(res, opts.delayMs ?? 300));
  }
  return { checked: todo.length, filled, errors };
}
