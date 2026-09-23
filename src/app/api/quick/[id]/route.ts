import { NextResponse } from "next/server";
import { productSummary } from "@/lib/summary";

/** Dữ liệu cho cửa sổ Xem nhanh trên thẻ deal */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await productSummary(Number((await params).id));
  if (!s) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(s, { headers: { "Cache-Control": "private, max-age=60" } });
}
