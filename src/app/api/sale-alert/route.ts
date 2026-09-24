import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { setSaleAlert } from "@/worker/alerts";

/** Bật/tắt "Nhắc tôi khi sale … bắt đầu" cho 1 sản phẩm (cần đăng nhập để gửi email/thông báo) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Cần đăng nhập" }, { status: 401 });
  if (!(await allow(`sale-alert:${user.id}`, 120, 3600))) return NextResponse.json({ error: "Thao tác quá nhanh" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ error: "Thiếu sản phẩm" }, { status: 400 });
  const r = await setSaleAlert(user.id, productId, body?.on !== false);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
