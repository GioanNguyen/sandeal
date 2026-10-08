/**
 * Thiết bị của quản trị viên: lượt bấm mua / lượt xem từ đây không được tính vào số liệu (quản trị viên hay bấm thử link,
 * mở thử sản phẩm – nếu tính thì "món được bấm nhiều nhất", tỉ lệ ra đơn… bị sai).
 *
 * Nhận ra bằng 2 cách:
 *  - đang đăng nhập tài khoản quản trị
 *  - cookie sd_staff: gắn khi quản trị viên đăng nhập / bấm link, giữ 1 năm – nên kể cả lúc đã đăng xuất (hoặc phiên hết hạn)
 *    trên máy đó vẫn không bị tính. Cookie chỉ có tác dụng "không tính lượt của chính mình", giả mạo cũng không gây hại.
 */
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin, SESSION_COOKIE } from "./auth";
import { siteUrl } from "./mail";

export const STAFF_COOKIE = "sd_staff";

export const staffCookie = () => ({
  name: STAFF_COOKIE,
  value: "1",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && siteUrl().startsWith("https"),
  path: "/",
  maxAge: 365 * 86_400,
});

const hasCookie = (cookieHeader: string | null, name: string) => new RegExp(`(?:^|;\\s*)${name}=`).test(cookieHeader ?? "");

/**
 * { staff, mark }: staff = lượt này của quản trị viên (không tính); mark = nên gắn cookie sd_staff cho thiết bị
 * (đang đăng nhập quản trị mà chưa có cookie). Chỉ tra phiên đăng nhập khi trình duyệt có cookie phiên.
 */
export async function staffRequest(req: Request): Promise<{ staff: boolean; mark: boolean }> {
  const cookie = req.headers.get("cookie");
  if (hasCookie(cookie, STAFF_COOKIE)) return { staff: true, mark: false };
  if (!hasCookie(cookie, SESSION_COOKIE)) return { staff: false, mark: false };
  const user = await getCurrentUser().catch(() => null);
  const admin = !!user && isAdmin(user.email);
  return { staff: admin, mark: admin };
}

/** Gắn cookie sd_staff vào phản hồi khi cần */
export function markStaff<T extends NextResponse>(res: T, mark: boolean): T {
  if (mark) res.cookies.set(staffCookie());
  return res;
}
