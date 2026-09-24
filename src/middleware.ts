import { NextResponse, type NextRequest } from "next/server";

/** Đường dẫn sản phẩm cũ chỉ có số (/product/12) -> chuyển 301 sang đường dẫn có tên (xử lý ở /api/p/12) */
export function middleware(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/^\/product\/(\d+)\/?$/);
  if (!m) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/api/p/${m[1]}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/product/:id"] };
