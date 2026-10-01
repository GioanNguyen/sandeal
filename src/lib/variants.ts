/**
 * Giá theo từng phân loại (màu, size, dung tích…).
 * API affiliate của sàn chỉ cho một mức giá (thường là phân loại rẻ nhất), nên giá từng phân loại do người dùng
 * tiện ích (đã bật "Góp giá") ghi nhận khi họ bấm chọn phân loại trên trang sản phẩm.
 * Chống dữ liệu sai giống góp giá sản phẩm (observe.ts): mỗi người mỗi phân loại 1 lần/30 phút, giá lệch > 50%
 * so với giá đang lưu cần ≥ 2 người khác nhau thấy cùng mức (±2%) trong 6 giờ.
 */
import { and, asc, countDistinct, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { priceObservations, productVariants, products, variantPricePoints } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { parseProductUrl } from "./links";
import { observerId } from "./observe";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface VariantInput {
  url: string;
  /** Các nhóm phân loại đang chọn, vd [{ group: "Màu", value: "Đen" }, { group: "Size", value: "L" }] */
  groups: { group?: string; value: string }[];
  /** Mã SKU (Lazada có trên đường dẫn -s123) */
  skuId?: string;
  price: number;
  originalPrice?: number;
}

const clip = (s: unknown, max: number) => String(s ?? "").replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Làm sạch; trả null nếu không hợp lệ */
export function cleanVariant(v: VariantInput) {
  const ref = parseProductUrl(String(v?.url ?? ""));
  if (!ref) return null;
  const groups = (Array.isArray(v.groups) ? v.groups : [])
    .slice(0, 4)
    .map((g) => ({ group: clip(g?.group, 40).replace(/:$/, ""), value: clip(g?.value, 80) }))
    .filter((g) => g.value.length >= 1);
  if (!groups.length) return null;
  const price = Math.round(Number(v.price));
  if (!Number.isFinite(price) || price < 1_000 || price > 500_000_000) return null;
  const orig = Math.round(Number(v.originalPrice));
  const originalPrice = Number.isFinite(orig) && orig > price * 1.01 && orig <= price * 5 ? orig : null;
  const skuId = /^\d{3,20}$/.test(String(v.skuId ?? "")) ? String(v.skuId) : null;
  const name = groups.map((g) => (g.group ? `${g.group}: ${g.value}` : g.value)).join(" · ");
  // Thứ tự nhóm theo tên để "Màu=Đen;Size=L" và "Size=L;Màu=Đen" là một
  const key = skuId
    ? `sku:${skuId}`
    : [...groups].sort((a, b) => fold(a.group).localeCompare(fold(b.group))).map((g) => `${fold(g.group)}=${fold(g.value)}`).join(";").slice(0, 300);
  return { ref, groups, name, key, skuId, price, originalPrice };
}

export type VariantStatus = "created" | "updated" | "same" | "pending" | "dup" | "unknown" | "invalid";

export async function recordVariantPrice(v: VariantInput, ip: string, now = new Date()): Promise<{ status: VariantStatus; variantId?: number; productId?: number }> {
  await ensureMigrated();
  const c = cleanVariant(v);
  if (!c) return { status: "invalid" };
  const [p] = await db
    .select({ id: products.id, price: products.price })
    .from(products)
    .where(and(eq(products.platform, c.ref.platform), eq(products.externalId, c.ref.externalId)))
    .limit(1);
  if (!p) return { status: "unknown" };
  // Giá phân loại phải hợp lý so với giá sản phẩm (giá sản phẩm thường là phân loại rẻ nhất)
  if (c.price < p.price * 0.5 || c.price > p.price * 20) return { status: "invalid", productId: p.id };

  const observer = observerId(ip);
  const extId = `${c.ref.externalId}#v:${c.key}`.slice(0, 400);
  const log = (status: string) => db.insert(priceObservations).values({ platform: c.ref.platform, externalId: extId, productId: null, price: c.price, observer, status, createdAt: now });

  const [recent] = await db
    .select({ id: priceObservations.id })
    .from(priceObservations)
    .where(and(eq(priceObservations.platform, c.ref.platform), eq(priceObservations.externalId, extId), eq(priceObservations.observer, observer), gte(priceObservations.createdAt, new Date(now.getTime() - 0.5 * HOUR))))
    .limit(1);

  const [existing] = await db.select().from(productVariants).where(and(eq(productVariants.productId, p.id), eq(productVariants.key, c.key))).limit(1);
  if (recent) return { status: "dup", variantId: existing?.id, productId: p.id };

  if (existing && Math.abs(c.price / existing.price - 1) > 0.5) {
    await log("pending");
    const [{ n }] = await db
      .select({ n: countDistinct(priceObservations.observer) })
      .from(priceObservations)
      .where(
        and(
          eq(priceObservations.platform, c.ref.platform),
          eq(priceObservations.externalId, extId),
          gte(priceObservations.createdAt, new Date(now.getTime() - 6 * HOUR)),
          gte(priceObservations.price, c.price * 0.98),
          lte(priceObservations.price, c.price * 1.02),
        ),
      );
    if (Number(n) < 2) return { status: "pending", variantId: existing.id, productId: p.id };
  } else {
    await log(existing ? "updated" : "created");
  }

  if (!existing) {
    const [row] = await db
      .insert(productVariants)
      .values({ productId: p.id, key: c.key, name: c.name, skuId: c.skuId, price: c.price, originalPrice: c.originalPrice, lastSeenAt: now, createdAt: now })
      .returning({ id: productVariants.id });
    await db.insert(variantPricePoints).values({ variantId: row.id, price: c.price, capturedAt: now });
    return { status: "created", variantId: row.id, productId: p.id };
  }
  const changed = existing.price !== c.price;
  await db
    .update(productVariants)
    .set({ price: c.price, originalPrice: c.originalPrice ?? existing.originalPrice, name: c.name, skuId: c.skuId ?? existing.skuId, lastSeenAt: now })
    .where(eq(productVariants.id, existing.id));
  if (changed) await db.insert(variantPricePoints).values({ variantId: existing.id, price: c.price, capturedAt: now });
  return { status: changed ? "updated" : "same", variantId: existing.id, productId: p.id };
}

export interface VariantRow {
  id: number;
  name: string;
  price: number;
  originalPrice: number | null;
  lastSeenAt: Date;
  /** Thấp nhất / cao nhất 90 ngày (gồm giá hiện tại) */
  low90: number;
  high90: number;
  /** [thời điểm ms, giá] 90 ngày cho biểu đồ nhỏ */
  history: [number, number][];
  /** Giá cập nhật quá 7 ngày: có thể đã đổi */
  stale: boolean;
}

/** Các phân loại đã ghi nhận của một món (rẻ nhất trước) */
export async function variantsFor(productId: number, now = new Date()): Promise<VariantRow[]> {
  await ensureMigrated();
  const vs = await db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.price)).limit(60);
  if (!vs.length) return [];
  const pts = await db
    .select()
    .from(variantPricePoints)
    .where(and(inArray(variantPricePoints.variantId, vs.map((v) => v.id)), gte(variantPricePoints.capturedAt, new Date(now.getTime() - 90 * DAY))))
    .orderBy(asc(variantPricePoints.capturedAt));
  return vs.map((v) => {
    const history = pts.filter((x) => x.variantId === v.id).map((x) => [x.capturedAt.getTime(), x.price] as [number, number]);
    const prices = [...history.map((h) => h[1]), v.price];
    return {
      id: v.id,
      name: v.name,
      price: v.price,
      originalPrice: v.originalPrice,
      lastSeenAt: v.lastSeenAt,
      low90: Math.min(...prices),
      high90: Math.max(...prices),
      history,
      stale: now.getTime() - v.lastSeenAt.getTime() > 7 * DAY,
    };
  });
}

export async function getVariant(id: number) {
  const [v] = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
  return v ?? null;
}

/** Phân loại vừa ghi nhận gần nhất (để tiện ích hiện "giá thấp nhất của phân loại bạn đang chọn") */
export async function variantSummary(variantId: number, now = new Date()) {
  const v = await getVariant(variantId);
  if (!v) return null;
  const row = (await variantsFor(v.productId, now)).find((x) => x.id === v.id);
  return row ? { id: row.id, name: row.name, price: row.price, low90: row.low90, points: row.history.length } : null;
}

export const latestVariants = (productId: number, limit = 5) =>
  db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(desc(productVariants.lastSeenAt)).limit(limit);
