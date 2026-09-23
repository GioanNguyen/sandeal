import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { posts, products, users, votes } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { checkLink } from "./lookup";

export const displayName = (u: { name: string | null; email: string }) => {
  if (u.name?.trim()) return u.name.trim();
  const local = u.email.split("@")[0];
  return `${local.slice(0, 3)}***`;
};

export async function voteSummary(productId: number, userId?: number) {
  await ensureMigrated();
  const [row] = await db
    .select({
      up: sql<number>`coalesce(sum(case when ${votes.value} > 0 then 1 else 0 end), 0)`,
      down: sql<number>`coalesce(sum(case when ${votes.value} < 0 then 1 else 0 end), 0)`,
      mine: userId ? sql<number>`coalesce(max(case when ${votes.userId} = ${userId} then ${votes.value} end), 0)` : sql<number>`0`,
    })
    .from(votes)
    .where(eq(votes.productId, productId));
  return { up: Number(row.up), down: Number(row.down), mine: Number(row.mine) as -1 | 0 | 1 };
}

/** Bình chọn: bấm lại cùng lựa chọn để bỏ bình chọn */
export async function castVote(userId: number, productId: number, value: 1 | -1) {
  await ensureMigrated();
  const [cur] = await db.select().from(votes).where(and(eq(votes.userId, userId), eq(votes.productId, productId))).limit(1);
  if (cur?.value === value) await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.productId, productId)));
  else
    await db
      .insert(votes)
      .values({ userId, productId, value })
      .onConflictDoUpdate({ target: [votes.userId, votes.productId], set: { value, createdAt: new Date() } });
  return voteSummary(productId, userId);
}

export type ShareResult = { ok: true; postId: number; productId: number; existed: boolean } | { ok: false; error: string };

export async function shareDeal(userId: number, url: string, note: string): Promise<ShareResult> {
  await ensureMigrated();
  const r = await checkLink(url);
  if (r.status === "invalid") return { ok: false, error: "Link không hợp lệ. Hãy dán link sản phẩm Shopee, Lazada hoặc TikTok Shop." };
  if (r.status === "queued") return { ok: false, error: "Chưa lấy được thông tin sản phẩm này. Chúng tôi sẽ thử lại, bạn chia sẻ lại sau vài giờ nhé." };
  const [existing] = await db.select().from(posts).where(eq(posts.productId, r.productId)).limit(1);
  if (existing) return { ok: true, postId: existing.id, productId: r.productId, existed: true };
  const [p] = await db.insert(posts).values({ userId, productId: r.productId, note: note.trim().slice(0, 280) }).returning();
  await castVote(userId, r.productId, 1); // người đăng mặc định thấy hot
  return { ok: true, postId: p.id, productId: r.productId, existed: false };
}

const score = sql<number>`coalesce((select sum(v.value) from votes v where v.product_id = ${posts.productId}), 0)`;
const ups = sql<number>`coalesce((select count(*) from votes v where v.product_id = ${posts.productId} and v.value > 0), 0)`;
const downs = sql<number>`coalesce((select count(*) from votes v where v.product_id = ${posts.productId} and v.value < 0), 0)`;

export async function listPosts(opts: { sort: "hot" | "new"; page?: number; pageSize?: number; includeHidden?: boolean; viewerId?: number }) {
  await ensureMigrated();
  const size = opts.pageSize ?? 20;
  const hot = sql`(${score}) / power(extract(epoch from (now() - ${posts.createdAt})) / 3600 + 2, 1.5) desc`;
  const rows = await db
    .select({
      post: posts,
      product: products,
      user: { id: users.id, name: users.name, email: users.email },
      score,
      ups,
      downs,
      mine: opts.viewerId
        ? sql<number>`coalesce((select v.value from votes v where v.product_id = ${posts.productId} and v.user_id = ${opts.viewerId}), 0)`
        : sql<number>`0`,
    })
    .from(posts)
    .innerJoin(products, eq(products.id, posts.productId))
    .innerJoin(users, eq(users.id, posts.userId))
    .where(opts.includeHidden ? undefined : eq(posts.hidden, false))
    .orderBy(opts.sort === "hot" ? hot : desc(posts.createdAt), desc(posts.id))
    .limit(size)
    .offset(((opts.page ?? 1) - 1) * size);
  return rows.map((r) => ({
    ...r,
    score: Number(r.score),
    ups: Number(r.ups),
    downs: Number(r.downs),
    mine: Math.sign(Number(r.mine)) as -1 | 0 | 1,
    author: displayName(r.user),
  }));
}

/** Bảng xếp hạng 30 ngày: 10 điểm mỗi deal + tổng bình chọn (của người khác) cho deal đã đăng */
export async function leaderboard(limit = 20) {
  await ensureMigrated();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      deals: count(posts.id),
      votes: sql<number>`coalesce(sum((select sum(v.value) from votes v where v.product_id = ${posts.productId} and v.user_id <> ${users.id})), 0)`,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .where(and(gte(posts.createdAt, since), eq(posts.hidden, false)))
    .groupBy(users.id, users.name, users.email);
  return rows
    .map((r) => ({ id: r.id, name: displayName(r), deals: Number(r.deals), votes: Number(r.votes), points: Number(r.deals) * 10 + Number(r.votes) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}
