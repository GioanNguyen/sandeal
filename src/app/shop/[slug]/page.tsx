import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { ShopBadge } from "@/components/Trust";
import { PLATFORMS } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { getShopReport, listShops, type ShopReport } from "@/lib/shops";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const plat = (p: string) => PLATFORMS[p]?.label ?? p;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await getShopReport((await params).slug);
  if (!r) return {};
  const title = `${r.shop.shopName} (${plat(r.shop.platform)}) có giảm giá thật không? Lịch sử giá ${r.tracked} món`;
  const description = `${r.realNow}/${r.available} món của ${r.shop.shopName} đang rẻ hơn giá thường ngày 30 ngày.${
    r.claimed >= 3 ? ` ${r.inflated}/${r.claimed} món ghi % giảm cao hơn mức giảm thật.` : ""
  } Xem deal đang có và lịch sử giá từng món trên Săn Deal.`;
  return {
    title,
    description,
    alternates: { canonical: `/shop/${r.shop.slug}` },
    openGraph: { title, description },
    // Mới theo dõi vài ngày: số liệu chưa nói lên gì, chưa cho Google index
    robots: r.trackedDays < 7 ? { index: false, follow: true } : undefined,
  };
}

/** Các nhận xét chỉ nói điều dữ liệu cho thấy */
function findings(r: ShopReport): string[] {
  const out: string[] = [];
  out.push(
    r.available
      ? `${r.realNow}/${r.available} món đang bán rẻ hơn giá thường ngày của chính món đó trong 30 ngày qua (giảm thật từ 5%).`
      : "Hiện Săn Deal không còn thấy món nào của shop này trên sàn.",
  );
  if (r.claimed >= 3) {
    const share = pct(r.inflated, r.claimed);
    out.push(
      `${r.inflated}/${r.claimed} món có ghi % giảm (từ 10%) cao hơn mức giảm thật từ 20 điểm % trở lên` +
        (share <= 20 ? " – phần lớn % giảm của shop khớp với lịch sử giá." : share >= 50 ? " – nhiều món ghi % giảm cao hơn thực tế, nên xem mức giảm thật trước khi mua." : "."),
    );
  } else {
    out.push("Chưa đủ món có lịch sử từ 14 ngày để so % giảm shop ghi với mức giảm thật.");
  }
  if (r.lastSale) {
    out.push(
      `Đợt ${r.lastSale.name}: ${r.lastSale.real}/${r.lastSale.total} món rẻ hơn giá thường ngày trước sale` +
        (r.lastSale.fake ? `, ${r.lastSale.fake} món tăng giá trong 2 tuần trước rồi “giảm” về mức cũ.` : ", không thấy món nào tăng giá trước sale."),
    );
  }
  return out;
}

export default async function ShopPage({ params }: Props) {
  const r = await getShopReport((await params).slug);
  if (!r) notFound();
  const { shop } = r;
  const others = (await listShops()).filter((s) => s.slug !== shop.slug && s.platform === shop.platform).slice(0, 12);
  const site = siteUrl();
  const list = findings(r);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Deal đang có của ${shop.shopName}`,
    itemListElement: r.deals.slice(0, 10).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}${productPath(p)}`, name: p.name })),
  };

  return (
    <>
      {r.deals.length > 0 && <JsonLd data={jsonLd} />}
      <Breadcrumbs items={[{ name: "Shop", href: "/shop" }, { name: shop.shopName }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> Theo dõi {r.tracked} món{r.trackedDays ? ` · ${r.trackedDays} ngày` : ""}</span>
        <h1 className="page-title">{shop.shopName} trên {plat(shop.platform)}: giảm giá thật hay ảo?</h1>
        <p className="page-sub">
          <ShopBadge type={shop.shopType} /> {r.shopRating ? `Shop ${r.shopRating.toFixed(1)}/5 trên sàn. ` : ""}
          Số liệu dưới đây tính từ lịch sử giá các món của shop mà Săn Deal theo dõi, không phải toàn bộ sản phẩm của shop,
          và chỉ nói về giá – không đánh giá chất lượng hàng hay dịch vụ.
        </p>
      </header>

      <div className="pt-stats">
        <div><span>Món đang giảm thật</span><b>{r.realNow}/{r.available}</b></div>
        {r.claimed >= 3 && <div><span>Ghi % giảm cao hơn thực tế</span><b>{pct(r.inflated, r.claimed)}%</b></div>}
        {r.lastSale && <div><span>Tăng giá trước {r.lastSale.name}</span><b>{r.lastSale.fake}/{r.lastSale.total}</b></div>}
        <div><span>Món đang theo dõi</span><b>{r.tracked}</b></div>
      </div>

      <section className="section" aria-labelledby="find-head">
        <div className="section-head"><h2 id="find-head">Săn Deal thấy gì về giá của shop này</h2></div>
        <ul className="shop-findings">{list.map((t) => <li key={t}>{t}</li>)}</ul>
        {r.lastSale && <p className="muted" style={{ fontSize: 13 }}>Chi tiết đợt sale: <Link href={`/sale/${r.lastSale.slug}`}>{r.lastSale.name}</Link>. “Giảm thật” = rẻ hơn giá thường ngày 30 ngày của chính món đó; “% giảm shop ghi” = so với giá gốc do shop đặt.</p>}
      </section>

      <section className="section" aria-labelledby="deal-head">
        <div className="section-head"><h2 id="deal-head">Deal đang có của {shop.shopName}</h2></div>
        {r.deals.length ? <DealGrid items={r.deals} /> : <p className="muted">Hiện chưa có món nào của shop đang bán.</p>}
      </section>

      {others.length > 0 && (
        <section className="section" aria-labelledby="other-head">
          <div className="section-head"><h2 id="other-head">Shop khác trên {plat(shop.platform)}</h2></div>
          <nav className="chips wrap">{others.map((s) => <Link key={s.slug} className="chip" href={`/shop/${s.slug}`}>{s.shopName} <span className="muted">{s.count}</span></Link>)}</nav>
        </section>
      )}
    </>
  );
}
