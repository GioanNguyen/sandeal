import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { brandReport, listBrands } from "@/lib/brands";
import { nextSale } from "@/lib/sales";
import { productPath, slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await brandReport((await params).slug);
  if (!r) return {};
  const n = r.brand.name;
  const title = `Giá ${n} hôm nay: deal ${n} giảm thật trên Shopee, Lazada, TikTok Shop`;
  const description = `${r.count} sản phẩm ${n} từ ${vnd(r.minPrice)}${r.realDeals ? `, ${r.realDeals} món đang rẻ hơn giá thường ngày từ 10%` : ""}${r.bestDrop >= 5 ? ` (giảm thật tới ${Math.round(r.bestDrop)}%)` : ""}. So giá giữa các sàn, xem lịch sử giá trước khi mua.`;
  return { title, description, alternates: { canonical: `/thuong-hieu/${r.brand.slug}` }, openGraph: { title, description } };
}

export default async function BrandPage({ params }: Props) {
  const r = await brandReport((await params).slug);
  if (!r) notFound();
  const n = r.brand.name;
  const updated = new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const sale = nextSale(new Date(), true);
  const saleName = sale.name.replace(/ – .*/, "");
  const saleDays = Math.ceil((sale.start.getTime() - Date.now()) / 86_400_000);
  const cheapestPlatform = [...r.byPlatform].sort((a, b) => a.min - b.min)[0];
  const others = (await listBrands()).filter((b) => b.slug !== r.brand.slug).slice(0, 16);
  const label = (p: string) => PLATFORMS[p]?.label ?? p;

  const faq = [
    { q: `Giá ${n} hôm nay bao nhiêu?`, a: `Săn Deal đang theo dõi ${r.count} sản phẩm ${n} còn bán, giá từ ${vnd(r.minPrice)} đến ${vnd(r.maxPrice)} (cập nhật ${updated}). Giá từng món có thể khác theo phân loại và mã của shop.` },
    {
      q: `${n} có đang giảm giá thật không?`,
      a: r.realDeals
        ? `Có ${r.realDeals} món ${n} đang rẻ hơn giá thường ngày 30 ngày qua từ 10% trở lên, giảm thật nhiều nhất ${Math.round(r.bestDrop)}%. "Giảm thật" so với giá chính món đó thường bán, không so với giá gạch ngang của shop.`
        : `Lúc này chưa có món ${n} nào rẻ hơn giá thường ngày từ 10% trở lên. Bạn có thể đặt báo giá trên từng sản phẩm để được báo khi giá giảm.`,
    },
    ...(r.byPlatform.length > 1
      ? [{ q: `Mua ${n} ở sàn nào rẻ?`, a: `${r.byPlatform.map((p) => `${label(p.platform)}: ${p.n} món, rẻ nhất ${vnd(p.min)}`).join("; ")}. So từng sản phẩm cụ thể ở mục "So sánh giá giữa các sàn" trên trang sản phẩm.` }]
      : []),
    { q: `Có nên chờ sale để mua ${n}?`, a: `${saleName} ${saleDays > 0 ? `còn ${saleDays} ngày` : "đang diễn ra"}. Mỗi trang sản phẩm có mục "Nên mua ngay hay chờ?" dựa trên lịch sử giá và mức giảm ở các đợt sale trước của chính món đó.` },
    ...(r.mall ? [{ q: `Mua ${n} chính hãng ở đâu?`, a: `${r.mall} trong ${r.count} món ${n} Săn Deal theo dõi được bán ở shop chính hãng (Mall). Món rẻ bất thường so với shop chính hãng sẽ có cảnh báo trên trang sản phẩm.` }] : []),
  ];
  const site = siteUrl();
  const ld = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "ItemList", name: `Deal ${n}`, itemListElement: r.deals.slice(0, 10).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}${productPath(p)}`, name: p.name })) },
  ];

  return (
    <>
      <JsonLd data={ld} />
      <Breadcrumbs items={[{ name: "Thương hiệu", href: "/thuong-hieu" }, { name: n }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> Cập nhật {updated}</span>
        <h1 className="page-title">Deal {n} hôm nay</h1>
        <p className="page-sub">
          {r.count} sản phẩm {n} Săn Deal đang theo dõi trên Shopee, Lazada và TikTok Shop, xếp theo mức giảm thật so với giá 30 ngày qua – không theo % giảm shop tự ghi.
        </p>
      </header>

      <div className="pt-stats">
        <div><span>Sản phẩm đang bán</span><b>{r.count}</b></div>
        <div className="good"><span>Giảm thật từ 10%</span><b>{r.realDeals}</b></div>
        <div><span>Rẻ nhất</span><b>{vnd(r.minPrice)}</b></div>
        {r.bestDrop >= 5 ? <div className="good"><span>Giảm thật nhiều nhất</span><b>{Math.round(r.bestDrop)}%</b></div> : null}
      </div>

      {r.byCategory.length > 1 && (
        <nav className="chips wrap" aria-label={`Loại sản phẩm ${n}`} style={{ marginBottom: 8 }}>
          {r.byCategory.map((c) => (
            <Link key={c.category} className="chip" href={`/danh-muc/${slugify(c.category)}`}>{c.category} <span className="muted">{c.n}</span></Link>
          ))}
        </nav>
      )}

      <section className="section" aria-labelledby="deal-head">
        <div className="section-head"><h2 id="deal-head"><Icon name="trendingDown" size={20} /> Deal {n} tốt nhất lúc này</h2></div>
        <DealGrid items={r.deals} />
      </section>

      {r.byPlatform.length > 1 && (
        <section className="section panel" aria-labelledby="plat-head">
          <h2 id="plat-head"><Icon name="scale" /> {n} trên từng sàn</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Sàn</th><th scope="col" className="num">Số món</th><th scope="col" className="num">Rẻ nhất</th><th scope="col" className="num">Giảm thật (giữa)</th></tr></thead>
              <tbody>
                {r.byPlatform.map((p) => (
                  <tr key={p.platform}>
                    <th scope="row"><span className="dot" style={{ background: PLATFORMS[p.platform]?.color, display: "inline-block", width: 10, height: 10, borderRadius: 999, marginRight: 8 }} aria-hidden="true" />{label(p.platform)}</th>
                    <td className="num">{p.n}</td>
                    <td className="num">{p.platform === cheapestPlatform.platform ? <b className="save">{vnd(p.min)}</b> : vnd(p.min)}</td>
                    <td className="num">{Math.round(p.medianDrop)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="cheap-head">
        <div className="section-head"><h2 id="cheap-head">{n} giá rẻ nhất</h2></div>
        <DealGrid items={r.cheapest} />
      </section>

      <section className="section roundup-faq" aria-labelledby="faq-head">
        <div className="section-head"><h2 id="faq-head">Câu hỏi thường gặp về giá {n}</h2></div>
        {faq.map((f) => (
          <details key={f.q} open>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {others.length > 0 && (
        <section className="section" aria-labelledby="other-head">
          <div className="section-head"><h2 id="other-head">Thương hiệu khác</h2><Link href="/thuong-hieu">Tất cả <Icon name="arrowRight" size={16} /></Link></div>
          <nav className="chips wrap">{others.map((b) => <Link key={b.slug} className="chip" href={`/thuong-hieu/${b.slug}`}>{b.name} <span className="muted">{b.count}</span></Link>)}</nav>
        </section>
      )}
    </>
  );
}
