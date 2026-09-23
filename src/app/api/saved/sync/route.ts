import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { products, watches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Sau khi đăng nhập: chuyển các sản phẩm đã lưu trên trình duyệt vào tài khoản */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ids = [...new Set<number>((body?.ids ?? []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0))].slice(0, 100);
  if (ids.length) {
    const rows = await db.select({ id: products.id, price: products.price }).from(products).where(inArray(products.id, ids));
    if (rows.length) {
      await db
        .insert(watches)
        .values(rows.map((r) => ({ userId: user.id, productId: r.id, targetPrice: Math.max(1000, r.price - 1000) })))
        .onConflictDoNothing();
    }
  }
  return NextResponse.json({ ok: true });
}
