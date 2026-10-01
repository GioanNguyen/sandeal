import { NextResponse } from "next/server";

/**
 * Ghi lại lỗi phía trình duyệt (màn hình "Trang chưa tải được") vào log máy chủ để dò lỗi,
 * vd. lỗi chỉ xảy ra trong trình duyệt của app Facebook/Zalo. Xem: sudo journalctl -u sandeal | grep client-error
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { message?: unknown; digest?: unknown; url?: unknown; stack?: unknown } | null;
  const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").slice(0, n);
  console.warn("[client-error]", JSON.stringify({ message: s(b?.message, 300), digest: s(b?.digest, 40), url: s(b?.url, 200), stack: s(b?.stack, 600), ua: s(req.headers.get("user-agent"), 250) }));
  return NextResponse.json({ ok: true });
}
