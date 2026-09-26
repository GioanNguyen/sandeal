import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { PriceChart } from "@/components/PriceChart";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { getPriceTopic, priceTopics, topicName } from "@/lib/pricepages";
import { nextSale } from "@/lib/sales";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const vnDate = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const pctDiff = (a: number, b: number) => Math.round((1 - a / b) * 100);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await getPriceTopic((await params).slug);
  if (!d) return {};
  const name = topicName(d.topic);
  const title = `Giá ${name} hôm nay: rẻ nhất ${vnd(d.now.min)} – so sánh Shopee, Lazada, TikTok Shop`;
  const description = `Giá ${name} hôm nay từ ${vnd(d.now.min)} đến ${vnd(d.now.max)} (${d.topic.count} mẫu). Biểu đồ giá thấp nhất ${d.trackedDays >= 7 ? `${Math.min(90, d.trackedDays)} ngày qua` : "từ khi theo dõi"}, sàn nào rẻ nhất và nên mua lúc nào.`;
  return { title, description, alternates: { canonical: `/gia/${d.topic.slug}` }, openGraph: { title, description } };
}

export default async function PriceTopicPage({ params }: Props) {
  const d = await getPriceTopic((await params).slug);
  if (!d) notFound();
  const name = topicName(d.topic);
  const sale = nextSale(new Date(), true);
  const saleDays = Math.ceil((sale.start.getTime() - Date.now()) / 86_400_000);
  const cheapest = d.cheapest[0];
  const updated = new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const others = (await priceTopics()).filter((t) => t.slug !== d.topic.slug).slice(0, 12);

  // Khi nào nên mua: chỉ nói điều dữ liệu cho thấy
  const whenToBuy = d.saleEffect
    ? d.saleEffect.saleAvg < d.saleEffect.normalAvg * 0.97
      ? `Trong dữ liệu của chúng tôi, giá thấp nhất vào ngày sale (${d.saleEffect.sales.join(", ")}) rẻ hơn ngày thường khoảng ${pctDiff(d.saleEffect.saleAvg, d.saleEffect.normalAvg)}%. Nếu chưa gấp, có thể chờ ${sale.name.replace(/ – .*/, "")}${saleDays > 0 ? ` (còn ${saleDays} ngày)` : " (đang diễn ra)"}.`
      : `Trong dữ liệu của chúng tôi, giá ngày sale (${d.saleEffect.sales.join(", ")}) không rẻ hơn ngày thường đáng kể – không nhất thiết phải chờ sale, hãy xem mức giảm thật của từng món.`
    : `Chưa có đợt sale lớn nào nằm trong khoảng dữ liệu nên chưa so được giá ngày sale với ngày thường. Mỗi trang sản phẩm có mục “Nên mua ngay hay chờ?” dựa trên lịch sử giá của chính món đó.`;

  const faq = [
    { q: `Giá ${name} hiện nay bao nhiêu?`, a: `Hôm nay (${updated}) giá ${name} trên các sàn từ ${vnd(d.now.min)} đến ${vnd(d.now.max)}, mức giữa khoảng ${vnd(d.now.median)}, tính trên ${d.topic.count} mẫu Săn Deal đang theo dõi.` },
    ...(d.byPlatform.length > 1
      ? [{ q: `Mua ${name} ở sàn nào rẻ nhất?`, a: d.byPlatform.map((p) => `${PLATFORMS[p.platform]?.label ?? p.platform}: từ ${vnd(p.price)}`).join("; ") + `. Rẻ nhất lúc này là ${PLATFORMS[d.byPlatform[0].platform]?.label ?? d.byPlatform[0].platform}.` }]
      : []),
    ...(d.low90 && d.trackedDays >= 7
      ? [{ q: `Giá ${name} thấp nhất từng ghi nhận là bao nhiêu?`, a: `${vnd(d.low90.price)} vào ngày ${vnDate(d.low90.at)} (trong ${Math.min(90, d.trackedDays)} ngày qua).${d.now.min <= d.low90.price ? " Giá hiện tại đang bằng mức thấp nhất này." : ` Giá rẻ nhất hiện tại cao hơn mức đó ${vnd(d.now.min - d.low90.price)}.`}` }]
      : []),
    { q: `Khi nào nên mua ${name}?`, a: whenToBuy + (d.bestMonth ? ` Theo dữ liệu ${d.bestMonth.months} tháng gần nhất, tháng ${d.bestMonth.month} có giá trung bình thấp nhất.` : "") },
  ];

  const site = siteUrl();
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Giá ${name} hôm nay`,
      itemListElement: d.cheapest.slice(0, 10).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}${productPath(p)}`, name: p.name })),
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ name: "Giá hôm nay", href: "/gia" }, { name: `Giá ${name}` }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> Cập nhật {updated}</span>
        <h1 className="page-title">Giá {name} hôm nay</h1>
        <p className="page-sub">
          Rẻ nhất <b>{vnd(d.now.min)}</b>{cheapest ? <> ({cheapest.name}, {PLATFORMS[cheapest.platform]?.label})</> : null}, cao nhất {vnd(d.now.max)} –
          tổng hợp từ {d.topic.count} mẫu trên Shopee, Lazada và TikTok Shop. Giá lấy từ các sàn, có thể chênh vài nghìn theo phân loại và voucher của shop.
        </p>
      </header>

      <div className="pt-stats">
        <div><span>Rẻ nhất hôm nay</span><b>{vnd(d.now.min)}</b></div>
        <div><span>Mức giữa</span><b>{vnd(d.now.median)}</b></div>
        {d.low90 && d.trackedDays >= 7 ? <div><span>Thấp nhất {Math.min(90, d.trackedDays)} ngày</span><b>{vnd(d.low90.price)}</b></div> : null}
        {d.byPlatform.length > 1 ? <div><span>Sàn rẻ nhất</span><b>{PLATFORMS[d.byPlatform[0].platform]?.label}</b></div> : null}
      </div>

      <section className="section" aria-labelledby="chart-head">
        <div className="section-head"><h2 id="chart-head">Giá {name} rẻ nhất mỗi ngày</h2></div>
        {d.daily.length >= 2 ? (
          <div className="panel"><PriceChart points={d.daily.slice(0, -1)} current={d.now.min} /></div>
        ) : (
          <p className="muted">Săn Deal mới bắt đầu theo dõi nhóm sản phẩm này – biểu đồ sẽ hiện sau vài ngày.</p>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Mỗi điểm là giá thấp nhất trong {d.topic.count} mẫu vào cuối ngày đó (giờ Việt Nam).</p>
      </section>

      <section className="section" aria-labelledby="list-head">
        <div className="section-head"><h2 id="list-head">{name.charAt(0).toUpperCase() + name.slice(1)} giá tốt nhất lúc này</h2></div>
        <DealGrid items={d.cheapest} />
      </section>

      <section className="section roundup-faq" aria-labelledby="faq-head">
        <div className="section-head"><h2 id="faq-head">Câu hỏi thường gặp</h2></div>
        {faq.map((f) => (
          <details key={f.q} open>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {others.length > 0 && (
        <section className="section" aria-labelledby="other-head">
          <div className="section-head"><h2 id="other-head">Giá sản phẩm khác</h2></div>
          <nav className="chips wrap">{others.map((t) => <Link key={t.slug} className="chip" href={`/gia/${t.slug}`}>Giá {topicName(t)}</Link>)}</nav>
        </section>
      )}
    </>
  );
}
