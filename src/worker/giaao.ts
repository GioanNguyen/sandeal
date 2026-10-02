/**
 * Bài "Bóc giá ảo" tự đăng lên Trang Facebook (mặc định thứ 4 và thứ 7 lúc 9h, cộng phần lệch giờ ngẫu nhiên).
 * - Bình thường: 3 món ghi giảm sâu nhưng giá như mọi ngày (trang /giam-gia-ao), món đã lên bài trong 30 ngày thì bỏ qua.
 * - Còn ≤ 10 ngày tới đợt sale lớn và 6 ngày qua chưa đăng: thay bằng bài "Ai nâng giá trước sale?" (trang /nang-gia).
 *
 * .env: GIA_AO=0 để tắt · GIA_AO_DAYS="3,6" (0 = Chủ nhật … 6 = thứ 7) · GIA_AO_HOUR="9"
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { socialPosts } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { fakeDeals } from "@/lib/fakedeals";
import { bocGiaAo, type PostDraft } from "@/lib/fbposts";
import { siteUrl } from "@/lib/mail";
import { currentRaisePage } from "@/lib/salepages";
import { channels, postFacebookDraft, raiseDraft } from "./social";

export const GIA_AO_CHANNEL = "facebook_giaao";
export const NANG_GIA_CHANNEL = "facebook_nanggia";
const DAY = 86_400_000;

export const giaAoEnabled = () => process.env.GIA_AO !== "0" && channels().includes("facebook");

/** Ngày trong tuần (0–6) và giờ đăng */
export function giaAoSchedule(env: Record<string, string | undefined> = process.env): { days: number[]; hour: number } {
  const days = [...new Set((env.GIA_AO_DAYS ?? "3,6").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  const h = Number(env.GIA_AO_HOUR ?? 9);
  return { days: days.length ? days : [3, 6], hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9 };
}

/** Các món đã lên bài bóc giá ảo trong `days` ngày (để không lặp) */
async function recentlyUsed(now: Date, days = 30) {
  const rows = await db
    .select({ id: socialPosts.productId })
    .from(socialPosts)
    .where(and(eq(socialPosts.channel, GIA_AO_CHANNEL), isNull(socialPosts.error), gte(socialPosts.postedAt, new Date(now.getTime() - days * DAY))));
  return new Set(rows.map((r) => r.id));
}

async function postedSince(channel: string, since: Date) {
  const [row] = await db.select({ id: socialPosts.id }).from(socialPosts).where(and(eq(socialPosts.channel, channel), isNull(socialPosts.error), isNotNull(socialPosts.externalId), gte(socialPosts.postedAt, since))).limit(1);
  return !!row;
}

/** Bài sẽ đăng ở lượt tới (cũng dùng để xem trước trong trang quản trị). null = chưa đủ dữ liệu */
export async function nextGiaAoDraft(now = new Date()): Promise<{ draft: PostDraft; channel: string } | null> {
  await ensureMigrated();
  const pg = currentRaisePage(now);
  const daysToSale = pg ? (pg.event.start.getTime() - now.getTime()) / DAY : Infinity;
  if (pg && pg.state === "upcoming" && daysToSale <= 10 && !(await postedSince(NANG_GIA_CHANNEL, new Date(now.getTime() - 6 * DAY)))) {
    const d = await raiseDraft(now);
    if (d) return { draft: d, channel: NANG_GIA_CHANNEL };
  }
  const list = await fakeDeals({ now, limit: 3, exclude: await recentlyUsed(now) });
  const d = bocGiaAo(list, { site: siteUrl(), now });
  return d ? { draft: d, channel: GIA_AO_CHANNEL } : null;
}

/** Đăng 1 bài, ghi lịch sử cho từng món. */
export async function postGiaAo(now = new Date(), post: typeof postFacebookDraft = postFacebookDraft): Promise<{ ok: boolean; kind?: string; id?: string; error?: string }> {
  const next = await nextGiaAoDraft(now);
  if (!next) return { ok: false, error: "Chưa có đủ món ghi giảm sâu mà giá như mọi ngày (cần từ 2 món)" };
  const { draft, channel } = next;
  let externalId: string | null = null;
  let error: string | null = null;
  try {
    externalId = await post(draft);
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
    // Đã đăng bài nhưng lỗi bình luận đầu: vẫn tính là đã đăng (giống bài hướng dẫn)
    const m = error.match(/Đã đăng bài \(([^)]+)\)/);
    if (m) externalId = m[1];
  }
  const ids = draft.productIds.length ? draft.productIds : [];
  if (ids.length) await db.insert(socialPosts).values(ids.map((productId) => ({ channel, productId, externalId, error: externalId ? null : error, postedAt: now })));
  if (error && !externalId) console.warn("[gia-ao] lỗi đăng:", error);
  return externalId ? { ok: true, kind: draft.kind, id: externalId, ...(error ? { error } : {}) } : { ok: false, kind: draft.kind, error: error ?? "lỗi" };
}

/** Lần đăng gần nhất (bóc giá ảo hoặc nâng giá) cho trang quản trị */
export async function lastGiaAoPosts(limit = 5) {
  await ensureMigrated();
  const rows = await db
    .select()
    .from(socialPosts)
    .where(inArray(socialPosts.channel, [GIA_AO_CHANNEL, NANG_GIA_CHANNEL]))
    .orderBy(desc(socialPosts.postedAt))
    .limit(limit * 6);
  // gom theo bài (nhiều món chung 1 externalId / cùng thời điểm)
  const m = new Map<string, { at: Date; channel: string; externalId: string | null; error: string | null; n: number }>();
  for (const r of rows) {
    const key = `${r.channel}|${r.externalId ?? r.postedAt.toISOString()}`;
    const g = m.get(key);
    if (g) g.n++;
    else m.set(key, { at: r.postedAt, channel: r.channel, externalId: r.externalId, error: r.error, n: 1 });
  }
  return [...m.values()].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
