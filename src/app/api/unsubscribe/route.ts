import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { watches } from "@/db/schema";
import { verifyUnsubscribeSig } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const w = Number(form.get("w"));
  const s = String(form.get("s") ?? "");
  if (!Number.isInteger(w) || !verifyUnsubscribeSig(w, s)) {
    return NextResponse.json({ error: "Link không hợp lệ" }, { status: 400 });
  }
  await ensureMigrated();
  await db.delete(watches).where(eq(watches.id, w));
  return NextResponse.redirect(new URL("/unsubscribe?done=1", req.url), 303);
}
