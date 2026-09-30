import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardImage } from "@/components/CardImage";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { PriceChart } from "@/components/PriceChart";
import { alternativesFor } from "@/lib/discovery";
import { PLATFORMS, vnd, soldText } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { vnDateLabel } from "@/lib/pricehist";
import { productPath, slugify } from "@/lib/slug";
import { getVersus, parseVersus, versusPath, type VersusSide } from "@/lib/versus";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
const plat = (p: string) => PLATFORMS[p]?.label ?? p;

async function load(slug: string) {
  const ids = parseVersus(slug);
  return ids ? getVersus(ids) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await load((await params).slug);
  if (!v) return {};
  const { a, b } = v;
  const title = `${a.deal.name} hay ${b.deal.name}? So sánh giá và lịch sử giá`;
  const description = `${a.deal.name}: ${vnd(a.deal.price)} (${plat(a.deal.platform)}) · ${b.deal.name}: ${vnd(b.deal.price)} (${plat(b.deal.platform)}). So giá hiện tại, giá thường ngày, mức thấp nhất và nên mua lúc nào.`;
  const thin = a.gone || b.gone || a.advice.trackedDays < 7 || b.advice.trackedDays < 7;
  return {
    title,
    description,
    alternates: { canonical: versusPath(a.deal, b.deal) },
    openGraph: { title, description },
    robots: thin ? { index: false, follow: true } : undefined,
  };
}

type Row = { label: string; val: (s: VersusSide) => number | null; show: (s: VersusSide) => React.ReactNode; better?: "low" | "high" };
const ROWS: Row[] = [
  { label: "Sàn · shop", val: () => null, show: (s) => <>{plat(s.deal.platform)}{s.deal.shopName ? ` · ${s.deal.shopName}` : ""}</> },
  { label: "Giá hiện tại", val: (s) => (s.gone ? null : s.deal.price), show: (s) => (s.gone ? <span className="muted">{vnd(s.deal.price)} (giá lần cuối)</span> : vnd(s.deal.price)), better: "low" },
  { label: "Giá sau mã tốt nhất", val: (s) => (s.gone ? null : s.deal.withVoucher?.price ?? s.deal.price), show: (s) => (s.deal.withVoucher && !s.gone ? vnd(s.deal.withVoucher.price) : <span className="muted">—</span>), better: "low" },
  { label: "Giá thường ngày (30 ngày)", val: () => null, show: (s) => (s.advice.verdict === "new" ? <span className="muted">Chưa đủ dữ liệu</span> : vnd(s.advice.usual)) },
  {
    label: "Giảm thật so với thường ngày",
    // Chưa đủ lịch sử thì không có "giá thường ngày" để so -> không so hàng này
    val: (s) => (s.gone || s.advice.verdict === "new" ? null : Math.max(0, Math.round(s.deal.realDropPct))),
    show: (s) => (s.advice.verdict === "new" ? <span className="muted">Chưa đủ dữ liệu</span> : s.deal.realDropPct >= 1 ? `−${Math.round(s.deal.realDropPct)}%` : <span className="muted">Không giảm</span>),
    better: "high",
  },
  { label: "Thấp nhất từng ghi nhận", val: () => null, show: (s) => <>{vnd(s.advice.low)}{s.advice.lowAt ? <small className="muted"> · {vnDateLabel(s.advice.lowAt.getTime()).slice(0, 5)}</small> : null}</> },
  { label: "Đánh giá trên sàn", val: (s) => s.deal.rating ?? null, show: (s) => (s.deal.rating ? `${s.deal.rating.toFixed(1)}/5` : "—"), better: "high" },
  { label: "Đã bán", val: (s) => s.deal.sold ?? null, show: (s) => (s.deal.sold ? soldText(s.deal.sold) : "—"), better: "high" },
  { label: "Nên mua ngay hay chờ?", val: () => null, show: (s) => (s.gone ? <span className="muted">Không còn thấy trên sàn</span> : s.advice.title) },
  { label: "Đã theo dõi giá", val: () => null, show: (s) => `${Math.floor(s.advice.trackedDays)} ngày` },
];

/** Tóm tắt chỉ dựa trên số liệu */
function summary(a: VersusSide, b: VersusSide): string[] {
  const out: string[] = [];
  if (!a.gone && !b.gone) {
    const [cheap, dear] = a.deal.price <= b.deal.price ? [a, b] : [b, a];
    const diff = dear.deal.price - cheap.deal.price;
    out.push(diff > 0 ? `${cheap.deal.name} đang rẻ hơn ${vnd(diff)} (${Math.round((diff / dear.deal.price) * 100)}%).` : "Hai món đang cùng giá.");
  }
  for (const s of [a, b]) {
    if (s.gone) out.push(`${s.deal.name}: Săn Deal không còn thấy món này trên sàn, giá ở trên là giá lần cuối.`);
    else if (s.advice.verdict !== "new" && s.deal.price <= s.advice.low) out.push(`${s.deal.name} đang ở mức thấp nhất từng ghi nhận.`);
    else if (s.advice.verdict !== "new" && s.deal.realDropPct >= 5) out.push(`${s.deal.name} đang rẻ hơn giá thường ngày ${Math.round(s.deal.realDropPct)}%.`);
    else if (s.advice.verdict !== "new" && s.advice.belowUsualPct <= -5) out.push(`${s.deal.name} đang đắt hơn giá thường ngày ${Math.round(-s.advice.belowUsualPct)}%.`);
  }
  return out;
}

