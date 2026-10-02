/**
 * Đăng bài hướng dẫn đều đặn: bài trong lịch (src/lib/guides-lich.tsx) tự hiện trên site lúc 8h ngày đăng;
 * worker này đăng link bài lên Trang Facebook ngay sau đó (mỗi bài 1 lần). GUIDES_FB=0 để tắt phần đăng Facebook.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { guidePosts } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { ALL_GUIDES, guidePublishAt, isGuidePublished, type Guide } from "@/lib/guides";
import { siteUrl } from "@/lib/mail";
import { postFacebook } from "./social";

const DAY = 86_400_000;
export const guidesFbEnabled = () => process.env.GUIDES_FB !== "0" && !!process.env.FB_PAGE_ID && !!process.env.FB_PAGE_TOKEN;

/** Nội dung bài đăng Facebook cho 1 bài hướng dẫn (Facebook tự lấy ảnh xem trước từ link) */
export const guideMessage = (g: Pick<Guide, "title" | "description">) => `${g.title}\n\n${g.description}\n\n#SănDeal #MẹoMuaSắm`;

/** Trạng thái đăng Facebook của từng bài: lần thành công gần nhất, hoặc lỗi gần nhất nếu chưa thành công */
export async function guideShareStatus(): Promise<Map<string, { at: Date; externalId: string | null; error: string | null }>> {
  await ensureMigrated();
  const rows = await db.select().from(guidePosts).where(eq(guidePosts.channel, "facebook")).orderBy(desc(guidePosts.postedAt));
  const out = new Map<string, { at: Date; externalId: string | null; error: string | null }>();
  for (const r of rows) {
    const cur = out.get(r.slug);
    if (!cur || (cur.error && !r.error)) out.set(r.slug, { at: r.postedAt, externalId: r.externalId, error: r.error });
  }
  return out;
}

/** Đăng 1 bài lên Trang Facebook, ghi lại kết quả */
export async function shareGuide(g: Guide, now = new Date()): Promise<{ ok: boolean; id?: string; error?: string }> {
  await ensureMigrated();
  try {
    const id = await postFacebook(guideMessage(g), `${siteUrl()}/huong-dan/${g.slug}`);
    await db.insert(guidePosts).values({ slug: g.slug, channel: "facebook", postedAt: now, externalId: id });
    return { ok: true, id };
  } catch (err) {
    const error = (err as Error).message.slice(0, 500);
    await db.insert(guidePosts).values({ slug: g.slug, channel: "facebook", postedAt: now, error });
    return { ok: false, error };
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
    if (rows.some((r) => !r.error)) continue;
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
  (await db.select().from(guidePosts).where(and(eq(guidePosts.slug, slug), isNull(guidePosts.error)))).length;
