import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/ratelimit";
import { isBotUa, recordVitals, type VitalInput } from "@/lib/vitals";

/** Nhận số đo tốc độ trang từ trình duyệt (navigator.sendBeacon). Không lưu IP; IP chỉ dùng để giới hạn tần suất. */
export async function POST(req: Request) {
  if (isBotUa(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  const text = await req.text().catch(() => "");
  if (text.length > 4000) return new NextResponse(null, { status: 413 });
  let body: { metrics?: VitalInput[] } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const list = Array.isArray(body?.metrics) ? body!.metrics : [];
  if (!list.length) return new NextResponse(null, { status: 204 });
  if (!(await allow(`vitals:${clientIp(req)}`, 120, 600))) return new NextResponse(null, { status: 429 });
  await recordVitals(list);
  return new NextResponse(null, { status: 204 });
}
