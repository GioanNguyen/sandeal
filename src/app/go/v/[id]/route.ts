import { redirectTo } from "@/lib/redirect";
import { markStaff, staffRequest } from "@/lib/staff";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { clicks, vouchers } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { channelFromCookie } from "@/lib/channel";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const id = Number((await params).id);
  const [v] = Number.isInteger(id)
    ? await db.select({ id: vouchers.id, url: vouchers.affiliateUrl, platform: vouchers.platform }).from(vouchers).where(eq(vouchers.id, id)).limit(1)
    : [];
  if (!v) return redirectTo("/vouchers");
  const ua = req.headers.get("user-agent") ?? "";
  // Quản trị viên bấm thử: không tính (số liệu lượt bấm / tỉ lệ ra đơn chỉ gồm khách thật)
  const { staff, mark } = await staffRequest(req);
  if (!staff && !/bot|crawl|spider|preview/i.test(ua)) {
    await db.insert(clicks).values({ voucherId: v.id, platform: v.platform, referer: req.headers.get("referer"), channel: channelFromCookie(req.headers.get("cookie")) });
  }
  return markStaff(NextResponse.redirect(v.url, 302), mark);
}
