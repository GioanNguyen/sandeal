import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardImage } from "@/components/CardImage";
import { Countdown } from "@/components/Countdown";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { VoucherTicket } from "@/components/VoucherTicket";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { listActiveVouchers, listDeals } from "@/lib/queries";
import { risingBeforeSale, saleBySlug, salePages, saleReport, saleTitle, type SaleRow } from "@/lib/salepages";
import { FLASH_SLOTS } from "@/lib/sales";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

const vnDate = (d: Date) => d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = saleBySlug((await params).slug);
  if (!s) return {};
  const t = saleTitle(s.event);
  const title = s.state === "past"
    ? `Tổng kết ${t}: món nào giảm thật, món nào tăng giá trước sale?`
    : `${t} (${s.event.start.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}) – đếm ngược, mã giảm giá và món nên chờ`;
  const description = s.state === "past"
    ? `So giá trước và trong ${t} trên Shopee, Lazada, TikTok Shop: danh sách giảm thật và các món tăng giá trước sale, tính từ lịch sử giá.`
    : `Đếm ngược ${t}, khung giờ flash sale, mã giảm giá đang có và những món đang tăng giá trước sale – nên chờ hay mua ngay.`;
  return { title, description, alternates: { canonical: `/sale/${s.slug}` }, openGraph: { title, description } };
}

