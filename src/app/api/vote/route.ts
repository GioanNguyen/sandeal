import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { castVote } from "@/lib/community";
import { allow } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Đăng nhập để bình chọn" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  const value = Number(body?.value) > 0 ? 1 : -1;
  if (!Number.isInteger(productId)) return NextResponse.json({ error: "Thiếu sản phẩm" }, { status: 400 });
  if (!(await allow(`vote:${user.id}`, 120, 3600))) return NextResponse.json({ error: "Bạn bình chọn quá nhanh" }, { status: 429 });
  try {
    return NextResponse.json(await castVote(user.id, productId, value));
  } catch {
    return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  }
}
