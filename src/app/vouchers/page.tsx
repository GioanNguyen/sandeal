import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORMS } from "@/lib/format";
import { listActiveVouchers } from "@/lib/queries";
import { VoucherTicket } from "@/components/VoucherTicket";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mã giảm giá Shopee, Lazada, TikTok Shop còn hạn hôm nay",
  description: "Tổng hợp mã giảm giá, freeship, hoàn xu còn hạn từ Shopee, Lazada, TikTok Shop. Bấm để chép mã.",
  alternates: { canonical: "/vouchers" },
};

export default async function Vouchers({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const { platform } = await searchParams;
  const now = new Date();
  const vouchers = await listActiveVouchers({ platform });

  return (
    <>
      <h1 className="page-title">Mã giảm giá & khuyến mãi</h1>
      <p className="page-sub">Chỉ hiện mã còn hạn, mã sắp hết hạn xếp trước. Bấm vào mã để chép.</p>
      <nav className="chips" aria-label="Lọc theo sàn" style={{ marginBottom: 20 }}>
        <Link className="chip" href="/vouchers" aria-current={!platform}>Tất cả sàn</Link>
        {Object.entries(PLATFORMS).map(([k, v]) => (
          <Link key={k} className="chip" href={`/vouchers?platform=${k}`} aria-current={platform === k}>
            <span className="dot" style={{ background: v.color }} aria-hidden="true" />{v.label}
          </Link>
        ))}
      </nav>
      {vouchers.length > 0 ? (
        <div className="tickets">
          {vouchers.map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}
        </div>
      ) : (
        <div className="empty">Chưa có mã nào còn hạn cho sàn này.</div>
      )}
    </>
  );
}
