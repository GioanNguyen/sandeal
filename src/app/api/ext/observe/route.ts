import { NextResponse } from "next/server";
import { recordObservation } from "@/lib/observe";
import { allow, clientIp } from "@/lib/ratelimit";

/**
 * Tiện ích trình duyệt gửi giá người dùng đang thấy trên trang sản phẩm (chỉ khi họ bật "Góp giá").
 * Nhận: { url, name, price, image?, rating? }. Không nhận thông tin cá nhân.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await allow(`obs:${ip}`, 60, 600))) {
    return NextResponse.json({ status: "error", error: "Quá nhiều yêu cầu" }, { status: 429, headers: CORS });
  }
  const text = await req.text();
  if (text.length > 4000) return NextResponse.json({ status: "invalid" }, { status: 413, headers: CORS });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400, headers: CORS });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const r = await recordObservation(
    { url: String(b.url ?? ""), name: typeof b.name === "string" ? b.name : undefined, price: Number(b.price), image: typeof b.image === "string" ? b.image : undefined, rating: Number(b.rating) || undefined },
    ip,
  );
  return NextResponse.json(r, { status: r.status === "invalid" ? 400 : 200, headers: CORS });
}
