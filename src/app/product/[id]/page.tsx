import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/mail";
import { compareOffers, getProduct, similarDeals } from "@/lib/queries";
import { CompareTable } from "@/components/CompareTable";
import { timeWeightedMedian } from "@/lib/score";
import { slugify } from "@/lib/slug";
import { DealGrid } from "@/components/DealGrid";
import { PLATFORMS, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchForm } from "@/components/WatchForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ watch?: string; msg?: string; moi?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(Number((await params).id));
  if (!p) return {};
  const title = `${p.name} giá ${vnd(p.price)} – lịch sử giá ${PLATFORMS[p.platform]?.label ?? p.platform}`;
  const description = `Giá hiện tại ${vnd(p.price)}${p.realDropPct >= 1 ? `, rẻ hơn ${Math.round(p.realDropPct)}% so với giá 30 ngày` : ""}. Xem biểu đồ giá 90 ngày và nhận báo khi giá giảm.`;
  return {
    title,
    description,
    alternates: { canonical: `/product/${p.id}` },
    openGraph: { title, description, images: p.imageUrl?.startsWith("http") ? [p.imageUrl] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const [p, user] = await Promise.all([getProduct(Number(id)), getCurrentUser()]);
  if (!p) notFound();
  const [similar, offers] = await Promise.all([similarDeals(p, 5), compareOffers(p)]);

  const prices = p.prices.map((x) => x.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const med = p.prices.length ? timeWeightedMedian(p.prices, new Date()) : p.price;
  const trackedDays = p.prices.length ? (Date.now() - p.prices[0].capturedAt.getTime()) / 86_400_000 : 0;
  const isNewTrack = trackedDays < 7;
  const good = !isNewTrack && (p.price <= low || p.realDropPct >= 10);
  const platformLabel = PLATFORMS[p.platform]?.label ?? p.platform;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: p.imageUrl?.startsWith("http") ? [p.imageUrl] : undefined,
    brand: p.shopName ? { "@type": "Brand", name: p.shopName } : undefined,
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
      url: `${siteUrl()}/product/${p.id}`,
      seller: { "@type": "Organization", name: platformLabel },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Deal hot</Link> <span aria-hidden="true">/</span>
        {p.category ? <><Link href={`/danh-muc/${slugify(p.category)}`}>{p.category}</Link> <span aria-hidden="true">/</span></> : null}
        <span className="muted">{p.name}</span>
      </nav>
      <div className="detail">
        <div className="detail-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl ?? ""} alt={p.name} width={600} height={600} />
        </div>
        <div>
          <div className="buy-row" style={{ margin: 0 }}>
            <PlatformBadge platform={p.platform} inline />
            {p.shopName && <span className="muted">{p.shopName}</span>}
            {p.rating ? <span className="rating muted"><Icon name="star" size={14} />{p.rating.toFixed(1)}</span> : null}
            {p.sold ? <span className="muted">· Đã bán {p.sold.toLocaleString("vi-VN")}</span> : null}
          </div>
          <h1>{p.name}</h1>
          <div className="price-row">
            <span className="price">{vnd(p.price)}</span>
            {p.originalPrice && p.originalPrice > p.price ? (
              <>
                <span className="strike">{vnd(p.originalPrice)}</span>
                <span className="ribbon" style={{ position: "static" }}>-{Math.round(p.discountPct)}%</span>
              </>
            ) : null}
          </div>

          {sp.moi && (
            <p className="form-msg save" role="status"><Icon name="check" size={16} /> Đã thêm sản phẩm vào danh sách theo dõi giá.</p>
          )}
          {isNewTrack ? (
            <div className="verdict wait" role="status">
              <Icon name="clock" size={22} />
              <div>
                <b>Mới bắt đầu theo dõi giá</b>
                <p>
                  Chúng tôi theo dõi sản phẩm này từ {p.prices[0]?.capturedAt.toLocaleDateString("vi-VN") ?? "hôm nay"}, cần khoảng 7 ngày để
                  biết giá hiện tại có thật sự rẻ. Đặt cảnh báo bên dưới để được báo khi giá giảm.
                </p>
              </div>
            </div>
          ) : (
            <div className={`verdict ${good ? "good" : "wait"}`} role="status">
              <Icon name={good ? "shield" : "alert"} size={22} />
              <div>
                <b>{good ? "Giá tốt, có thể mua ngay" : "Chưa phải giá tốt nhất"}</b>
                <p>
                  {good
                    ? `Rẻ hơn ${Math.max(0, Math.round(((med - p.price) / med) * 100))}% so với giá thường ngày (90 ngày qua).`
                    : `Từng có giá ${vnd(low)}. Đặt cảnh báo bên dưới để được báo khi giá giảm.`}
                </p>
                {offers.length >= 2 && offers[0].id !== p.id && (
                  <p>
                    <b>{PLATFORMS[offers[0].platform]?.label}</b> đang bán rẻ hơn {vnd(p.price - offers[0].price)},{" "}
                    <a href={`/product/${offers[0].id}`} style={{ color: "inherit", textDecoration: "underline" }}>xem ngay</a>.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="kpis">
            <div className="kpi"><span>Giá hiện tại</span><b>{vnd(p.price)}</b></div>
            <div className="kpi"><span>Thấp nhất 90 ngày</span><b className="save">{vnd(low)}</b></div>
            <div className="kpi"><span>Giá thường ngày</span><b>{vnd(med)}</b></div>
          </div>

          <div className="buy-row">
            <a className="btn btn-primary" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">
              Mua trên {platformLabel} <Icon name="external" size={16} />
            </a>
            <span className="updated"><Icon name="clock" size={14} /> Cập nhật {p.lastSeenAt.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
          </div>

          {offers.length >= 2 && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2><Icon name="scale" /> So sánh giá giữa các sàn</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ghép tự động theo tên sản phẩm, hãy kiểm tra lại phân loại/phiên bản trước khi mua.</p>
              <CompareTable offers={offers} currentId={p.id} />
            </section>
          )}
          <section className="panel" style={{ marginTop: 20 }}>
            <h2><Icon name="trendingDown" /> Lịch sử giá 90 ngày</h2>
            <PriceChart points={p.prices} current={p.price} />
          </section>
          <section className="panel">
            <h2><Icon name="bell" /> Báo tôi khi giá giảm</h2>
            <p className="muted" style={{ margin: 0 }}>Nhận email khi giá xuống bằng hoặc thấp hơn mức bạn đặt. Tối đa 1 email mỗi ngày.</p>
            <WatchForm productId={p.id} suggested={Math.round((low * 0.98) / 1000) * 1000} userEmail={user?.email} initial={{ status: sp.watch, msg: sp.msg }} />
          </section>
        </div>
      </div>
      {similar.length > 0 && (
        <section className="section" aria-labelledby="sim-head">
          <div className="section-head"><h2 id="sim-head"><Icon name="flame" size={22} /> Deal cùng danh mục</h2></div>
          <DealGrid items={similar} />
        </section>
      )}
    </>
  );
}
