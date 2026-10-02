import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { products, socialPosts } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { GIA_AO_CHANNEL, NANG_GIA_CHANNEL } from "@/worker/giaao";
import { channels, lastPosted, postDeal, postFacebookDigest, postFacebookDraft, postFacebookStory, repostDays } from "@/worker/social";

const MANUAL = ["zalo", "tiktok", "facebook-group"];

/** Admin: đăng ngay lên kênh đã kết nối, hoặc đánh dấu đã đăng thủ công (Zalo, TikTok, nhóm Facebook) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const channel = String(body?.channel ?? "");
  // Bài soạn theo mẫu: đăng ĐÚNG nội dung admin đã sửa (thân bài + bình luận đầu)
  if (body?.draft) {
    if (channel !== "facebook" || !(channels() as string[]).includes("facebook")) return NextResponse.json({ error: "Trang Facebook chưa được cấu hình" }, { status: 400 });
    const d = body.draft as { kind?: unknown; body?: unknown; comment?: unknown; image?: unknown; story?: unknown; productIds?: unknown };
    const text = String(d.body ?? "").trim();
    const comment = String(d.comment ?? "").trim();
    const image = String(d.image ?? "");
    if (!text || !comment || !image.startsWith(siteUrl())) return NextResponse.json({ error: "Thiếu nội dung hoặc ảnh không hợp lệ" }, { status: 400 });
    const ids = (Array.isArray(d.productIds) ? d.productIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
    // Bài "Bóc giá ảo" / "Ai nâng giá" ghi lịch sử riêng (để lượt đăng tự động không lặp lại các món này)
    const postChannel = d.kind === "boc-gia-ao" ? GIA_AO_CHANNEL : d.kind === "nang-gia" ? NANG_GIA_CHANNEL : "facebook";
    // Chống đăng trùng: món đã đăng thành công lên Trang trong N ngày -> hỏi lại (gửi force: true để vẫn đăng)
    if (!body.force && postChannel === "facebook") {
      const dup = await lastPosted(ids);
      if (dup.size) {
        const names = new Map((await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, [...dup.keys()]))).map((r) => [r.id, r.name]));
        const list = [...dup].map(([id, x]) => `${names.get(id) ?? `#${id}`} (${x.at.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })})`);
        return NextResponse.json({ duplicate: true, error: `Đã đăng lên Trang trong ${repostDays()} ngày qua: ${list.join("; ")}` }, { status: 409 });
      }
    }
    let externalId: string | null = null;
    let error: string | null = null;
    try {
      externalId = await postFacebookDraft({ body: text.slice(0, 5000), comment: comment.slice(0, 3000), image });
    } catch (err) {
      error = (err as Error).message.slice(0, 300);
    }
    if (ids.length) await db.insert(socialPosts).values(ids.map((productId) => ({ channel: postChannel, productId, externalId, error })));
    if (error) return NextResponse.json({ error }, { status: 502 });
    // Story kèm bài (tuỳ chọn): lỗi Story không ảnh hưởng bài đã đăng
    const story = String(d.story ?? "");
    let storyError: string | null = null;
    let storyId: string | null = null;
    if (body.withStory && story.startsWith(siteUrl())) {
      try {
        storyId = await postFacebookStory(story);
      } catch (err) {
        storyError = (err as Error).message.slice(0, 300);
      }
    }
    return NextResponse.json({ ok: true, id: externalId, storyId, storyError });
  }
  // Bài tổng hợp nhiều deal lên Trang Facebook
  if (Array.isArray(body?.productIds)) {
    if (channel !== "facebook" || !(channels() as string[]).includes("facebook")) return NextResponse.json({ error: "Trang Facebook chưa được cấu hình" }, { status: 400 });
    const ids = body.productIds.map(Number).filter(Number.isFinite).slice(0, 10);
    const found = await db.select().from(products).where(inArray(products.id, ids));
    const deals = ids.map((id: number) => found.find((p) => p.id === id)).filter((p: unknown): p is (typeof found)[number] => !!p);
    const n = await postFacebookDigest(deals);
    return n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Đăng thất bại, xem lịch sử bên dưới" }, { status: 502 });
  }
  const [p] = await db.select().from(products).where(eq(products.id, Number(body?.productId))).limit(1);
  if (!p) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  if (MANUAL.includes(channel)) {
    await db.insert(socialPosts).values({ channel, productId: p.id });
    return NextResponse.json({ ok: true });
  }
  if (!(channels() as string[]).includes(channel)) return NextResponse.json({ error: "Kênh chưa được cấu hình" }, { status: 400 });
  const ok = await postDeal(channel as "telegram" | "facebook", p);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Đăng thất bại, xem lịch sử bên dưới" }, { status: 502 });
}
