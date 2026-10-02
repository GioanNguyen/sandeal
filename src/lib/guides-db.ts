/**
 * Lịch bài hướng dẫn đầy đủ = bài viết sẵn (guides.tsx, guides-lich.tsx) + bài AI soạn đã được duyệt (bảng ai_guides).
 * Các trang, sitemap, RSS và worker đăng Facebook đều đọc qua đây.
 */
import { createElement } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { aiGuides } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { cleanScene, type GuideCover } from "./guide-covers";
import { GuideBody, type GuideBlock } from "./guide-blocks";
import { ALL_GUIDES, guidePublishAt, isGuidePublished, type Guide } from "./guides";

type AiRow = typeof aiGuides.$inferSelect;

const RELATED = new Set(["deep", "vouchers", "sales"]);

/** Chuyển 1 bài AI trong DB thành Guide (bài nháp chưa có ngày đăng thì lấy ngày tạo để xem trước) */
export function aiRowToGuide(r: AiRow): Guide {
  const day = r.publishDate ?? new Date(r.createdAt.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const cover: GuideCover = {
    kicker: r.kicker,
    points: r.points,
    scene: cleanScene(r.scene) ?? { type: "chart", points: [520, 540, 500, 530, 480, 470, 450], badge: "Giảm thật" },
  };
  return {
    slug: r.slug,
    title: r.title,
    description: r.description,
    published: day,
    updated: day,
    related: (RELATED.has(r.related) ? r.related : "deep") as Guide["related"],
    body: createElement(GuideBody, { blocks: r.body as GuideBlock[] }),
    cover,
    aiId: r.id,
    draft: r.status !== "scheduled",
  };
}

async function aiRows(statuses: string[]) {
  await ensureMigrated();
  return db.select().from(aiGuides).where(inArray(aiGuides.status, statuses));
}

/** Mọi bài có lịch đăng (viết sẵn + AI đã duyệt) */
export async function scheduleGuides(): Promise<Guide[]> {
  const rows = await aiRows(["scheduled"]);
  const fixed = new Set(ALL_GUIDES.map((g) => g.slug));
  return [...ALL_GUIDES, ...rows.filter((r) => r.publishDate && !fixed.has(r.slug)).map(aiRowToGuide)];
}

export async function livePublishedGuides(now = new Date()) {
  return (await scheduleGuides())
    .filter((g) => isGuidePublished(g, now))
    .sort((a, b) => guidePublishAt(b).getTime() - guidePublishAt(a).getTime() || a.slug.localeCompare(b.slug));
}

export async function liveUpcomingGuides(now = new Date()) {
  return (await scheduleGuides()).filter((g) => !isGuidePublished(g, now)).sort((a, b) => guidePublishAt(a).getTime() - guidePublishAt(b).getTime());
}

/**
 * Tìm bài theo đường dẫn. Bài chưa tới ngày đăng (kể cả bài nháp AI chờ duyệt) chỉ trả về khi `preview`
 * (quản trị viên xem trước).
 */
export async function findGuide(slug: string, now = new Date(), preview = false): Promise<Guide | undefined> {
  const fixed = ALL_GUIDES.find((g) => g.slug === slug);
  if (fixed) return preview || isGuidePublished(fixed, now) ? fixed : undefined;
  await ensureMigrated();
  const [r] = await db.select().from(aiGuides).where(eq(aiGuides.slug, slug)).limit(1);
  if (!r || r.status === "rejected") return undefined;
  const g = aiRowToGuide(r);
  if (preview) return g;
  return r.status === "scheduled" && isGuidePublished(g, now) ? g : undefined;
}

/** Bài nháp AI đang chờ duyệt (mới nhất trước) */
export async function draftGuides() {
  await ensureMigrated();
  const rows = await db.select().from(aiGuides).where(and(eq(aiGuides.status, "draft")));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
