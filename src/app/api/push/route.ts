import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPush } from "@/lib/push";

/** Đăng ký thiết bị nhận thông báo đẩy */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ error: "Đăng ký không hợp lệ" }, { status: 400 });
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, userId: user.id, p256dh, auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh, auth } });
  if (body?.test) {
    await sendPush(user.id, { title: "Đã bật thông báo Săn Deal", body: "Bạn sẽ nhận thông báo khi giá giảm và khi có đợt sale lớn.", url: "/account/so-thich", tag: "welcome" });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = await req.json().catch(() => null);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, String(body?.endpoint ?? "")), eq(pushSubscriptions.userId, user.id)));
  return NextResponse.json({ ok: true });
}
