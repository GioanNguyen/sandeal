import { redirectTo } from "@/lib/redirect";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { subscriptions, watches } from "@/db/schema";
import { verifySignedFor, verifyUnsubscribeSig } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const t = String(form.get("t") ?? "");
  if (t === "digest" || t === "sale" || t === "weekly") {
    const u = Number(form.get("u"));
    if (!Number.isInteger(u) || !verifySignedFor(t, u, String(form.get("s") ?? ""))) {
      return NextResponse.json({ error: "Link không hợp lệ" }, { status: 400 });
    }
    await ensureMigrated();
    if (t === "weekly") {
      await db.insert(subscriptions).values({ userId: u, weeklySummary: false }).onConflictDoUpdate({ target: subscriptions.userId, set: { weeklySummary: false } });
    } else {
      await db.update(subscriptions).set(t === "digest" ? { emailDigest: false } : { saleReminder: false }).where(eq(subscriptions.userId, u));
    }
    return redirectTo(`/unsubscribe?done=${t}`, 303);
  }
  const w = Number(form.get("w"));
  const s = String(form.get("s") ?? "");
  if (!Number.isInteger(w) || !verifyUnsubscribeSig(w, s)) {
    return NextResponse.json({ error: "Link không hợp lệ" }, { status: 400 });
  }
  await ensureMigrated();
  await db.delete(watches).where(eq(watches.id, w));
  return redirectTo("/unsubscribe?done=1", 303);
}
