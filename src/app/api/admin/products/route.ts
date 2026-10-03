import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { recheckProduct } from "@/lib/lookup";
import { setHidden } from "@/lib/producthealth";

export const dynamic = "force-dynamic";

/** Quản trị › Sản phẩm: ẩn / hiện lại / kiểm tra lại trên sàn 1 món */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown; reason?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Thiếu mã sản phẩm" }, { status: 400 });
  if (body.action === "hide" || body.action === "unhide") {
    const ok = await setHidden(id, body.action === "hide", typeof body.reason === "string" ? body.reason : null);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  }
  if (body.action === "recheck") {
    const r = await recheckProduct(id);
    if (!r.product) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
    return NextResponse.json({
      ok: r.found,
      price: r.product.price,
      lastSeenAt: r.product.lastSeenAt,
      ...(r.found ? {} : { error: "Sàn không trả về món này (có thể đã ngừng bán), hoặc nguồn dữ liệu chưa hỗ trợ tra cứu theo mã" }),
    });
  }
  return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
}
