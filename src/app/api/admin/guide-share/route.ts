import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findGuide } from "@/lib/guides-db";
import { guidesFbEnabled, shareGuide } from "@/worker/guides";

export const dynamic = "force-dynamic";

/** Đăng ngay 1 bài hướng dẫn (đã tới ngày đăng) lên Trang Facebook */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  if (!guidesFbEnabled()) return NextResponse.json({ error: "Chưa cấu hình FB_PAGE_ID / FB_PAGE_TOKEN (hoặc đã tắt bằng GUIDES_FB=0)" }, { status: 400 });
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
  const g = slug ? await findGuide(slug) : undefined;
  if (!g) return NextResponse.json({ error: "Không có bài này hoặc bài chưa tới ngày đăng" }, { status: 404 });
  const r = await shareGuide(g);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
