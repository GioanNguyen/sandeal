import { redirectTo } from "@/lib/redirect";
import { markStaff, staffRequest } from "@/lib/staff";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { clicks, products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { channelFromCookie } from "@/lib/channel";

/** Ghi nhận lượt bấm rồi chuyển sang link affiliate */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const id = Number((await params).id);
  const [p] = Number.isInteger(id)
    ? await db.select({ id: products.id, url: products.affiliateUrl, platform: products.platform }).from(products).where(eq(products.id, id)).limit(1)
    : [];
  if (!p) return redirectTo("/");
  const ua = req.headers.get("user-agent") ?? "";
  // Quản trị viên bấm thử: không tính (số liệu lượt bấm / tỉ lệ ra đơn chỉ gồm khách thật)
  const { staff, mark } = await staffRequest(req);
  if (!staff && !/bot|crawl|spider|preview/i.test(ua)) {
    await db.insert(clicks).values({ productId: p.id, platform: p.platform, referer: req.headers.get("referer"), channel: channelFromCookie(req.headers.get("cookie")) });
  }
  return markStaff(NextResponse.redirect(p.url, 302), mark);
}
