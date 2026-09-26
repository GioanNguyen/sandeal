import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Countdown } from "@/components/Countdown";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { VoucherTicket } from "@/components/VoucherTicket";
import { GUIDES, guideBySlug } from "@/lib/guides";
import { siteUrl } from "@/lib/mail";
import { listActiveVouchers, listDeals } from "@/lib/queries";
import { saleBySlug, saleSlug, saleTitle } from "@/lib/salepages";
import { nextSale } from "@/lib/sales";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  return { title: g.title, description: g.description, alternates: { canonical: `/huong-dan/${g.slug}` }, openGraph: { title: g.title, description: g.description, type: "article" } };
}

const vnDate = (s: string) => new Date(`${s}T00:00:00+07:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

export default async function GuidePage({ params }: Props) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const now = new Date();
  const [deals, vouchers] = await Promise.all([
    g.related === "deep" ? listDeals({ minDrop: 20, page: 1, pageSize: 8 }) : Promise.resolve(null),
    g.related === "vouchers" ? listActiveVouchers({ limit: 8 }) : Promise.resolve([]),
  ]);
  const sale = nextSale(now, true);
  const salePage = saleBySlug(saleSlug(sale), now);
  const site = siteUrl();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.published,
    dateModified: g.updated,
    mainEntityOfPage: `${site}/huong-dan/${g.slug}`,
    author: { "@type": "Organization", name: "Săn Deal", url: `${site}/` },
    publisher: { "@type": "Organization", name: "Săn Deal", logo: { "@type": "ImageObject", url: `${site}/icons/icon-512.png` } },
  };

  return (
    <>
      <JsonLd data={ld} />
      <Breadcrumbs items={[{ name: "Hướng dẫn", href: "/huong-dan" }, { name: g.title }]} />
      <article className="guide">
        <h1 className="page-title">{g.title}</h1>
        <p className="muted" style={{ fontSize: 14 }}>Săn Deal · cập nhật {vnDate(g.updated)}</p>
        {g.body}
      </article>

      {deals && deals.items.length > 0 && (
        <section className="section" aria-labelledby="rel-head">
          <div className="section-head"><h2 id="rel-head"><Icon name="trendingDown" size={20} /> Đang giảm thật từ 20% trở lên</h2><Link href="/?min=20#deals">Xem thêm <Icon name="arrowRight" size={16} /></Link></div>
          <DealGrid items={deals.items} />
        </section>
      )}
      {vouchers.length > 0 && (
        <section className="section" aria-labelledby="vc-head">
          <div className="section-head"><h2 id="vc-head"><Icon name="ticket" size={20} /> Mã giảm giá đang có</h2><Link href="/vouchers">Tất cả mã <Icon name="arrowRight" size={16} /></Link></div>
          <div className="tickets strip">{vouchers.map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}</div>
        </section>
      )}
      {g.related === "sales" && (
        <section className="section panel" aria-labelledby="sl-head">
          <h2 id="sl-head"><Icon name="calendar" /> Đợt sale lớn tiếp theo: {saleTitle(sale)}</h2>
          <Countdown to={sale.start.toISOString()} until={sale.end.toISOString()} />
          {salePage && <p style={{ marginTop: 12 }}><Link className="btn btn-primary" href={`/sale/${salePage.slug}`}>Xem món nên chờ và mã giảm giá <Icon name="arrowRight" size={16} /></Link></p>}
        </section>
      )}

      <section className="section" aria-labelledby="more-head">
        <div className="section-head"><h2 id="more-head">Bài hướng dẫn khác</h2></div>
        <div className="guide-list">
          {GUIDES.filter((x) => x.slug !== g.slug).map((x) => (
            <Link key={x.slug} href={`/huong-dan/${x.slug}`} className="guide-card"><h2>{x.title}</h2><p>{x.description}</p></Link>
          ))}
        </div>
      </section>
    </>
  );
}
