/**
 * Món mà trang trên sàn báo "không tồn tại" và việc xoá hẳn món.
 *
 * 1. Link chết: tiện ích (chế độ cập nhật hàng loạt của quản trị viên) mở trang sản phẩm, sàn báo "Sản phẩm này không tồn
 *    tại" -> ẩn món với lý do DEAD_LINK_REASON (không xoá: lịch sử giá, người theo dõi, đơn hàng vẫn giữ). Món được nhập lại
 *    (file CSV / API / tiện ích đọc được giá) thì tự hiện lại – xem reviveDeadLinkSet, dùng trong ingest.upsertProduct.
 * 2. Xoá hẳn: chỉ cho món không có dữ liệu quan trọng (không ai theo dõi giá / nhắc sale, chưa có lượt bấm mua, chưa có
 *    đơn hàng, chưa đăng lên mạng xã hội hay góc chia sẻ). Xoá kéo theo lịch sử giá, lượt xem… của món (không lấy lại được).
 */
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { clicks, conversionItems, posts, products, saleAlerts, socialPosts, watches } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { memoClear } from "./memo";

const HOUR = 3_600_000;
export const DEAD_LINK_REASON = "Link không còn trên sàn (tiện ích phát hiện)";

/** Phần SET khi nhập lại món: món bị ẩn vì link chết mà nay sàn còn bán thì hiện lại (món ẩn vì lý do khác giữ nguyên) */
export function reviveDeadLinkSet() {
  const dead = sql`${products.hiddenReason} = ${DEAD_LINK_REASON}`;
  return {
    hidden: sql`case when ${dead} then false else ${products.hidden} end`,
    hiddenAt: sql`case when ${dead} then null else ${products.hiddenAt} end`,
    hiddenReason: sql`case when ${dead} then null else ${products.hiddenReason} end`,
  };
}

export type DeadResult = "hidden" | "already" | "fresh" | "missing";

/**
 * Tiện ích báo trang sản phẩm "không tồn tại". Không ẩn nếu nguồn chính thức (API) vừa thấy món trong 24 giờ – trang báo lỗi
 * có thể do sàn chặn tạm, không phải món đã bị gỡ.
 */
export async function markDeadLink(id: number, now = new Date()): Promise<DeadResult> {
  await ensureMigrated();
  const [p] = await db.select({ hidden: products.hidden, priceSource: products.priceSource, lastSeenAt: products.lastSeenAt }).from(products).where(eq(products.id, id)).limit(1);
  if (!p) return "missing";
  if (p.hidden) return "already";
  if (p.priceSource !== "ext" && now.getTime() - p.lastSeenAt.getTime() < 24 * HOUR) return "fresh";
  await db.update(products).set({ hidden: true, hiddenReason: DEAD_LINK_REASON, hiddenAt: now }).where(eq(products.id, id));
  memoClear("home:");
  return "hidden";
}

export interface DeleteBlockers {
  watchers: number;
  saleAlerts: number;
  clicks: number;
  orders: number;
  posts: number;
}

/** Dữ liệu quan trọng đang gắn với từng món (để biết món nào xoá hẳn được) */
export async function deleteBlockers(ids: number[]): Promise<Map<number, DeleteBlockers>> {
  await ensureMigrated();
  const out = new Map<number, DeleteBlockers>(ids.map((id) => [id, { watchers: 0, saleAlerts: 0, clicks: 0, orders: 0, posts: 0 }]));
  if (!ids.length) return out;
  const by = async (table: typeof watches | typeof saleAlerts | typeof clicks | typeof conversionItems | typeof posts | typeof socialPosts) =>
    db.select({ pid: table.productId, n: count() }).from(table).where(inArray(table.productId, ids)).groupBy(table.productId);
  const [w, a, c, o, p, s] = await Promise.all([by(watches), by(saleAlerts), by(clicks), by(conversionItems), by(posts), by(socialPosts)]);
  const add = (rows: { pid: number | null; n: number }[], k: keyof DeleteBlockers) => {
    for (const r of rows) if (r.pid != null && out.has(r.pid)) out.get(r.pid)![k] += Number(r.n);
  };
  add(w, "watchers");
  add(a, "saleAlerts");
  add(c, "clicks");
  add(o, "orders");
  add(p, "posts");
  add(s, "posts");
  return out;
}

export const canDelete = (b: DeleteBlockers | undefined) => !!b && !b.watchers && !b.saleAlerts && !b.clicks && !b.orders && !b.posts;

/** Lý do không xoá được, đọc cho người */
export function blockerText(b: DeleteBlockers): string {
  const parts = [
    b.watchers && `${b.watchers} người theo dõi giá`,
    b.saleAlerts && `${b.saleAlerts} lượt nhắc sale`,
    b.clicks && `${b.clicks} lượt bấm mua`,
    b.orders && `${b.orders} dòng đơn hàng`,
    b.posts && `${b.posts} bài đã đăng`,
  ].filter(Boolean);
  return parts.join(", ");
}

/** Xoá hẳn 1 món nếu không có dữ liệu quan trọng; kiểm tra lại ngay trước khi xoá */
export async function deleteProduct(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureMigrated();
  const b = (await deleteBlockers([id])).get(id)!;
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!p) return { ok: false, error: "Không tìm thấy sản phẩm" };
  if (!canDelete(b)) return { ok: false, error: `Không xoá được vì món đang có ${blockerText(b)} – hãy dùng “Ẩn khỏi web”` };
  await db.delete(products).where(and(eq(products.id, id)));
  memoClear("home:");
  return { ok: true };
}

export interface BulkDeleteResult {
  deleted: number;
  /** Món giữ lại vì có dữ liệu quan trọng (chỉ ẩn được) */
  kept: number;
  /** Lý do giữ lại, gộp theo loại (vd { "lượt bấm mua": 3 }) */
  keptBy: Record<string, number>;
}

/**
 * Xoá hẳn nhiều món một lần: chỉ xoá món không có dữ liệu quan trọng (giống deleteProduct), món còn lại giữ nguyên.
 * Kiểm tra từng nhóm 500 món ngay trước khi xoá.
 */
export async function deleteProducts(ids: number[]): Promise<BulkDeleteResult> {
  await ensureMigrated();
  const out: BulkDeleteResult = { deleted: 0, kept: 0, keptBy: {} };
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const blockers = await deleteBlockers(chunk);
    const ok: number[] = [];
    for (const id of chunk) {
      const b = blockers.get(id)!;
      if (canDelete(b)) ok.push(id);
      else {
        out.kept++;
        const add = (k: string, n: number) => n && (out.keptBy[k] = (out.keptBy[k] ?? 0) + 1);
        add("người theo dõi giá", b.watchers);
        add("nhắc sale", b.saleAlerts);
        add("lượt bấm mua", b.clicks);
        add("đơn hàng", b.orders);
        add("bài đã đăng", b.posts);
      }
    }
    if (ok.length) out.deleted += (await db.delete(products).where(inArray(products.id, ok)).returning({ id: products.id })).length;
  }
  if (out.deleted) memoClear("home:");
  return out;
}

