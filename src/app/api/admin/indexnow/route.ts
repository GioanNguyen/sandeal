import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { runIndexNow } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/** Gửi ngay các trang mới/đổi cho công cụ tìm kiếm (không chờ lịch 2 giờ/lần) */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const r = await runIndexNow();
  if (r.skipped) return NextResponse.json({ error: r.skipped }, { status: 400 });
  return NextResponse.json({ ok: r.status == null || r.status === 200 || r.status === 202, ...r });
}
