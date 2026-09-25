import { NextResponse, type NextRequest } from "next/server";

/**
 * Khoá cả site bằng mật khẩu (HTTP Basic Auth) khi đặt BASIC_AUTH_USER + BASIC_AUTH_PASSWORD trong .env.
 * Dùng khi site đang chạy thử, chưa muốn công khai. Bỏ trống 2 biến này là mở cho mọi người.
 * Trừ /api/ext/*: tiện ích trình duyệt gọi từ trang Shopee/Lazada, không gửi kèm mật khẩu được.
 */
const OPEN_PATHS = [/^\/api\/ext\//];

/** So sánh không lộ thời gian (tránh dò mật khẩu theo độ trễ) */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function checkBasicAuth(req: NextRequest): NextResponse | null {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return null;
  if (OPEN_PATHS.some((re) => re.test(req.nextUrl.pathname))) return null;

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i >= 0) {
        const u = new TextDecoder().decode(Uint8Array.from(decoded.slice(0, i), (c) => c.charCodeAt(0)));
        const p = new TextDecoder().decode(Uint8Array.from(decoded.slice(i + 1), (c) => c.charCodeAt(0)));
        // Tính cả 2 phép so sánh rồi mới kết luận
        const okUser = safeEqual(u, user);
        const okPass = safeEqual(p, pass);
        if (okUser && okPass) return null;
      }
    } catch {
      /* header hỏng -> hỏi lại */
    }
  }
  return new NextResponse("Cần đăng nhập để xem trang này.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${process.env.BASIC_AUTH_REALM || "San Deal"}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export function middleware(req: NextRequest) {
  const denied = checkBasicAuth(req);
  if (denied) return denied;

  // Đường dẫn sản phẩm cũ chỉ có số (/product/12) -> chuyển 301 sang đường dẫn có tên (xử lý ở /api/p/12)
  const m = req.nextUrl.pathname.match(/^\/product\/(\d+)\/?$/);
  if (!m) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/api/p/${m[1]}`;
  return NextResponse.rewrite(url);
}

// Chạy cho mọi đường dẫn (để khoá mật khẩu phủ cả site), trừ file tĩnh của Next và favicon
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
