import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { reportWeeks, weekRangeLabel } from "@/lib/weekly";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Báo cáo giá hằng tuần: món giảm thật, món tăng giá trên Shopee, Lazada, TikTok Shop",
  description: "Mỗi tuần một báo cáo tự động từ lịch sử giá: món giảm sâu nhất so với giá thường ngày, món tăng giá, danh mục rẻ đi hay đắt lên.",
  alternates: { canonical: "/bao-cao-gia" },
};

export default async function ReportsIndex() {
  const weeks = await reportWeeks(12);
  return (
    <>
      <Breadcrumbs items={[{ name: "Báo cáo giá" }]} />
      <h1 className="page-title">Báo cáo giá hằng tuần</h1>
      <p className="page-sub">Tự động tổng hợp từ lịch sử giá. Tuần hiện tại cập nhật liên tục đến hết Chủ nhật.</p>
      {weeks.length ? (
        <ul className="week-list">
          {weeks.map((w, i) => (
            <li key={w.slug}><Link href={`/bao-cao-gia/${w.slug}`}><b>Tuần {w.week}/{w.year}</b> <span className="muted">{weekRangeLabel(w)}{i === 0 ? " · đang cập nhật" : ""}</span></Link></li>
          ))}
        </ul>
      ) : (
        <p className="muted">Cần ít nhất 2 tuần lịch sử giá để có báo cáo đầu tiên.</p>
      )}
    </>
  );
}
