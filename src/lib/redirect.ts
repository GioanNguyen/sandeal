import { NextResponse } from "next/server";

/**
 * Chuyển hướng bằng đường dẫn tương đối (Location: /login?...).
 * Không dựng URL từ req.url: sau nginx/Apache, req.url của Node là http://localhost:3000/...,
 * trình duyệt sẽ bị đẩy sang localhost. Đường dẫn tương đối luôn giữ đúng tên miền người dùng đang mở.
 */
export function redirectTo(path: string, status: 301 | 302 | 303 | 307 | 308 = 307) {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}

/** Trang trước đó (Referer) nhưng chỉ lấy phần đường dẫn, để quay lại cùng trang trên đúng tên miền */
export function refererPath(req: Request, fallback: string) {
  const ref = req.headers.get("referer");
  if (!ref) return fallback;
  try {
    const u = new URL(ref);
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}