export default async function VersusPage({ params }: Props) {
  const { slug } = await params;
  const v = await load(slug);
  if (!v) notFound();
  const { a, b } = v;
  const canonical = versusPath(a.deal, b.deal);
  if (`/so-sanh/${decodeURIComponent(slug)}` !== canonical) permanentRedirect(canonical);
  const sides = [a, b];
  const [altA, altB] = await Promise.all([alternativesFor(a.deal, 3), alternativesFor(b.deal, 3)]);
  const more = [...altA.map((x) => ({ p: a.deal, q: x })), ...altB.map((x) => ({ p: b.deal, q: x }))]
    .filter(({ q }) => q.id !== a.deal.id && q.id !== b.deal.id)
    .slice(0, 6);
  const updated = new Date().toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const site = siteUrl();
  const cat = a.deal.category!;
  const facts = summary(a, b);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${a.deal.name} hay ${b.deal.name}`,
    itemListElement: sides.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}${productPath(s.deal)}`, name: s.deal.name })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Breadcrumbs items={[{ name: cat, href: `/danh-muc/${slugify(cat)}` }, { name: "So sánh" }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> Giá cập nhật {updated}</span>
        <h1 className="page-title">{a.deal.name} hay {b.deal.name}?</h1>
        <p className="page-sub">
          So sánh giá hiện tại, giá thường ngày và lịch sử giá của hai món cùng loại. Săn Deal chỉ so giá và số liệu sàn công bố,
          không so chất lượng hay thông số – hãy xem mô tả chi tiết trên sàn trước khi chọn.
        </p>
      </header>

      {facts.length > 0 && (
        <section className="section" aria-labelledby="sum-head">
          <div className="section-head"><h2 id="sum-head">Tóm tắt</h2></div>
          <ul className="shop-findings">{facts.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      <section className="section" aria-labelledby="tbl-head">
        <div className="section-head"><h2 id="tbl-head"><Icon name="scale" size={22} /> Bảng so sánh</h2><span className="muted" style={{ fontSize: 13 }}>Ô xanh là tốt hơn</span></div>
        <div className="alt-wrap">
          <table className="alt-table vs-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Tiêu chí</span></th>
                {sides.map((s) => (
                  <th key={s.deal.id} scope="col">
                    <Link href={productPath(s.deal)} className="alt-head">
                      <span className="alt-img"><CardImage src={s.deal.imageUrl} alt={s.deal.name} /></span>
                      <span className="alt-name">{s.deal.name}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const vals = sides.map(r.val);
                const nums = vals.filter((x): x is number => x != null);
                const best = r.better && nums.length === 2 && nums[0] !== nums[1] ? (r.better === "low" ? Math.min(...nums) : Math.max(...nums)) : null;
                return (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {sides.map((s, i) => (
                      <td key={s.deal.id} className={best != null && vals[i] === best ? "best" : undefined}>
                        {r.show(s)}{best != null && vals[i] === best && <Icon name="check" size={13} />}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row"><span className="sr-only">Hành động</span></th>
                {sides.map((s) => (
                  <td key={s.deal.id}>
                    {s.gone ? (
                      <Link className="btn btn-ghost btn-sm" href={productPath(s.deal)}>Xem lịch sử giá</Link>
                    ) : (
                      <a className="btn btn-primary btn-sm" href={`/go/${s.deal.id}`} target="_blank" rel="nofollow sponsored noopener">Xem trên {plat(s.deal.platform)} <Icon name="external" size={13} /></a>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="chart-head">
        <div className="section-head"><h2 id="chart-head">Lịch sử giá 90 ngày</h2></div>
        <div className="vs-charts">
          {sides.map((s) => (
            <div key={s.deal.id} className="panel">
              <h3 className="vs-chart-title"><Link href={productPath(s.deal)}>{s.deal.name}</Link></h3>
              <PriceChart points={s.prices} current={s.deal.price} usual={s.advice.verdict === "new" ? undefined : s.advice.usual} sales={s.advice.sales} />
            </div>
          ))}
        </div>
      </section>

      {more.length > 0 && (
        <section className="section" aria-labelledby="more-head">
          <div className="section-head"><h2 id="more-head">So sánh khác</h2></div>
          <nav className="chips wrap">
            {more.map(({ p, q }) => <Link key={`${p.id}-${q.id}`} className="chip" href={versusPath(p, q)}>{p.name} vs {q.name}</Link>)}
          </nav>
        </section>
      )}
    </>
  );
}
