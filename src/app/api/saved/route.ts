import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { products, watches } from "@/db/schema";
import { getCurrentUser, upsertWatch } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow } from "@/lib/ratelimit";

/** Danh sách sản phẩm đã lưu (♡) của người đang đăng nhập */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ loggedIn: false, ids: [] });
  const rows = await db.select({ id: watches.productId }).from(watches).where(eq(watches.userId, user.id));
  return NextResponse.json({ loggedIn: true, ids: rows.map((r) => r.id) });
}

/** Bật/tắt lưu một sản phẩm = theo dõi giá: báo khi giá giảm bất kỳ (từ 1.000đ) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ loggedIn: false }, { status: 401 });
  if (!(await allow(`save:${user.id}`, 200, 3600))) return NextResponse.json({ error: "Thao tác quá nhanh" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId);
  const [p] = await db.select({ price: products.price }).from(products).where(eq(products.id, productId)).limit(1);
  if (!p) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  const [existing] = await db.select().from(watches).where(and(eq(watches.userId, user.id), eq(watches.productId, productId))).limit(1);
  if (existing && body?.save !== true) {
    await db.delete(watches).where(eq(watches.id, existing.id));
    return NextResponse.json({ loggedIn: true, saved: false });
  }
  if (!existing) await upsertWatch(user.id, productId, Math.max(1000, p.price - 1000));
  return NextResponse.json({ loggedIn: true, saved: true });
}
