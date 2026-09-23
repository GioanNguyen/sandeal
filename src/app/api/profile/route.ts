import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  const name = String((await req.formData()).get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  await db.update(users).set({ name: name || null }).where(eq(users.id, user.id));
  return NextResponse.redirect(new URL("/account?profile=1", req.url), 303);
}
