import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { PLATFORMS } from "@/lib/format";
import { VOUCHER_PLATFORMS, monthRefs, monthReport, platformLabel } from "@/lib/voucherpages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mã giảm giá Shopee, Lazada, TikTok Shop theo tháng",
  description: "Mã giảm giá, freeship từng tháng của Shopee, Lazada, TikTok Shop kèm lịch sale trong tháng. Tháng này còn hạn, các tháng trước để tham khảo.",
  alternates: { canonical: "/ma-giam-gia" },
};

export default async function VoucherMonths() {
  const now = new Date();
  const refs = monthRefs(now);
  const current = await Promise.all(refs.filter((r) => r.state === "current").map(async (r) => ({ r, rep: await monthReport(r, now) })));
  return (
    <>
      <Breadcrumbs items={[{ name: "Mã giảm giá theo tháng" }]} />
      <h1 className="page-title">Mã giảm giá theo tháng</h1>
      <p className="page-sub">Mã còn hạn và lịch sale từng tháng của mỗi sàn. Muốn xem tất cả mã đang dùng được: <Link href="/vouchers">Mã giảm giá hôm nay</Link>.</p>
      <div className="vm-platforms">
        {current.map(({ r, rep }) => (
          <Link key={r.slug} href={`/ma-giam-gia/${r.slug}`} className="vm-pcard">
            <span className="dot" style={{ background: PLATFORMS[r.platform]?.color }} aria-hidden="true" />
            <b>{platformLabel(r.platform)} tháng {r.m}/{r.y}</b>
            <span className="muted">{rep.list.length} mã còn hạn · {rep.upcoming.length} đợt sale sắp tới</span>
            <span className="vm-go">Xem mã <Icon name="arrowRight" size={14} /></span>
          </Link>
        ))}
      </div>
      {VOUCHER_PLATFORMS.map((p) => (
        <section key={p} className="section" aria-label={platformLabel(p)}>
          <div className="section-head"><h2>{platformLabel(p)}</h2></div>
          <nav className="chips wrap">
            {refs.filter((r) => r.platform === p).map((r) => (
              <Link key={r.slug} className="chip" href={`/ma-giam-gia/${r.slug}`}>
                Tháng {r.m}/{r.y}{r.state === "next" ? " (sắp tới)" : r.state === "past" ? " (lưu trữ)" : ""}
              </Link>
            ))}
          </nav>
        </section>
      ))}
    </>
  );
}
