import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { imageQueue, markTried } from "@/lib/extqueue";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Tiện ích trình duyệt – chế độ cập nhật hàng loạt (chỉ quản trị viên, dùng cookie đăng nhập của web):
 *   GET  ?check=1       -> { admin: true } (403 nếu không phải quản trị viên)
 *   GET  ?limit=20      -> { items: [{id, name, platform, url}], remaining }
 *   POST { tried: [id] } -> ghi nhận đã mở (món vẫn thiếu ảnh thì 24 giờ sau mới đưa lại)
 */
async function admin() {
  const user = await getCurrentUser();
  return !!user && isAdmin(user.email);
}

export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Cần đăng nhập tài khoản quản trị trên web Săn Deal (cùng trình duyệt này)" }, { status: 403, headers: NO_STORE });
  const sp = new URL(req.url).searchParams;
  // Tiện ích hỏi "có phải quản trị viên không" để hiện mục cập nhật hàng loạt (người dùng thường không thấy)
  if (sp.get("check")) return NextResponse.json({ admin: true }, { headers: NO_STORE });
  const limit = Number(sp.get("limit")) || 20;
  return NextResponse.json(await imageQueue({ limit }), { headers: NO_STORE });
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { tried?: unknown };
  const ids = (Array.isArray(body.tried) ? body.tried : []).map(Number);
  return NextResponse.json({ ok: true, ...(await markTried(ids)) }, { headers: NO_STORE });
}
