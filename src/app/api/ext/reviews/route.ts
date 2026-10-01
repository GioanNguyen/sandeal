import { NextResponse } from "next/server";
import { recordReviews } from "@/lib/reviews/store";
import { allow, clientIp } from "@/lib/ratelimit";

/**
 * Tiện ích gửi đánh giá công khai đang hiện trên trang sản phẩm (chỉ khi người dùng bật "Góp giá").
 * Nhận: { url, ratingCount?, starCounts?: [1★..5★], reviews: [{ rating, text?, variant?, date?, media? }] }.
 * Không nhận tên/ảnh người đánh giá hay thông tin gì về người dùng.
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
  if (!(await allow(`rev:${clientIp(req)}`, 40, 600))) {
    return NextResponse.json({ status: "error", error: "Quá nhiều yêu cầu" }, { status: 429, headers: CORS });
  }
  const text = await req.text();
  if (text.length > 80_000) return NextResponse.json({ status: "invalid" }, { status: 413, headers: CORS });
  let body: Record<string, unknown>;
  try {
    body = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400, headers: CORS });
  }
  const r = await recordReviews({
    url: String(body.url ?? ""),
    ratingCount: Number(body.ratingCount) || undefined,
    starCounts: Array.isArray(body.starCounts) ? body.starCounts.map(Number) : undefined,
    reviews: Array.isArray(body.reviews) ? (body.reviews as never[]) : undefined,
  });
  return NextResponse.json(r, { status: r.status === "invalid" ? 400 : 200, headers: CORS });
}
