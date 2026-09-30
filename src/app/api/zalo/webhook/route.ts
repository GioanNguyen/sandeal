import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { linkCodeIn, sendZaloText, verifyZaloSignature } from "@/lib/zalo";

/**
 * Webhook Zalo OA (khai báo trong trang quản lý ứng dụng Zalo, bật các sự kiện follow, unfollow, user_send_text…).
 * - Người dùng gửi mã liên kết -> gắn Zalo với tài khoản Săn Deal.
 * - Mọi tương tác của người đã liên kết -> gia hạn khung 7 ngày được nhắn tin.
 */
type ZEvent = {
  event_name?: string;
  timestamp?: string | number;
  sender?: { id?: string };
  follower?: { id?: string };
  user_id_by_app?: string;
  message?: { text?: string };
};

export async function POST(req: Request) {
  const raw = await req.text();
  let ev: ZEvent;
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!verifyZaloSignature(raw, req.headers.get("x-zevent-signature"), ev.timestamp)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await ensureMigrated();
  const name = ev.event_name ?? "";
  const zid = ev.sender?.id ?? ev.follower?.id;
  if (!zid || !name.startsWith("user_") && name !== "follow" && name !== "unfollow") return NextResponse.json({ ok: true });
  const now = new Date();

  if (name === "unfollow") {
    await db.update(subscriptions).set({ zaloLastSeenAt: null }).where(eq(subscriptions.zaloUserId, zid));
    return NextResponse.json({ ok: true });
  }

  // Gửi mã liên kết
  const code = name === "user_send_text" ? linkCodeIn(ev.message?.text ?? "") : null;
  if (code) {
    const linked = await db
      .update(subscriptions)
      .set({ zaloUserId: zid, zaloLinkCode: null, zaloLastSeenAt: now, zaloAlerts: true, updatedAt: now })
      .where(eq(subscriptions.zaloLinkCode, code))
      .returning({ userId: subscriptions.userId });
    if (linked.length) {
      // Một Zalo chỉ gắn với 1 tài khoản: gỡ khỏi tài khoản cũ (nếu có)
      const others = await db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.zaloUserId, zid));
      for (const o of others) if (o.userId !== linked[0].userId) await db.update(subscriptions).set({ zaloUserId: null }).where(eq(subscriptions.userId, o.userId));
      await sendZaloText(zid, `Đã kết nối Săn Deal ✅\nBạn sẽ nhận báo giá qua Zalo khi món đang theo dõi giảm giá, có hàng lại hoặc sale bắt đầu.\n\nLưu ý: Zalo chỉ cho phép Săn Deal nhắn bạn trong 7 ngày kể từ lần bạn nhắn gần nhất. Thỉnh thoảng trả lời "ok" để tiếp tục nhận tin. Quá hạn thì bạn vẫn nhận qua email.`);
      return NextResponse.json({ ok: true });
    }
  }

  // Người đã liên kết tương tác -> gia hạn khung 7 ngày
  const touched = await db.update(subscriptions).set({ zaloLastSeenAt: now }).where(eq(subscriptions.zaloUserId, zid)).returning({ userId: subscriptions.userId });
  const text = (ev.message?.text ?? "").trim().toLowerCase();
  if (touched.length && name === "user_send_text" && /^(ok|oke|okay|1|tiếp tục|tiep tuc|có|co)$/.test(text)) {
    await sendZaloText(zid, "Đã gia hạn: bạn tiếp tục nhận báo giá qua Zalo trong 7 ngày tới 👍");
  } else if (!touched.length && (name === "follow" || name === "user_send_text")) {
    await sendZaloText(zid, `Chào bạn! Để nhận báo giá qua Zalo, đăng nhập ${siteUrl()}/account/so-thich, bấm "Kết nối Zalo" rồi gửi mã 6 ký tự vào đây.`);
  }
  return NextResponse.json({ ok: true });
}
