import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientIp } from "@/lib/ratelimit";
import { watchRequest } from "@/lib/requestwatch";

/** "Báo cho tôi khi có lịch sử giá" cho link chưa có dữ liệu: { requestId, email? } (đã đăng nhập thì dùng email tài khoản) */
export async function POST(req: Request) {
  if (!(await allow(`rw:${clientIp(req)}`, 20, 3600))) return NextResponse.json({ error: "Thao tác quá nhiều, thử lại sau" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { requestId?: unknown; email?: unknown };
  const user = await getCurrentUser();
  const email = user?.email ?? (typeof body.email === "string" ? body.email : "");
  const ok = await watchRequest(Number(body.requestId), { email, userId: user?.id ?? null });
  if (!ok) return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
  return NextResponse.json({ ok: true, email });
}
