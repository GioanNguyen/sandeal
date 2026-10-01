import { NextResponse } from "next/server";
import { recordVariantPrice, variantSummary } from "@/lib/variants";
import { allow, clientIp } from "@/lib/ratelimit";

/**
 * Tiện ích gửi giá của phân loại người dùng đang chọn trên trang sản phẩm (chỉ khi họ bật "Góp giá").
 * Nhận: { url, groups: [{ group, value }], skuId?, price, originalPrice? }.
 * Trả thêm giá thấp nhất 90 ngày của phân loại đó để tiện ích hiện cho người dùng.
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
  if (!(await allow(`var:${ip}`, 120, 600))) {
    return NextResponse.json({ status: "error", error: "Quá nhiều yêu cầu" }, { status: 429, headers: CORS });
  }
  const text = await req.text();
  if (text.length > 4000) return NextResponse.json({ status: "invalid" }, { status: 413, headers: CORS });
  let b: Record<string, unknown>;
  try {
    b = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400, headers: CORS });
  }
  const r = await recordVariantPrice(
    {
      url: String(b.url ?? ""),
      groups: Array.isArray(b.groups) ? (b.groups as { group?: string; value: string }[]) : [],
      skuId: typeof b.skuId === "string" ? b.skuId : undefined,
      price: Number(b.price),
      originalPrice: Number(b.originalPrice) || undefined,
    },
    ip,
  );
  const variant = r.variantId ? await variantSummary(r.variantId) : null;
  return NextResponse.json({ ...r, variant }, { status: r.status === "invalid" ? 400 : 200, headers: CORS });
}
