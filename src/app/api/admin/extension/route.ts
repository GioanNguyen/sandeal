import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { extensionInfo, extensionZipPath } from "@/lib/extension-files";

export const dynamic = "force-dynamic";

/** Tải tệp cài đặt tiện ích – chỉ quản trị viên */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return new NextResponse("Not found", { status: 404 });
  const file = extensionZipPath();
  if (!fs.existsSync(file)) return new NextResponse("Chưa có tệp – chạy npm run ext:build", { status: 404 });
  const info = extensionInfo();
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${info?.file ?? "san-deal-extension.zip"}"`,
      "Cache-Control": "no-store",
    },
  });
}
