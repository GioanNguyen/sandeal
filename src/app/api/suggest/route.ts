import { NextResponse } from "next/server";
import { suggest } from "@/lib/discovery";

/** Gợi ý khi gõ ô tìm kiếm (sản phẩm kèm ảnh, danh mục; ô trống thì từ khoá đang được tìm nhiều) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const data = await suggest(q);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}
