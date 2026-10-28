import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanPath, leavePresence, sourceOf, touchPresence } from "@/lib/presence";
import { staffRequest } from "@/lib/staff";
import { isBotUa } from "@/lib/bots";

const COOKIE = "sd_vid";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Trình duyệt báo "đang xem trang này" (~30 giây/lần, khi tab đang mở) hoặc "đã rời" (leave) – để Quản trị › Thống kê
 * hiện số người đang online. Dùng chung mã khách ẩn danh sd_vid với lượt xem sản phẩm. Không lưu IP, không ghi CSDL.
 */
export async function POST(req: Request) {
  const res = new NextResponse(null, { status: 204, headers: NO_STORE });
  const ua = req.headers.get("user-agent");
  if (isBotUa(ua)) return res;
  const text = await req.text().catch(() => "");
  if (text.length > 2000) return new NextResponse(null, { status: 413 });
  let body: { path?: unknown; title?: unknown; ref?: unknown; leave?: unknown } = {};
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  let vid = req.headers.get("cookie")?.match(/(?:^|;\s*)sd_vid=([\w-]{8,64})/)?.[1];
  if (body.leave) {
    if (vid) leavePresence(vid);
    return res;
  }
  const path = cleanPath(body.path);
  if (!path) return new NextResponse(null, { status: 400 });
  // Quản trị viên: không tính (giống lượt xem, lượt bấm)
  if ((await staffRequest(req)).staff) return res;
  if (!vid) {
    vid = randomUUID();
    res.cookies.set(COOKIE, vid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400, secure: process.env.NODE_ENV === "production" });
  }
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  touchPresence(vid, {
    path,
    title: typeof body.title === "string" ? body.title.replace(/\s*\|\s*Săn Deal\s*$/, "").trim() : "",
    device: /Mobi|Android|iPhone|iPad/i.test(ua ?? "") ? "mobile" : "desktop",
    source: sourceOf(body.ref, host),
  });
  return res;
}
