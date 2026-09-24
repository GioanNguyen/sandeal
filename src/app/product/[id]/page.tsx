import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/mail";
import { calcVouchers, compareOffers, dealsByIds, getProduct, similarDeals, soonestVoucher } from "@/lib/queries";
import { alsoViewed, alternativesFor, cheaperSimilar } from "@/lib/discovery";
import { buyAdvice } from "@/lib/advice";
import { AdviceBox } from "@/components/AdviceBox";
import { CompareAlternatives } from "@/components/CompareAlternatives";
import { UrgencyTimer } from "@/components/UrgencyTimer";
import { bestPlan } from "@/lib/voucher";
import { VoteBox } from "@/components/VoteBox";
import { voteSummary } from "@/lib/community";
import { CompareTable } from "@/components/CompareTable";
import { RecordView } from "@/components/Personal";
import { SaveButton } from "@/components/Saved";
import { ShareButtons } from "@/components/ShareButtons";
import { Freshness, ShopBadge } from "@/components/Trust";
import { productIdFromParam, productPath, slugify } from "@/lib/slug";
import { DealGrid } from "@/components/DealGrid";
import { PLATFORMS, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchForm } from "@/components/WatchForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ watch?: string; msg?: string; moi?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(productIdFromParam((await params).id));
  if (!p) return {};
  const title = `Lịch sử giá ${p.name} – có đang rẻ thật? (${vnd(p.price)}, ${PLATFORMS[p.platform]?.label ?? p.platform})`;
  const description = `Giá hiện tại ${vnd(p.price)}${p.realDropPct >= 1 ? `, rẻ hơn ${Math.round(p.realDropPct)}% so với giá 30 ngày` : ""}. Xem biểu đồ giá 90 ngày và nhận báo khi giá giảm.`;
  return {
    title,
    description,
    alternates: { canonical: productPath(p) },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const [p, user] = await Promise.all([getProduct(productIdFromParam(id)), getCurrentUser()]);
  if (!p) notFound();
  // Đường dẫn cũ /product/12 hoặc tên đã đổi -> chuyển hẳn (301) sang đường dẫn có tên, giữ nguyên tham số
  const canonical = productPath(p);
  if (`/product/${decodeURIComponent(id)}` !== canonical) {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
    permanentRedirect(q ? `${canonical}?${q}` : canonical);
  }
  const [similarAll, offers, pv, votes, cheaper, alsoRaw] = await Promise.all([
    similarDeals(p, 10), compareOffers(p), calcVouchers(p.platform), voteSummary(p.id, user?.id), cheaperSimilar(p, 5), alsoViewed(p.id, 6),
  ]);
  const [alts, [currentRow]] = await Promise.all([alternativesFor(p, 2), dealsByIds([p.id])]);
  // Không lặp lại món đã có ở mục trên, bỏ bản sao cùng sản phẩm ở sàn khác (đã có ở "So sánh giữa các sàn")
  const offerIds = new Set(offers.map((o) => o.id));
  const also = alsoRaw.filter((d) => !offerIds.has(d.id));
  const shown = new Set([...cheaper.map((d) => d.id), ...also.map((d) => d.id)]);
  const similar = similarAll.filter((d) => !shown.has(d.id)).slice(0, 5);
  const expiring = await soonestVoucher(p.platform, 24);
  // Lần giảm giá gần nhất (≥5%) trong lịch sử
  let droppedAt: Date | null = null;
  for (let i = p.prices.length - 1; i > 0; i--) {
    if (p.prices[i].price <= p.prices[i - 1].price * 0.95) { droppedAt = p.prices[i].capturedAt; break; }
  }
  const freshDrop = droppedAt && Date.now() - droppedAt.getTime() < 24 * 3_600_000 ? droppedAt : null;
  const plan = bestPlan({ platform: p.platform, subtotal: p.price, shipping: 30_000 }, pv);
  const afterCodes = p.price - plan.discount - plan.cashback;

  const advice = buyAdvice(p.prices, p.price);
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
      url: `${siteUrl()}${productPath(p)}`,
      seller: { "@type": "Organization", name: platformLabel },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <RecordView id={p.id} price={p.price} category={p.category} />
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
            <ShopBadge type={p.shopType} />
            {p.shopName && <span className="muted">{p.shopName}{p.shopRating ? ` · shop ${p.shopRating.toFixed(1)}/5` : ""}</span>}
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
          <AdviceBox
            a={advice}
            price={p.price}
            buyHref={`/go/${p.id}`}
            buyLabel={`Mua trên ${platformLabel}`}
            cheaperElsewhere={offers.length >= 2 && offers[0].id !== p.id ? { label: PLATFORMS[offers[0].platform]?.label ?? offers[0].platform, save: p.price - offers[0].price, href: productPath(offers[0]) } : null}
          />

          {freshDrop && (
            <p className="fresh-line"><span className="pulse-dot" aria-hidden="true" /> Giá vừa giảm lúc {freshDrop.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })} hôm nay. Giá sàn có thể đổi bất cứ lúc nào.</p>
          )}
          {expiring?.endAt && (
            <div className="expiring">
              <span><b>{expiring.code ? `Mã ${expiring.code}` : expiring.title}</b> {expiring.code ? `· ${expiring.title}` : ""}</span>
              <UrgencyTimer end={expiring.endAt.toISOString()} start={expiring.startAt?.toISOString()} label="Hết hạn sau" endedLabel="Mã đã hết hạn" size="sm" />
            </div>
          )}
          {afterCodes < p.price && (
            <a className="best-price" href={`/tinh-gia?p=${p.id}`}>
              <Icon name="ticket" size={18} />
              <span>Giá sau mã tốt nhất <b>{vnd(afterCodes)}</b>{plan.shipSaved > 0 ? " + freeship" : ""}</span>
              <span className="muted">Xem cách áp mã →</span>
            </a>
          )}

          <div className="buy-row">
            <a className="btn btn-primary" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">
              Mua trên {platformLabel} <Icon name="external" size={16} />
            </a>
            <span className="save-inline"><SaveButton id={p.id} name={p.name} price={p.price} /></span>
            <VoteBox productId={p.id} initial={votes} loggedIn={!!user} />
            <Freshness at={p.lastSeenAt} long />
          </div>

          <ShareButtons url={`${siteUrl()}${productPath(p)}`} title={`${p.name} – ${vnd(p.price)} trên Săn Deal`} />

          {offers.length >= 2 && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2><Icon name="scale" /> So sánh giá giữa các sàn</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ghép tự động theo tên sản phẩm, hãy kiểm tra lại phân loại/phiên bản trước khi mua.</p>
              <CompareTable offers={offers} currentId={p.id} />
            </section>
          )}
          <section className="panel" style={{ marginTop: 20 }}>
            <h2><Icon name="trendingDown" /> Lịch sử giá 90 ngày</h2>
            <PriceChart points={p.prices} current={p.price} usual={advice.verdict === "new" ? undefined : advice.usual} sales={advice.sales} />
          </section>
          <section className="panel" id="theo-doi">
            <h2><Icon name="bell" /> Báo tôi khi giá giảm</h2>
            <p className="muted" style={{ margin: 0 }}>Nhận email khi giá xuống bằng hoặc thấp hơn mức bạn đặt. Tối đa 1 email mỗi ngày.</p>
            <WatchForm productId={p.id} suggested={Math.round((advice.low * 0.98) / 1000) * 1000} userEmail={user?.email} initial={{ status: sp.watch, msg: sp.msg }} />
          </section>
        </div>
      </div>
      <div className="buy-sticky" role="region" aria-label="Mua nhanh">
        <div>
          <b className="price">{vnd(p.price)}</b>
          {expiring?.endAt ? (
            <UrgencyTimer end={expiring.endAt.toISOString()} label="Mã hết hạn sau" endedLabel="Mã đã hết hạn" bar={false} size="sm" />
          ) : afterCodes < p.price ? (
            <span className="muted" style={{ fontSize: 12 }}>Sau mã: {vnd(afterCodes)}</span>
          ) : null}
        </div>
        <a className="btn btn-primary" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">Mua ngay <Icon name="external" size={14} /></a>
      </div>

      {alts.length > 0 && currentRow && <CompareAlternatives current={currentRow} others={alts} />}

      {cheaper.length > 0 && (
        <section className="section" aria-labelledby="cheap-head">
          <div className="section-head">
            <h2 id="cheap-head"><Icon name="trendingDown" size={22} /> Món tương tự rẻ hơn</h2>
            <span className="muted" style={{ fontSize: 13 }}>Cùng danh mục {p.category}, giá thấp hơn {vnd(p.price)}</span>
          </div>
          <DealGrid items={cheaper} />
        </section>
      )}

      {also.length >= 3 && (
        <section className="section" aria-labelledby="also-head">
          <div className="section-head">
            <h2 id="also-head"><Icon name="users" size={22} /> Người xem món này cũng xem</h2>
            <span className="muted" style={{ fontSize: 13 }}>Tính từ lượt xem ẩn danh 30 ngày qua</span>
          </div>
          <DealGrid items={also} />
        </section>
      )}

      {similar.length > 0 && (
        <section className="section" aria-labelledby="sim-head">
          <div className="section-head"><h2 id="sim-head"><Icon name="flame" size={22} /> Deal cùng danh mục</h2></div>
          <DealGrid items={similar} />
        </section>
      )}
    </>
  );
}
