import { redirectTo } from "@/lib/redirect";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { clicks, vouchers } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const id = Number((await params).id);
  const [v] = Number.isInteger(id)
    ? await db.select({ id: vouchers.id, url: vouchers.affiliateUrl, platform: vouchers.platform }).from(vouchers).where(eq(vouchers.id, id)).limit(1)
    : [];
  if (!v) return redirectTo("/vouchers");
  const ua = req.headers.get("user-agent") ?? "";
  if (!/bot|crawl|spider|preview/i.test(ua)) {
    await db.insert(clicks).values({ voucherId: v.id, platform: v.platform, referer: req.headers.get("referer") });
  }
  return NextResponse.redirect(v.url, 302);
}
