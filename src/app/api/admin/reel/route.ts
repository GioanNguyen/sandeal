import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db } from "@/lib/db";
import { coverFixState, postReel, postedReels, renderReel, startCoverFix, stopCoverFix } from "@/worker/reels";
import { hasImage, NO_IMAGE_ERROR } from "@/worker/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function admin() {
  const user = await getCurrentUser();
  return !!user && isAdmin(user.email);
}

/** Xem thử / tải video Reel của 1 món (dựng ngay, không đăng): /api/admin/reel?id=123 (&download=1 để tải về, vd đăng TikTok) */
export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const u = new URL(req.url);
  // Tiến độ đổi ảnh bìa Reel cũ: ?covers=1
  // Tiến độ đổi ảnh bìa + danh sách Reel đã đăng kèm trạng thái bìa: ?covers=1
  if (u.searchParams.get("covers")) return NextResponse.json({ state: coverFixState(), reels: await postedReels() }, { headers: { "Cache-Control": "no-store" } });
  const id = Number(u.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Thiếu mã sản phẩm" }, { status: 400 });
  const [p] = await db.select({ imageUrl: products.imageUrl }).from(products).where(eq(products.id, id)).limit(1);
  if (!p) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  if (!hasImage(p)) return NextResponse.json({ error: NO_IMAGE_ERROR }, { status: 400 });
  try {
    const file = await renderReel(id);
    const data = await fs.readFile(file);
    await fs.rm(file, { force: true });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(data.length),
        "Cache-Control": "no-store",
        ...(u.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="sandeal-reel-${id}.mp4"` } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Đăng Reel ngay cho 1 món: { productId }
 * Đổi ảnh bìa Reel đã đăng (chạy nền): { action: "fix-covers", ids?: string[] } – bỏ trống ids = mọi Reel chưa đổi xong
 * Dừng đổi ảnh bìa: { action: "stop-covers" }
 */
export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (body?.action === "fix-covers") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((x: string) => /^\d{5,25}$/.test(x)).slice(0, 500) : undefined;
    if (Array.isArray(body.ids) && !ids?.length) return NextResponse.json({ error: "Chưa chọn Reel nào" }, { status: 400 });
    return NextResponse.json(startCoverFix({ ids }));
  }
  if (body?.action === "stop-covers") return NextResponse.json(stopCoverFix());
  const id = Number(body?.productId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Thiếu mã sản phẩm" }, { status: 400 });
  const r = await postReel(new Date(), id);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