function Rows({ rows, mode }: { rows: SaleRow[]; mode: "real" | "fake" | "rising" }) {
  return (
    <ol className="srow-list">
      {rows.map(({ product: p, base, peakBefore, low }) => (
        <li key={p.id}>
          <Link href={productPath(p)} className="thumb"><CardImage src={p.imageUrl} alt={p.name} /></Link>
          <Link href={productPath(p)} className="name">{p.name}<small>{PLATFORMS[p.platform]?.label} · giá thường ngày {vnd(base)}</small></Link>
          <span className="num">
            {mode === "real" && <><b>{vnd(low)}</b><span className="down">{pct(low, base)}% thật</span></>}
            {mode === "fake" && <><b>{vnd(low)}</b><span className="up">từng tăng lên {vnd(peakBefore)} (+{pct(peakBefore, base)}%)</span></>}
            {mode === "rising" && <><b>{vnd(low)}</b><span className="up">+{pct(low, base)}% so với trước</span></>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function SalePage({ params }: Props) {
  const s = saleBySlug((await params).slug);
  if (!s) notFound();
  const e = s.event;
  const t = saleTitle(e);
  const now = new Date();
  const [report, rising, deals, vouchers] = await Promise.all([
    s.state !== "upcoming" ? saleReport(e, now) : Promise.resolve(null),
    s.state !== "past" ? risingBeforeSale(now, 8) : Promise.resolve([]),
    s.state !== "past" ? listDeals({ minDrop: 15, page: 1, pageSize: 8 }) : Promise.resolve({ items: [], total: 0 }),
    s.state !== "past" ? listActiveVouchers({ limit: 8 }) : Promise.resolve([]),
  ]);
  const others = salePages(now).filter((x) => x.slug !== s.slug);
  const site = siteUrl();
  const eventLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${t} – Shopee, Lazada, TikTok Shop`,
    startDate: e.start.toISOString(),
    endDate: e.end.toISOString(),
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "VirtualLocation", url: `${site}/sale/${s.slug}` },
    description: e.note,
    organizer: { "@type": "Organization", name: "Các sàn TMĐT (Shopee, Lazada, TikTok Shop)" },
  };

  return (
    <>
      <JsonLd data={eventLd} />
      <Breadcrumbs items={[{ name: "Lịch sale", href: "/lich-sale" }, { name: t }]} />
      <header className="sale-hero">
        <div>
          <h1>{s.state === "past" ? `Tổng kết ${t}` : t}</h1>
          <p>{vnDate(e.start)} · {e.note}</p>
        </div>
        {s.state !== "past" && <Countdown to={e.start.toISOString()} until={e.end.toISOString()} />}
      </header>

      {report && (
        <section className="section" aria-labelledby="rp-head">
          <div className="section-head"><h2 id="rp-head">{s.state === "live" ? "Diễn biến giá đến lúc này" : "Kết quả so giá"}</h2></div>
          {report.total === 0 ? (
            <p className="data-intro">Chưa đủ dữ liệu để tổng kết: Săn Deal cần giá của sản phẩm từ ít nhất 14 ngày trước sale để so sánh. Đợt sale sau sẽ có số liệu đầy đủ.</p>
          ) : (
            <>
              <p className="data-intro">
                Trong <b>{report.total}</b> sản phẩm có lịch sử giá trước sale: <b>{report.real.length}</b> món giảm thật (rẻ hơn giá thường ngày từ 5%),{" "}
                <b>{report.fake.length}</b> món tăng giá trong 2 tuần trước sale rồi “giảm” về mức không rẻ hơn giá cũ, còn lại <b>{report.same}</b> món gần như không đổi.
                Giá thường ngày = giá phổ biến 14–30 ngày trước sale.
              </p>
              <div className="pt-stats">
                <div className="good"><span>Giảm thật</span><b>{report.real.length}</b></div>
                <div className="bad"><span>Tăng trước, giảm sau</span><b>{report.fake.length}</b></div>
                <div><span>Không đổi</span><b>{report.same}</b></div>
              </div>
              {report.real.length > 0 && (<><h3>Giảm thật nhiều nhất</h3><Rows rows={report.real.slice(0, 10)} mode="real" /></>)}
              {report.fake.length > 0 && (<><h3 style={{ marginTop: 24 }}>Tăng giá trước sale</h3><Rows rows={report.fake.slice(0, 10)} mode="fake" /></>)}
            </>
          )}
        </section>
      )}

      {s.state !== "past" && (
        <>
          {rising.length > 0 && (
            <section className="section" aria-labelledby="rs-head">
              <div className="section-head"><h2 id="rs-head"><Icon name="alert" size={20} /> Đang tăng giá trước sale – nên chờ</h2></div>
              <p className="muted">Các món này đắt hơn giá 10–40 ngày trước ít nhất 8%. Nếu “giảm” trong ngày sale, hãy so với giá cũ ở đây trước khi mua.</p>
              <Rows rows={rising} mode="rising" />
            </section>
          )}
          <section className="section" aria-labelledby="dl-head">
            <div className="section-head">
              <h2 id="dl-head"><Icon name="trendingDown" size={20} /> Đang giảm thật – không cần chờ sale</h2>
              <Link href="/?min=15#deals">Xem thêm <Icon name="arrowRight" size={16} /></Link>
            </div>
            <DealGrid items={deals.items} />
          </section>
          {vouchers.length > 0 && (
            <section className="section" aria-labelledby="vc-head">
              <div className="section-head"><h2 id="vc-head"><Icon name="ticket" size={20} /> Mã giảm giá đang có</h2><Link href="/vouchers">Tất cả mã <Icon name="arrowRight" size={16} /></Link></div>
              <div className="tickets strip">{vouchers.map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}</div>
            </section>
          )}
          <section className="section roundup-faq" aria-labelledby="tip-head">
            <div className="section-head"><h2 id="tip-head">Mẹo săn {t}</h2></div>
            <details open><summary>Khung giờ flash sale thường gặp</summary><p>{FLASH_SLOTS.join(", ")} – có thể thay đổi theo sàn và từng đợt. Nên mở app trước khung giờ 5–10 phút.</p></details>
            <details open><summary>Lưu mã trước, thêm hàng vào giỏ từ hôm trước</summary><p>Mã giảm giá lớn thường hết lượt trong vài phút đầu. Lưu mã và để sẵn món trong giỏ để thanh toán nhanh.</p></details>
            <details open><summary>So giá trước khi bấm mua</summary><p>Dán link sản phẩm vào <Link href="/kiem-tra-gia">Kiểm tra giá</Link> để xem món đó có thật sự rẻ hơn ngày thường không.</p></details>
          </section>
        </>
      )}

      {others.length > 0 && (
        <section className="section" aria-labelledby="ot-head">
          <div className="section-head"><h2 id="ot-head">Đợt sale khác</h2></div>
          <nav className="chips wrap">
            {others.map((o) => <Link key={o.slug} className="chip" href={`/sale/${o.slug}`}>{o.state === "past" ? `Tổng kết ${saleTitle(o.event)}` : saleTitle(o.event)}</Link>)}
          </nav>
        </section>
      )}
    </>
  );
}
