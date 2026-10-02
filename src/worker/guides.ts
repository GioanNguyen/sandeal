/**
 * Đăng bài hướng dẫn đều đặn: bài trong lịch (src/lib/guides-lich.tsx) tự hiện trên site lúc 8h ngày đăng;
 * worker này đăng bài ảnh (ảnh bìa + tóm tắt, link ở bình luận đầu) lên Trang Facebook ngay sau đó (mỗi bài 1 lần). GUIDES_FB=0 để tắt phần đăng Facebook.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { guidePosts } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { ALL_GUIDES, guidePublishAt, isGuidePublished, type Guide } from "@/lib/guides";
import { siteUrl } from "@/lib/mail";
import { postFacebookDraft } from "./social";

const DAY = 86_400_000;
export const guidesFbEnabled = () => process.env.GUIDES_FB !== "0" && !!process.env.FB_PAGE_ID && !!process.env.FB_PAGE_TOKEN;

/**
 * Bài đăng Facebook cho 1 bài hướng dẫn: bài ẢNH (ảnh bìa dọc 4:5 – nổi bật trên bảng tin hơn bài chia sẻ link),
 * link đọc bài ở bình luận đầu (giống bài deal).
 */
export function guidePost(g: Pick<Guide, "slug" | "title" | "description">, site = siteUrl()) {
  return {
    body: `📖 ${g.title}\n\n${g.description}\n\n👇 Link đọc bài đầy đủ ở bình luận đầu\n#SănDeal #MẹoMuaSắm #SănSale`,
    comment: `📖 Đọc bài: ${site}/huong-dan/${g.slug}\nℹ️ Bài hướng dẫn miễn phí của Săn Deal – mỗi tuần một mẹo mua sắm mới.`,
    image: `${site}/huong-dan/${g.slug}/anh-bia`,
  };
}

/** Trạng thái đăng Facebook của từng bài: lần thành công gần nhất, hoặc lỗi gần nhất nếu chưa thành công */
export async function guideShareStatus(): Promise<Map<string, { at: Date; externalId: string | null; error: string | null }>> {
  await ensureMigrated();
  const rows = await db.select().from(guidePosts).where(eq(guidePosts.channel, "facebook")).orderBy(desc(guidePosts.postedAt));
  const out = new Map<string, { at: Date; externalId: string | null; error: string | null }>();
  for (const r of rows) {
    const cur = out.get(r.slug);
    // Ưu tiên lần đã lên Trang (có mã bài); chưa lên lần nào thì lấy lỗi gần nhất
    if (!cur || (!cur.externalId && r.externalId)) out.set(r.slug, { at: r.postedAt, externalId: r.externalId, error: r.error });
  }
  return out;
}

/** Đăng 1 bài lên Trang Facebook, ghi lại kết quả */
export async function shareGuide(g: Guide, now = new Date()): Promise<{ ok: boolean; id?: string; error?: string }> {
  await ensureMigrated();
  try {
    const id = await postFacebookDraft(guidePost(g));
    await db.insert(guidePosts).values({ slug: g.slug, channel: "facebook", postedAt: now, externalId: id });
    return { ok: true, id };
  } catch (err) {
    const error = (err as Error).message.slice(0, 500);
    // Bài ảnh đã lên nhưng bình luận chứa link lỗi: coi là đã đăng (không đăng lại cho khỏi trùng), ghi chú để bình luận tay
    const posted = /^Đã đăng bài \(([^)]+)\)/.exec(error)?.[1] ?? null;
    await db.insert(guidePosts).values({ slug: g.slug, channel: "facebook", postedAt: now, externalId: posted, error });
    return posted ? { ok: true, id: posted, error } : { ok: false, error };
  }
}

/**
 * Đăng các bài vừa tới ngày (trong 3 ngày gần nhất) mà chưa đăng thành công. Mỗi lần chạy tối đa 1 bài,
 * mỗi bài thử lại tối đa 3 lần nếu lỗi. Trả về số bài đã đăng.
 */
export async function shareDueGuides(now = new Date()): Promise<number> {
  if (!guidesFbEnabled()) return 0;
  await ensureMigrated();
  const due = ALL_GUIDES.filter((g) => isGuidePublished(g, now) && now.getTime() - guidePublishAt(g).getTime() < 3 * DAY);
  for (const g of due) {
    const rows = await db.select().from(guidePosts).where(and(eq(guidePosts.slug, g.slug), eq(guidePosts.channel, "facebook")));
    if (rows.some((r) => r.externalId)) continue;
    if (rows.length >= 3) continue;
    const r = await shareGuide(g, now);
    if (r.ok) console.log(`[guides] đã đăng bài "${g.title}" lên Facebook (${r.id})`);
    else console.error(`[guides] không đăng được "${g.title}": ${r.error}`);
    return r.ok ? 1 : 0;
  }
  return 0;
}

/** Số bài đăng thành công (để kiểm thử) */
export const successfulShares = async (slug: string) =>
  (await db.select().from(guidePosts).where(and(eq(guidePosts.slug, slug), isNotNull(guidePosts.externalId)))).length;
