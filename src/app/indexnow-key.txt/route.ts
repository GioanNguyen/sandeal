import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/** Tệp khoá IndexNow: công cụ tìm kiếm đọc tệp này để xác nhận site là của mình trước khi nhận danh sách trang */
export function GET() {
  return new Response(indexNowKey(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
