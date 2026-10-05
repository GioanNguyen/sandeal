import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { adminTelegramChats, alertsEnabled } from "@/lib/ops";
import { runDailyBrief } from "@/worker/watchdog";

/** Quản trị › Hôm nay: {action:"test"} gửi thử tin tóm tắt tới nơi nhận báo (Telegram / email) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "test") return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
  if (!alertsEnabled()) return NextResponse.json({ error: "Đang tắt tin báo (ADMIN_ALERTS=0)" }, { status: 400 });
  const sent = await runDailyBrief(new Date(), { force: true });
  const chats = await adminTelegramChats();
  return NextResponse.json({ ok: true, sent: sent || [], telegram: chats.length });
}
