import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardImage } from "@/components/CardImage";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { productPath, slugify } from "@/lib/slug";
import { parseWeek, reportWeeks, weekRangeLabel, weekReport, type WeekItem } from "@/lib/weekly";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

async function load(slug: string) {
  const w = parseWeek(slug);
  return w ? weekReport(w) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).slug);
  if (!r) return {};
  const title = `Báo cáo giá tuần ${r.week.week}/${r.week.year} (${weekRangeLabel(r.week)}): món giảm thật, món tăng giá`;
  const description = `Tuần ${r.week.week}: ${r.drops.length} món giảm từ 10% so với giá thường ngày, ${r.rises.length} món tăng giá từ 8%, ${r.cheaper}/${r.tracked} món rẻ đi. Tính từ lịch sử giá Shopee, Lazada, TikTok Shop.`;
  return { title, description, alternates: { canonical: `/bao-cao-gia/${r.week.slug}` }, openGraph: { title, description }, robots: r.drops.length + r.rises.length < 3 ? { index: false, follow: true } : undefined };
}

function ItemList({ items, kind }: { items: WeekItem[]; kind: "drop" | "rise" }) {
  return (
    <ol className="srow-list">
      {items.map((it) => {
        const p = it.product;
        return (
          <li key={p.id}>
            <Link href={productPath(p)} className="thumb"><CardImage src={p.imageUrl} alt={p.name} /></Link>
            <Link href={productPath(p)} className="name">
              {p.name}
              <small>{PLATFORMS[p.platform]?.label} · giá thường ngày {vnd(it.usual)}</small>
            </Link>
            <span className="num">
              {kind === "drop" ? (
                <><b>{vnd(it.low)}</b><span className="down">−{Math.round((1 - it.low / it.usual) * 100)}% thật</span></>
              ) : (
                <><b>{vnd(it.endPrice)}</b><span className="up">{pct(it.endPrice / it.startPrice - 1)} trong tuần</span></>
              )}
              <small className="muted" style={{ display: "block", fontSize: 12 }}>{it.gone ? "không còn thấy trên sàn" : `hiện ${vnd(p.price)}`}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function WeekPage({ params }: Props) {
  const r = await load((await params).slug);
  if (!r) notFound();
  const { week } = r;
  const all = await reportWeeks(12);
  const idx = all.findIndex((w) => w.slug === week.slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const site = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Báo cáo giá tuần ${week.week}/${week.year}`,
    datePublished: week.start.toISOString(),
    dateModified: (r.live ? new Date() : week.end).toISOString(),
    author: { "@type": "Organization", name: "Săn Deal", url: site },
    publisher: { "@type": "Organization", name: "Săn Deal", url: site },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ name: "Báo cáo giá", href: "/bao-cao-gia" }, { name: `Tuần ${week.week}/${week.year}` }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="calendar" size={14} /> {weekRangeLabel(week)}{r.live ? " · đang cập nhật" : ""}</span>
        <h1 className="page-title">Báo cáo giá tuần {week.week}/{week.year}</h1>
        <p className="page-sub">
          Tổng hợp tự động từ lịch sử giá {r.tracked.toLocaleString("vi-VN")} món Săn Deal theo dõi trên Shopee, Lazada và TikTok Shop.
          “Giá thường ngày” là mức giá phổ biến 30 ngày trước tuần này, không phải giá gạch của shop.
        </p>
      </header>

      <div className="pt-stats">
        <div><span>Lần đổi giá trong tuần</span><b>{r.priceChanges.toLocaleString("vi-VN")}</b></div>
        <div><span>Món rẻ đi</span><b>{r.cheaper}</b></div>
        <div><span>Món đắt lên</span><b>{r.pricier}</b></div>
        <div><span>Giảm ≥10% so với thường ngày</span><b>{r.drops.length}</b></div>
      </div>

      <section className="section" aria-labelledby="drop-head">
        <div className="section-head"><h2 id="drop-head"><Icon name="trendingDown" size={22} /> Giảm thật sâu nhất tuần</h2></div>
        {r.drops.length ? <ItemList items={r.drops} kind="drop" /> : <p className="muted">Tuần này chưa có món nào giảm từ 10% so với giá thường ngày.</p>}
      </section>

      {r.categories.length > 0 && (
        <section className="section" aria-labelledby="cat-head">
          <div className="section-head"><h2 id="cat-head">Theo danh mục</h2></div>
          <div className="alt-wrap">
            <table className="table">
              <thead><tr><th>Danh mục</th><th>Món</th><th>Rẻ đi</th><th>Đắt lên</th><th>Thay đổi giá (trung vị)</th></tr></thead>
              <tbody>
                {r.categories.map((c) => (
                  <tr key={c.name}>
                    <td><Link href={`/danh-muc/${slugify(c.name)}`}>{c.name}</Link></td>
                    <td>{c.n}</td><td>{c.cheaper}</td><td>{c.pricier}</td>
                    <td className={c.medianChange <= -0.01 ? "chg-down" : c.medianChange >= 0.01 ? "chg-up" : undefined}>{Math.abs(c.medianChange) < 0.005 ? "gần như không đổi" : pct(c.medianChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="rise-head">
        <div className="section-head"><h2 id="rise-head">Tăng giá mạnh trong tuần</h2><span className="muted" style={{ fontSize: 13 }}>Nếu định mua, hãy đặt báo giá và chờ</span></div>
        {r.rises.length ? <ItemList items={r.rises} kind="rise" /> : <p className="muted">Không có món nào tăng từ 8% trong tuần.</p>}
      </section>

      <nav className="week-nav" aria-label="Tuần khác">
        {older ? <Link className="btn btn-ghost btn-sm" href={`/bao-cao-gia/${older.slug}`}>← Tuần {older.week}</Link> : <span />}
        {newer ? <Link className="btn btn-ghost btn-sm" href={`/bao-cao-gia/${newer.slug}`}>Tuần {newer.week} →</Link> : <span />}
      </nav>
    </>
  );
}
