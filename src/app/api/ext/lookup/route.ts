import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/ratelimit";
import { checkLink } from "@/lib/lookup";
import { siteUrl } from "@/lib/mail";
import { productSummary } from "@/lib/summary";

/** API cho tiện ích trình duyệt: dữ liệu công khai, cho phép mọi origin đọc */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!(await allow(`ext:${clientIp(req)}`, 120, 600))) {
    return NextResponse.json({ status: "error", error: "Quá nhiều yêu cầu" }, { status: 429, headers: CORS });
  }
  const r = await checkLink(url);
  if (r.status !== "found") {
    return NextResponse.json({ status: r.status, checkUrl: `${siteUrl()}/kiem-tra-gia?url=${encodeURIComponent(url)}` }, { headers: CORS });
  }
  const s = await productSummary(r.productId);
  return NextResponse.json({ status: "found", ...s }, { headers: CORS });
}
