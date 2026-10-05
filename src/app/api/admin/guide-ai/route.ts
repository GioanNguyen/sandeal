import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { approveGuide, draftGuide, guideAiEnabled, queryTopic, rejectGuide, unscheduleGuide } from "@/worker/guide-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Bài hướng dẫn AI soạn (trang /admin/huong-dan):
 *   {action:"draft"} soạn 1 bài nháp ngay ({action:"draft",q} theo từ khoá khách tìm) · {action:"approve",id} duyệt · {action:"reject",id} bỏ
 *   {action:"redo",id} bỏ bài này và soạn bài khác · {action:"unschedule",id} huỷ lịch bài đã duyệt (chưa đăng)
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const { action, id, q } = (await req.json().catch(() => ({}))) as { action?: string; id?: number; q?: string };
  const n = Number(id);
  switch (action) {
    case "approve": {
      const day = await approveGuide(n);
      return day ? NextResponse.json({ ok: true, day }) : NextResponse.json({ error: "Bài không còn ở trạng thái chờ duyệt" }, { status: 409 });
    }
    case "reject":
      await rejectGuide(n);
      return NextResponse.json({ ok: true });
    case "unschedule":
      return (await unscheduleGuide(n)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Bài đã đăng hoặc không còn trong lịch" }, { status: 409 });
    case "redo":
    case "draft": {
      if (!guideAiEnabled()) return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY (hoặc đã tắt bằng GUIDES_AI=0)" }, { status: 400 });
      if (action === "redo") await rejectGuide(n);
      // q: soạn bài theo từ khoá khách đang tìm (Quản trị › Nhu cầu)
      const term = action === "draft" && typeof q === "string" ? q.trim().slice(0, 60) : "";
      const r = await draftGuide(new Date(), fetch, term.length >= 2 ? queryTopic(term) : undefined);
      return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
}
