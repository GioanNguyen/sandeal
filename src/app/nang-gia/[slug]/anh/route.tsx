import { siteUrl } from "@/lib/mail";
import { raiseReportImage } from "@/lib/og";
import { GROUP_MIN, raiseReport, saleBySlug, saleTitle } from "@/lib/salepages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ảnh chia sẻ báo cáo nâng giá trước sale (1200×630) – dùng làm ảnh xem trước khi chia sẻ link và cho báo chí */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = saleBySlug((await params).slug);
  if (!s) return new Response("Not found", { status: 404 });
  const r = await raiseReport(s.event, new Date());
  const host = new URL(siteUrl()).host.replace(/^www\./, "");
  const res = await raiseReportImage({
    pct: Math.round(r.rate * 100),
    raised: r.raised.length,
    total: r.total,
    sale: saleTitle(s.event),
    upcoming: s.state === "upcoming",
    cats: r.byCategory.filter((c) => c.total >= GROUP_MIN).slice(0, 3),
    link: `${host}/nang-gia/${s.slug}`,
  });
  res.headers.set("cache-control", "public, max-age=1800");
  return res;
}
