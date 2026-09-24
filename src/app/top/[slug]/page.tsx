import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardImage } from "@/components/CardImage";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { SaveButton } from "@/components/Saved";
import { vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { getRoundup, minItems, weekLabel } from "@/lib/roundups";
import { nextSale } from "@/lib/sales";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const r = await getRoundup((await params).slug);
  if (!r) return { title: "Không tìm thấy" };
  const top = r.items[0]?.deal;
  const title = `${r.def.title} (${weekLabel()})`;
  const description = `${r.items.length} ${r.def.subject} đang giảm thật so với giá 30 ngày trên Shopee, Lazada, TikTok Shop${top ? `, rẻ nhất từ ${vnd(Math.min(...r.items.map((i) => i.deal.price)))}` : ""}. Cập nhật liên tục theo giá thật.`;
  return { title, description, alternates: { canonical: `/top/${r.def.slug}` }, openGraph: { title, description } };
}

export default async function RoundupPage({ params }: P) {
  const r = await getRoundup((await params).slug);
  if (!r || r.items.length < minItems(r.def)) notFound();
  const { def, items, related } = r;
  const now = new Date();
  const updated = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  const deepest = [...items].sort((a, b) => b.deal.realDropPct - a.deal.realDropPct)[0].deal;
  const cheapest = [...items].sort((a, b) => a.deal.price - b.deal.price)[0].deal;
  const sale = nextSale(now, true);
  const saleDays = Math.max(0, Math.ceil((sale.start.getTime() - now.getTime()) / 86_400_000));
  const site = siteUrl();

  const faq = [
    { q: `${def.kind === "type" ? `Mẫu ${def.subject}` : "Món"} nào đang giảm sâu nhất?`, a: `${deepest.name} đang rẻ hơn giá thường ngày ${Math.round(deepest.realDropPct)}%, giá hiện tại ${vnd(deepest.price)}.` },
    { q: `Giá rẻ nhất trong danh sách là bao nhiêu?`, a: `${cheapest.name} với giá ${vnd(cheapest.price)}${cheapest.withVoucher ? `, còn ${vnd(cheapest.withVoucher.price)} khi áp mã ${cheapest.withVoucher.code ?? "sàn"}` : ""}.` },
    { q: "Có nên chờ đợt sale tới rồi mới mua?", a: `${sale.name.replace(/ – .*/, "")} ${saleDays <= 0 ? "đang diễn ra" : `còn ${saleDays} ngày`}. Mỗi trang sản phẩm có mục “Nên mua ngay hay chờ?” dựa trên lịch sử giá của chính món đó để bạn quyết định.` },
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: def.title,
      itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}${productPath(it.deal)}`, name: it.deal.name })),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Deal hot</Link> <span aria-hidden="true">/</span> <Link href="/top">Top deal tuần này</Link> <span aria-hidden="true">/</span>
        <span className="muted">{def.title}</span>
      </nav>
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="calendar" size={14} /> {weekLabel(now)} · cập nhật {updated}</span>
        <h1 className="page-title">{def.title}</h1>
        <p className="page-sub">
          Chúng tôi lọc ra <b>{items.length} {def.subject}</b>{def.bandLabel ? ` ${def.bandLabel}` : ""} đang <b>giảm thật</b> so với giá 30 ngày trên Shopee, Lazada và
          TikTok Shop, xếp theo điểm deal (mức giảm thật, đánh giá, lượt bán). Không xếp theo hoa hồng. Mỗi sản phẩm chỉ giữ sàn có deal tốt nhất.
        </p>
      </header>

      <ol className="roundup-list">
        {items.map(({ deal: d, reasons }, i) => (
          <li key={d.id} className={`roundup-item${i === 0 ? " is-top" : ""}`}>
            <span className="roundup-rank" aria-hidden="true">{i + 1}</span>
            <Link href={productPath(d)} className="roundup-media">
              <CardImage src={d.imageUrl} alt={d.name} />
              <PlatformBadge platform={d.platform} />
            </Link>
            <div className="roundup-body">
              {i === 0 && <span className="roundup-badge"><Icon name="trophy" size={13} /> Đáng mua nhất tuần</span>}
              <h2><Link href={productPath(d)}>{d.name}</Link></h2>
              <div className="price-row">
                <span className="price">{vnd(d.price)}</span>
                {d.originalPrice && d.originalPrice > d.price ? <span className="strike">{vnd(d.originalPrice)}</span> : null}
              </div>
              <ul className="roundup-reasons">
                {reasons.map((t) => <li key={t}><Icon name="check" size={14} /> {t}</li>)}
              </ul>
              <div className="roundup-actions">
                <Link href={productPath(d)} className="btn btn-primary btn-sm">Xem lịch sử giá <Icon name="arrowRight" size={14} /></Link>
                <a href={`/go/${d.id}`} className="btn btn-ghost btn-sm" target="_blank" rel="nofollow sponsored noopener">Mua <Icon name="external" size={13} /></a>
              </div>
            </div>
            <SaveButton id={d.id} name={d.name} price={d.price} />
          </li>
        ))}
      </ol>

      <section className="section roundup-faq" aria-labelledby="faq-head">
        <div className="section-head"><h2 id="faq-head">Câu hỏi thường gặp</h2></div>
        {faq.map((f) => (
          <details key={f.q} open>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {related.length > 0 && (
        <section className="section" aria-labelledby="rel-head">
          <div className="section-head"><h2 id="rel-head">Xem thêm</h2></div>
          <nav className="chips wrap">
            {related.map((d) => <Link key={d.slug} className="chip" href={`/top/${d.slug}`}>{d.title}</Link>)}
          </nav>
        </section>
      )}
    </>
  );
}
