import { NextResponse } from "next/server";
import { extensionInfo } from "@/lib/extension-files";

export const dynamic = "force-dynamic";

/** Phiên bản tiện ích mới nhất – để tiện ích tự báo "có bản mới" (chỉ số phiên bản, không có tệp) */
export function GET() {
  const info = extensionInfo();
  return NextResponse.json(info ? { version: info.version } : {}, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
