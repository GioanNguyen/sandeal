/**
 * Giá người dùng tiện ích nhìn thấy trên trang sản phẩm (chỉ khi họ bật "Góp giá").
 * Nguyên tắc:
 *  - Chỉ nhận dữ liệu công khai trên trang: tên, giá, ảnh, điểm đánh giá. Không nhận gì về người dùng;
 *    IP chỉ dùng dưới dạng băm để đếm số người quan sát khác nhau.
 *  - Không đè giá từ nguồn API còn mới (≤ 24 giờ).
 *  - Giá lệch quá 50% so với giá đang lưu cần ≥ 2 người quan sát khác nhau thấy cùng mức (±2%) trong 6 giờ.
 *  - Mỗi người, mỗi sản phẩm tối đa 1 lần ghi mỗi 30 phút.
 */
import { createHash } from "node:crypto";
import { and, countDistinct, eq, gte, lte } from "drizzle-orm";
import type { ProductInput } from "@/adapters/types";
import { priceObservations, productRequests, products, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { upsertProduct } from "./ingest";
import { parseProductUrl } from "./links";

const HOUR = 3_600_000;

export interface Observation {
  url: string;
  name?: string;
  price: number;
  image?: string;
  rating?: number;
}

export type ObserveStatus = "created" | "updated" | "ignored" | "pending" | "dup" | "invalid";

/** Máy chủ ảnh hợp lệ của từng sàn (ảnh khác bị bỏ, tránh chèn ảnh lạ) */
const IMAGE_HOSTS: Record<string, RegExp> = {
  shopee: /(^|\.)(susercontent\.com|shopee\.vn|shopeemobile\.com)$/,
  lazada: /(^|\.)(lazcdn\.com|slatic\.net|alicdn\.com)$/,
  tiktok: /(^|\.)(ibyteimg\.com|tiktokcdn\.com|tiktokcdn-us\.com|byteimg\.com)$/,
};

export function observerId(ip: string) {
  return createHash("sha256").update(`${process.env.AUTH_SECRET || "dev"}|obs|${ip}`).digest("hex").slice(0, 32);
}

/** Làm sạch dữ liệu gửi lên; không hợp lệ thì null */
export function cleanObservation(o: Observation) {
  const ref = parseProductUrl(String(o.url ?? ""));
  if (!ref) return null;
  const price = Math.round(Number(o.price));
  if (!Number.isFinite(price) || price < 1_000 || price > 500_000_000) return null;
  const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  let image: string | undefined;
  try {
    const u = new URL(String(o.image ?? ""));
    if (u.protocol === "https:" && IMAGE_HOSTS[ref.platform].test(u.hostname)) image = u.toString();
  } catch {}
  const rating = Number(o.rating);
  return { ref, price, name: name.length >= 3 ? name : null, image, rating: rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : undefined };
}

export async function recordObservation(o: Observation, ip: string, now = new Date()): Promise<{ status: ObserveStatus; productId?: number }> {
  await ensureMigrated();
  const c = cleanObservation(o);
  if (!c) return { status: "invalid" };
  const { ref, price } = c;
  const observer = observerId(ip);
  const [existing] = (await db
    .select()
    .from(products)
    .where(and(eq(products.platform, ref.platform), eq(products.externalId, ref.externalId)))
    .limit(1)) as Product[];

  const log = (status: ObserveStatus, productId?: number | null) =>
    db.insert(priceObservations).values({ platform: ref.platform, externalId: ref.externalId, productId: productId ?? null, price, observer, status, createdAt: now });

  // Cùng người, cùng món trong 30 phút: bỏ qua
  const [recent] = await db
    .select({ id: priceObservations.id })
    .from(priceObservations)
    .where(and(eq(priceObservations.platform, ref.platform), eq(priceObservations.externalId, ref.externalId), eq(priceObservations.observer, observer), gte(priceObservations.createdAt, new Date(now.getTime() - 0.5 * HOUR))))
    .limit(1);
  if (recent) return { status: "dup", productId: existing?.id };

  if (!existing) {
    if (!c.name) {
      await log("invalid");
      return { status: "invalid" };
    }
    const input: ProductInput = {
      platform: ref.platform,
      externalId: ref.externalId,
      name: c.name,
      imageUrl: c.image,
      price,
      discountPct: 0,
      rating: c.rating,
      affiliateUrl: ref.url,
    };
    const id = await upsertProduct(input, now, { priceSource: "ext" });
    await log("created", id);
    // Link người dùng từng dán mà chưa tra được: nay đã có dữ liệu
    await db.update(productRequests).set({ productId: id, updatedAt: now }).where(and(eq(productRequests.platform, ref.platform), eq(productRequests.externalId, ref.externalId)));
    return { status: "created", productId: id };
  }

  // Nguồn API còn mới: giữ nguyên, chỉ ghi lại để đối chiếu
  if (existing.priceSource !== "ext" && now.getTime() - existing.lastSeenAt.getTime() < 24 * HOUR) {
    await log("ignored", existing.id);
    return { status: "ignored", productId: existing.id };
  }

  const jump = Math.abs(price / existing.price - 1) > 0.5;
  if (jump) {
    await log("pending", existing.id);
    const [{ n }] = await db
      .select({ n: countDistinct(priceObservations.observer) })
      .from(priceObservations)
      .where(
        and(
          eq(priceObservations.productId, existing.id),
          gte(priceObservations.createdAt, new Date(now.getTime() - 6 * HOUR)),
          gte(priceObservations.price, price * 0.98),
          lte(priceObservations.price, price * 1.02),
        ),
      );
    if (Number(n) < 2) return { status: "pending", productId: existing.id };
  }

  // Áp giá mới, giữ nguyên các thông tin khác của sản phẩm (link tiếp thị, danh mục, shop…)
  const isExt = existing.priceSource === "ext";
  await upsertProduct(
    {
      platform: ref.platform,
      externalId: ref.externalId,
      name: isExt && c.name ? c.name : existing.name,
      imageUrl: (isExt && c.image) || existing.imageUrl || undefined,
      images: existing.images ?? undefined,
      shopName: existing.shopName ?? undefined,
      shopType: (existing.shopType as ProductInput["shopType"]) ?? undefined,
      shopRating: existing.shopRating ?? undefined,
      category: existing.category ?? undefined,
      price,
      originalPrice: existing.originalPrice ?? undefined,
      discountPct: existing.originalPrice && existing.originalPrice > price ? Math.round((1 - price / existing.originalPrice) * 100) : 0,
      rating: c.rating ?? existing.rating ?? undefined,
      sold: existing.sold ?? undefined,
      commissionRate: existing.commissionRate ?? undefined,
      affiliateUrl: existing.affiliateUrl,
    },
    now,
    // Giá hiện tại đến từ người dùng -> nguồn "ext" (lần đồng bộ API sau sẽ đổi lại "api").
    // Không để 1 lượt xem làm "mới" mốc đồng bộ của cả sàn (xem availability.ts).
    { priceSource: "ext" },
  );
  if (!jump) await log("updated", existing.id);
  else await db.update(priceObservations).set({ status: "updated" }).where(and(eq(priceObservations.productId, existing.id), eq(priceObservations.observer, observer), eq(priceObservations.createdAt, now)));
  return { status: "updated", productId: existing.id };
}
