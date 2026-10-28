/**
 * Lượt bấm "Mua" / "Lấy mã" (/go/<id>, /go/v/<id>): ghi lại rồi chuyển sang link affiliate.
 * Không tính: quản trị viên, bot (xem trước link khi dán vào Facebook / Zalo / Telegram…, bot tìm kiếm, công cụ),
 * trình duyệt tải trước trang (prefetch), yêu cầu HEAD (công cụ kiểm tra link). Ghi kèm mã khách ẩn danh (cookie sd_vid,
 * dùng chung với lượt xem) để đếm số NGƯỜI bấm, không chỉ số lượt.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { clicks } from "@/db/schema";
import { isBotUa, isPrefetch } from "./bots";
import { channelFromCookie } from "./channel";
import { db } from "./db";
import { markStaff, staffRequest } from "./staff";

const VID = /(?:^|;\s*)sd_vid=([\w-]{8,64})/;

export async function trackClickAndRedirect(req: Request, target: string, data: { productId?: number; voucherId?: number; platform: string }) {
  const res = NextResponse.redirect(target, 302);
  if (req.method === "HEAD" || isPrefetch(req.headers) || isBotUa(req.headers.get("user-agent"))) return res;
  const { staff, mark } = await staffRequest(req);
  if (staff) return markStaff(res, mark);
  const cookie = req.headers.get("cookie");
  let visitor = cookie?.match(VID)?.[1];
  if (!visitor) {
    visitor = randomUUID();
    res.cookies.set("sd_vid", visitor, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400, secure: process.env.NODE_ENV === "production" });
  }
  await db.insert(clicks).values({ ...data, referer: req.headers.get("referer"), channel: channelFromCookie(cookie), visitor }).catch((e) => console.error("[go] không ghi được lượt bấm:", (e as Error).message));
  return res;
}
