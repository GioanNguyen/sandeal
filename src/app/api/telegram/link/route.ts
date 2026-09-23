import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSubscription } from "@/lib/subscription";
import { botUsername } from "@/lib/telegram";

/** Tạo mã liên kết rồi chuyển người dùng sang bot Telegram: t.me/<bot>?start=<mã> */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/account/so-thich", req.url), 303);
  if (!botUsername()) return NextResponse.redirect(new URL("/account/so-thich?tg=off", req.url), 303);
  await getSubscription(user.id);
  const code = randomBytes(12).toString("base64url");
  await db.update(subscriptions).set({ telegramLinkCode: code }).where(eq(subscriptions.userId, user.id));
  return NextResponse.redirect(`https://t.me/${botUsername()}?start=${code}`, 303);
}
