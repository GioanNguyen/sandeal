import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { onlineNow } from "@/lib/presence";

export const dynamic = "force-dynamic";

/** Quản trị › Thống kê: số người đang online, theo trang / nguồn / thiết bị (khung tự làm mới) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  return NextResponse.json(onlineNow(), { headers: { "Cache-Control": "no-store" } });
}
