import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORMS } from "@/lib/format";
import { getSubscription } from "@/lib/subscription";

/** Lưu sở thích (form thường, chạy được cả khi chưa tải JS) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/account/so-thich", req.url), 303);
  await getSubscription(user.id);
  const f = await req.formData();
  const keywords = String(f.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20)
    .join(", ");
  const maxPrice = Number(String(f.get("maxPrice") ?? "").replace(/\D/g, ""));
  await db
    .update(subscriptions)
    .set({
      keywords,
      categories: f.getAll("categories").map(String).slice(0, 30),
      platforms: f.getAll("platforms").map(String).filter((p) => p in PLATFORMS),
      minDrop: Math.min(80, Math.max(0, Number(f.get("minDrop")) || 0)),
      maxPrice: maxPrice > 0 ? maxPrice : null,
      emailDigest: f.get("emailDigest") === "on",
      telegramDigest: f.get("telegramDigest") === "on",
      pushDigest: f.get("pushDigest") === "on",
      saleReminder: f.get("saleReminder") === "on",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, user.id));
  return NextResponse.redirect(new URL("/account/so-thich?saved=1", req.url), 303);
}
