import { siteUrl } from "@/lib/mail";
import { raiseCsv } from "@/lib/raisecite";
import { raiseReport, saleBySlug, saleTitle } from "@/lib/salepages";

export const dynamic = "force-dynamic";

/** Số liệu tổng hợp của báo cáo nâng giá trước sale (CSV) – để báo chí / người viết bài kiểm tra và trích dẫn */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = saleBySlug((await params).slug);
  if (!s) return new Response("Not found", { status: 404 });
  const r = await raiseReport(s.event, new Date());
  const csv = raiseCsv(r, { title: saleTitle(s.event), url: `${siteUrl()}/nang-gia/${s.slug}` });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="san-deal-nang-gia-${s.slug}.csv"`,
      "Cache-Control": "public, max-age=1800",
    },
  });
}
