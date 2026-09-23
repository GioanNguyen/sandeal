import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user) {
    await db.update(subscriptions).set({ telegramChatId: null, telegramDigest: false }).where(eq(subscriptions.userId, user.id));
  }
  return NextResponse.redirect(new URL("/account/so-thich", req.url), 303);
}
