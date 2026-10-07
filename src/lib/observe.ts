/**
 * Giá người dùng tiện ích nhìn thấy trên trang sản phẩm (chỉ khi họ bật "Góp giá").
 * Nguyên tắc:
 *  - Chỉ nhận dữ liệu công khai trên trang: tên, giá, giá gạch ngang, ảnh, điểm đánh giá, danh mục.
 *  - Ảnh, ảnh phụ, danh mục, giá gốc chỉ bổ sung khi món còn thiếu; số sao cập nhật theo lần xem mới nhất. Không nhận gì về người dùng;
 *    IP chỉ dùng dưới dạng băm để đếm số người quan sát khác nhau.
 *  - Không đè giá từ nguồn API còn mới (≤ 24 giờ).
 *  - Giá lệch quá 50% so với giá đang lưu cần ≥ 2 người quan sát khác nhau thấy cùng mức (±2%) trong 6 giờ.
 *  - Mỗi người, mỗi sản phẩm tối đa 1 lần ghi mỗi 30 phút.
 *  - Giá gạch (giá gốc) chỉ ghi khi món CHƯA có giá gốc; đã có thì giữ nguyên, lần góp sau không cập nhật.
 */
import { createHash } from "node:crypto";
import { and, countDistinct, eq, gte, lte, ne } from "drizzle-orm";
import type { ProductInput } from "@/adapters/types";
import { priceObservations, productRequests, products, type Product } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { upsertProduct } from "./ingest";
import { parseProductUrl } from "./links";

const HOUR = 3_600_000;
const pct = (price: number, original: number) => Math.round((1 - price / original) * 100);

export interface Observation {
  url: string;
  name?: string;
  price: number;
  image?: string;
  rating?: number;
  /** Giá gạch ngang hiển thị cạnh giá bán */
  originalPrice?: number;
  /** Ảnh phụ (không gồm ảnh chính) */
  images?: string[];
  /** Danh mục cấp 1 trên sàn */
  category?: string;
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
  const okImage = (raw: unknown) => {
    try {
      const u = new URL(String(raw ?? ""));
      if (u.protocol === "https:" && IMAGE_HOSTS[ref.platform].test(u.hostname)) return u.toString();
    } catch {}
    return undefined;
  };
  const image = okImage(o.image);
  const images = (Array.isArray(o.images) ? o.images : []).map(okImage).filter((u): u is string => !!u && u !== image).slice(0, 4);
  const cat = typeof o.category === "string" ? o.category.replace(/\s+/g, " ").trim() : "";
  const category = cat.length >= 2 && cat.length <= 60 && !/[<>{}]|https?:/i.test(cat) ? cat : undefined;
  const rating = Number(o.rating);
  // Giá gốc hợp lệ: lớn hơn giá bán, giảm không quá 80%
  const orig = Math.round(Number(o.originalPrice));
  const originalPrice = Number.isFinite(orig) && orig > price * 1.01 && orig <= price * 5 ? orig : undefined;
  return { ref, price, name: name.length >= 3 ? name : null, image, rating: rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : undefined, originalPrice, images: images.length ? images : undefined, category };
}

async function nameTakenElsewhere(platform: string, name: string, externalId: string) {
  const [x] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.platform, platform), eq(products.name, name), ne(products.externalId, externalId)))
    .limit(1);
  return !!x;
}

/** Link sản phẩm mở được thật: Shopee cần mã shop (link /product/0/… không mở đúng trang) */
const hasShopId = (ref: { platform: string; url: string }) => ref.platform !== "shopee" || /\/product\/[1-9]\d*\/\d+/.test(ref.url);

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

  // Món chưa có link sản phẩm (vd. nhập CSV chỉ có link affiliate s.shopee.vn): trang vừa mở chính là trang sản phẩm
  // của món này (cùng mã) -> lưu lại link để lần sau mở thẳng trang sản phẩm, không phải tìm trên sàn
  if (existing && !/^https:\/\//i.test(existing.productUrl ?? "") && hasShopId(ref)) {
    await db.update(products).set({ productUrl: ref.url }).where(eq(products.id, existing.id));
    existing.productUrl = ref.url;
  }

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
    // Tên trùng hẳn một món khác của cùng sàn: nhiều khả năng tiện ích đọc phải dữ liệu còn sót của trang trước
    // (trang một-trang). Không tạo món mới để tránh gán nhầm tên/giá.
    const [same] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.platform, ref.platform), eq(products.name, c.name), ne(products.externalId, ref.externalId)))
      .limit(1);
    if (same) {
      await log("invalid");
      return { status: "invalid" };
    }
    const input: ProductInput = {
      platform: ref.platform,
      externalId: ref.externalId,
      name: c.name,
      imageUrl: c.image,
      images: c.images,
      category: c.category,
      price,
      originalPrice: c.originalPrice,
      discountPct: c.originalPrice ? pct(price, c.originalPrice) : 0,
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
    // Món nhập từ file CSV chưa có ảnh / giá gốc: bổ sung từ trang sản phẩm (giá gốc chỉ khi giá người dùng thấy
    // khớp giá đang lưu ±2%, để giá gạch đúng với giá bán)
    const fill: Partial<Product> = {};
    if (!existing.imageUrl && c.image) fill.imageUrl = c.image;
    if (!existing.images?.length && c.images) fill.images = c.images;
    if (!existing.category && c.category) fill.category = c.category;
    if (c.rating && c.rating !== existing.rating) fill.rating = c.rating;
    if (!existing.originalPrice && c.originalPrice && c.originalPrice > existing.price && Math.abs(price / existing.price - 1) <= 0.02) {
      fill.originalPrice = c.originalPrice;
      fill.discountPct = pct(existing.price, c.originalPrice);
    }
    if (Object.keys(fill).length) await db.update(products).set(fill).where(eq(products.id, existing.id));
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
      // Tên chỉ cập nhật cho món nguồn "ext", và không đổi sang tên đang thuộc về món khác
      name: isExt && c.name && !(await nameTakenElsewhere(ref.platform, c.name, ref.externalId)) ? c.name : existing.name,
      imageUrl: (isExt && c.image) || existing.imageUrl || c.image || undefined,
      images: existing.images ?? c.images ?? undefined,
      shopName: existing.shopName ?? undefined,
      shopType: (existing.shopType as ProductInput["shopType"]) ?? undefined,
      shopRating: existing.shopRating ?? undefined,
      category: existing.category ?? c.category ?? undefined,
      price,
      // Giá gốc đã có thì giữ nguyên; chưa có thì lấy giá gạch người dùng thấy
      originalPrice: existing.originalPrice ?? c.originalPrice ?? undefined,
      discountPct: (() => {
        const o = existing.originalPrice ?? c.originalPrice;
        return o && o > price ? pct(price, o) : 0;
      })(),
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
