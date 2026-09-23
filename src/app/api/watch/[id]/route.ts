import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { watches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const targetPrice = Number(body?.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice < 1000) return NextResponse.json({ error: "Giá không hợp lệ" }, { status: 400 });
  const rows = await db
    .update(watches)
    .set({ targetPrice, lastNotifiedAt: null })
    .where(and(eq(watches.id, Number((await params).id)), eq(watches.userId, user.id)))
    .returning({ id: watches.id });
  return rows.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  await db.delete(watches).where(and(eq(watches.id, Number((await params).id)), eq(watches.userId, user.id)));
  return NextResponse.json({ ok: true });
}
