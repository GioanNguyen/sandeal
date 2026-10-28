import { randomUUID } from "node:crypto";
import { markStaff, staffRequest } from "@/lib/staff";
import { NextResponse } from "next/server";
import { recordView } from "@/lib/discovery";
import { allow } from "@/lib/ratelimit";
import { isBotUa } from "@/lib/bots";

const COOKIE = "sd_vid";

/**
 * Ghi 1 lượt xem sản phẩm cho khách ẩn danh (mã ngẫu nhiên trong cookie, không gắn với tài khoản/IP).
 * Dùng để tính "Người xem món này cũng xem".
 */
export async function POST(req: Request) {
  const res = new NextResponse(null, { status: 204 });
  // Bot (xem trước link, tìm kiếm…). Trước đây chặn cả chữ "zalo" -> bỏ sót người thật mở trong app Zalo
  if (isBotUa(req.headers.get("user-agent"))) return res;
  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(id) || (id as number) <= 0) return new NextResponse(null, { status: 400 });

  let vid = req.headers.get("cookie")?.match(/(?:^|;\s*)sd_vid=([\w-]{8,64})/)?.[1];
  if (!vid) {
    vid = randomUUID();
    res.cookies.set(COOKIE, vid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400, secure: process.env.NODE_ENV === "production" });
  }
  if (!(await allow(`view:${vid}`, 200, 3600))) return res;
  // Quản trị viên mở thử sản phẩm: không tính lượt xem
  const { staff, mark } = await staffRequest(req);
  if (staff) return markStaff(res, mark);
  await recordView(vid, id as number).catch(() => {}); // sản phẩm không tồn tại -> bỏ qua
  return res;
}
