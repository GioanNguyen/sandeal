import { CardImage } from "@/components/CardImage";
import { ProductImage } from "@/components/ProductImage";
import { ShareImageButton } from "@/components/ShareImageButton";
import Link from "next/link";
import { priceTopics, topicName } from "@/lib/pricepages";
import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/mail";
import { calcVouchers, compareOffers, dealsByIds, getProduct, similarDeals, soonestVoucher } from "@/lib/queries";
import { alsoViewed, alternativesFor, cheaperSimilar, recentViewers, VIEWERS_MIN_PAGE } from "@/lib/discovery";
import { buyAdvice } from "@/lib/advice";
import { categorySaleDrop } from "@/lib/saleforecast";
import { hasSaleAlert, setSaleAlert, targetSale } from "@/worker/alerts";
import { SaleAlertButton } from "@/components/SaleAlertButton";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { db } from "@/lib/db";
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
import { PLATFORMS, vnd, soldText } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchForm } from "@/components/WatchForm";
import { AddOnBox } from "@/components/AddOnBox";
import { addOnsFor } from "@/lib/addon";
import { SHOP_MIN_PRODUCTS, shopPath } from "@/lib/shops";
import { and, count } from "drizzle-orm";
import { products } from "@/db/schema";
import { isUnavailable, platformLatest } from "@/lib/availability";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams?: Promise<{ watch?: string; msg?: string; moi?: string; nhacsale?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct(productIdFromParam((await params).id));
  if (!p) return {};
  const title = `Lịch sử giá ${p.name} – có đang rẻ thật? (${vnd(p.price)}, ${PLATFORMS[p.platform]?.label ?? p.platform})`;
  const gone = isUnavailable(p, await platformLatest());
  const description = gone
    ? `Giá ghi nhận lần cuối ${vnd(p.price)}. Săn Deal hiện không còn thấy món này trên sàn – xem lịch sử giá, món tương tự và nhận báo khi có lại.`
    : `Giá hiện tại ${vnd(p.price)}${p.realDropPct >= 1 ? `, rẻ hơn ${Math.round(p.realDropPct)}% so với giá 30 ngày` : ""}. Xem biểu đồ giá 90 ngày và nhận báo khi giá giảm.`;
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
  // Món không còn thấy trên sàn: vẫn giữ trang (lịch sử giá, link cũ, thứ hạng Google) nhưng không mời mua,
  // đưa món tương tự đang bán lên đầu và mời "Báo khi có lại"
  const gone = isUnavailable(p, await platformLatest());
  const [similarAll, offers, pv, votes, cheaper, alsoRaw] = await Promise.all([
    similarDeals(p, gone ? 12 : 10), compareOffers(p), calcVouchers(p.platform), voteSummary(p.id, user?.id), cheaperSimilar(p, 5), alsoViewed(p.id, 6),
  ]);
  const [alts, [currentRow]] = await Promise.all([alternativesFor(p, 2), dealsByIds([p.id])]);
  // Không lặp lại món đã có ở mục trên, bỏ bản sao cùng sản phẩm ở sàn khác (đã có ở "So sánh giữa các sàn")
  const offerIds = new Set(offers.map((o) => o.id));
  const also = alsoRaw.filter((d) => !offerIds.has(d.id));
  // 3 món đầu hiện gọn ngay dưới nút Mua, phần còn lại ở mục cuối trang
  const alsoTop = also.slice(0, 3);
  const alsoRest = also.slice(3);
  const shown = new Set([...cheaper.map((d) => d.id), ...also.map((d) => d.id)]);
  const similar = similarAll.filter((d) => !shown.has(d.id)).slice(0, 5);
  // Khi món vắng: gộp "rẻ hơn" + "cùng danh mục" thành 1 mục ở đầu trang
  const replacements = gone ? [...cheaper, ...similarAll.filter((d) => !cheaper.some((c) => c.id === d.id))].slice(0, 8) : [];
  const vnSeen = new Date(p.lastSeenAt.getTime() + 7 * 3_600_000).toISOString();
  const lastSeen = `${vnSeen.slice(8, 10)}/${vnSeen.slice(5, 7)}`;
  const expiring = await soonestVoucher(p.platform, 24);
  // Lần giảm giá gần nhất (≥5%) trong lịch sử
  let droppedAt: Date | null = null;
  for (let i = p.prices.length - 1; i > 0; i--) {
    if (p.prices[i].price <= p.prices[i - 1].price * 0.95) { droppedAt = p.prices[i].capturedAt; break; }
  }
  const freshDrop = droppedAt && Date.now() - droppedAt.getTime() < 24 * 3_600_000 ? droppedAt : null;
  const plan = bestPlan({ platform: p.platform, subtotal: p.price, shipping: 30_000 }, pv);
  const afterCodes = p.price - plan.discount - plan.cashback;
  const addOns = gone ? [] : await addOnsFor(p, pv);
  // Tên shop dẫn tới trang shop khi shop có đủ món để có trang riêng
  const shopHref = p.shopName
    ? await db.select({ n: count() }).from(products).where(and(eq(products.platform, p.platform), eq(products.shopName, p.shopName)))
        .then(([r]) => (Number(r.n) >= SHOP_MIN_PRODUCTS ? shopPath(p) : null))
    : null;

  const advice = buyAdvice(p.prices, p.price, new Date(), {
    category: p.category ? { name: p.category, drop: await categorySaleDrop(p.category) } : undefined,
  });
  const viewers = (await recentViewers([p.id])).get(p.id) ?? 0;
  // Nhắc khi sale bắt đầu: vừa đăng nhập từ nút "Nhắc tôi" (?nhacsale=1) thì bật luôn
  const sale = targetSale();
  if (user && sale && !sale.live && sp.nhacsale) {
    await setSaleAlert(user.id, p.id, true);
    redirect(productPath(p)); // bỏ ?nhacsale khỏi địa chỉ để tải lại trang không tự bật lại
  }
  const [alertOn, hasPush] = user && sale && !sale.live
    ? await Promise.all([hasSaleAlert(user.id, p.id), db.select({ e: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).limit(1).then((r) => r.length > 0)])
    : [false, false];
  const platformLabel = PLATFORMS[p.platform]?.label ?? p.platform;
  // Trang "Giá [loại] hôm nay" khớp với tên sản phẩm (liên kết nội bộ cho SEO)
  const topic = (await priceTopics()).filter((t) => p.name.toLowerCase().startsWith(t.label.toLowerCase())).sort((a, b) => b.label.length - a.label.length)[0];

  const pageUrl = `${siteUrl()}${productPath(p)}`;
  const imgs = [p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u && u.startsWith("http")).slice(0, 5);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url: pageUrl,
    sku: `${p.platform}-${p.externalId}`,
    image: imgs.length ? imgs : undefined,
    category: p.category ?? undefined,
    description: `${p.name} trên ${platformLabel}: giá hiện tại ${vnd(p.price)}${p.realDropPct >= 1 ? `, rẻ hơn ${Math.round(p.realDropPct)}% so với giá thường ngày 30 ngày qua` : ""}. Xem lịch sử giá và nhận báo khi giá giảm.`,
    // Không khai aggregateRating: sàn chỉ cho điểm sao, không cho số lượt đánh giá – Google yêu cầu cả hai
    // Món không còn thấy trên sàn: không khai giá bán/tình trạng hàng (không biết chắc) thay vì khai sai "còn hàng"
    offers: gone ? undefined : {
      "@type": "Offer",
      url: pageUrl,
      price: p.price,
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: p.shopName ? `${p.shopName} (${platformLabel})` : platformLabel },
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <RecordView id={p.id} price={p.price} category={p.category} />
      <Breadcrumbs items={[...(p.category ? [{ name: p.category, href: `/danh-muc/${slugify(p.category)}` }] : []), { name: p.name }]} />
      <div className="detail">
        <div className="detail-media">
          <ProductImage src={p.imageUrl} images={p.images} alt={p.name} />
        </div>
        <div>
          <div className="buy-row" style={{ margin: 0 }}>
            <PlatformBadge platform={p.platform} inline />
            <ShopBadge type={p.shopType} />
            {p.shopName && <span className="muted">{shopHref ? <Link href={shopHref}>{p.shopName}</Link> : p.shopName}{p.shopRating ? ` · shop ${p.shopRating.toFixed(1)}/5` : ""}</span>}
            {p.rating ? <span className="rating muted"><Icon name="star" size={14} />{p.rating.toFixed(1)}</span> : null}
            {p.sold ? <span className="muted">· Đã bán {soldText(p.sold)}</span> : null}
          </div>
          <h1>{p.name}</h1>
          <div className="price-row">
            {gone && <span className="muted" style={{ fontSize: 14 }}>Giá lần cuối</span>}
            <span className="price">{vnd(p.price)}</span>
            {!gone && p.originalPrice && p.originalPrice > p.price ? (
              <>
                <span className="strike">{vnd(p.originalPrice)}</span>
                <span className="ribbon" style={{ position: "static" }}>-{Math.round(p.discountPct)}%</span>
              </>
            ) : null}
          </div>

          {sp.moi && (
            <p className="form-msg save" role="status"><Icon name="check" size={16} /> Đã thêm sản phẩm vào danh sách theo dõi giá.</p>
          )}
          {gone ? (
            <div className="gone-box" role="status">
              <p className="gone-title"><Icon name="alert" size={18} /> Săn Deal không còn thấy món này trên {platformLabel} từ {lastSeen}</p>
              <p>Có thể món đã hết hàng, ngừng bán hoặc không còn khuyến mãi. Giá ở trên là giá ghi nhận lần cuối, không phải giá đang bán.</p>
              <div className="gone-actions">
                {replacements.length > 0 && <a className="btn btn-primary btn-sm" href="#tuong-tu">Xem {replacements.length} món tương tự đang bán</a>}
                <a className="btn btn-ghost btn-sm" href="#theo-doi"><Icon name="bell" size={14} /> Báo khi có lại</a>
              </div>
            </div>
          ) : (
            <>
            <AdviceBox
              a={advice}
              price={p.price}
              buyHref={`/go/${p.id}`}
              buyLabel={`Mua trên ${platformLabel}`}
              cheaperElsewhere={offers.length >= 2 && offers[0].id !== p.id ? { label: PLATFORMS[offers[0].platform]?.label ?? offers[0].platform, save: p.price - offers[0].price, href: productPath(offers[0]) } : null}
            />

            {sale && !sale.live && sale.days <= 45 && (
              <SaleAlertButton
                productId={p.id}
                saleName={sale.name.replace(/ – .*/, "")}
                days={sale.days}
                initialOn={alertOn}
                loggedIn={!!user}
                loginHref={`/login?next=${encodeURIComponent(`${productPath(p)}?nhacsale=1`)}`}
                pushHint={hasPush}
              />
            )}

            {viewers >= VIEWERS_MIN_PAGE && (
              <p className="view-line page"><Icon name="eye" size={16} /> <b>{viewers} người</b> đã xem món này trong 1 giờ qua</p>
            )}
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
            <AddOnBox price={p.price} items={addOns} />
            </>
          )}

          <div className="buy-row">
            <a className={`btn ${gone ? "btn-ghost" : "btn-primary"}`} href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">
              {gone ? "Kiểm tra trên" : "Mua trên"} {platformLabel} <Icon name="external" size={16} />
            </a>
            <span className="save-inline"><SaveButton id={p.id} name={p.name} price={p.price} /></span>
            <VoteBox productId={p.id} initial={votes} loggedIn={!!user} />
            <Freshness at={p.lastSeenAt} long />
            {p.priceSource === "ext" && (
              <span className="muted" style={{ fontSize: 12 }} title="Giá do người dùng tiện ích Săn Deal ghi nhận khi xem trang sản phẩm trên sàn">
                Giá ghi nhận từ người dùng tiện ích
              </span>
            )}
          </div>

          {alsoTop.length > 0 && (
            <aside className="also-mini" aria-labelledby="also-mini-head">
              <h2 id="also-mini-head"><Icon name="users" size={16} /> Người xem món này cũng săn</h2>
              <ul>
                {alsoTop.map((d) => (
                  <li key={d.id}>
                    <Link href={productPath(d)}>
                      <span className="thumb"><CardImage src={d.imageUrl} alt={d.name} /></span>
                      <span className="nm">{d.name}</span>
                      <span className="pr"><b>{vnd(d.price)}</b>{d.realDropPct >= 5 ? <small>−{Math.round(d.realDropPct)}% thật</small> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <div className="share-line">
            <ShareButtons url={`${siteUrl()}${productPath(p)}`} title={`${p.name} – ${vnd(p.price)} trên Săn Deal`} />
            <ShareImageButton id={p.id} url={`${siteUrl()}${productPath(p)}`} title={`${p.name} – ${vnd(p.price)}${p.realDropPct >= 5 ? `, giảm thật ${Math.round(p.realDropPct)}%` : ""}`} />
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
            <PriceChart points={p.prices} current={p.price} usual={advice.verdict === "new" ? undefined : advice.usual} sales={advice.sales} />
            {topic && (
              <p style={{ margin: "10px 0 0", fontSize: 14 }}>
                <Link href={`/gia/${topic.slug}`}>Xem giá {topicName(topic)} hôm nay trên 3 sàn <Icon name="arrowRight" size={14} /></Link>
              </p>
            )}
          </section>
          <section className="panel" id="theo-doi">
            <h2><Icon name="bell" /> {gone ? "Báo tôi khi món này có lại" : "Báo tôi khi giá giảm"}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {gone
                ? "Săn Deal kiểm tra lại món này mỗi ngày. Khi thấy lại trên sàn, bạn nhận email (và thông báo nếu đã bật) kèm giá mới, dù giá có cao hơn mức bạn đặt."
                : "Nhận email khi giá xuống bằng hoặc thấp hơn mức bạn đặt. Tối đa 1 email mỗi ngày."}
            </p>
            <WatchForm productId={p.id} suggested={Math.round((advice.low * 0.98) / 1000) * 1000} userEmail={user?.email} initial={{ status: sp.watch, msg: sp.msg }} />
          </section>
        </div>
      </div>
      {gone ? (
      <div className="buy-sticky" role="region" aria-label="Món tương tự">
        <div>
          <b className="price">{vnd(p.price)}</b>
          <span className="muted" style={{ fontSize: 12 }}>Giá lần cuối, đã vắng trên sàn</span>
        </div>
        {replacements.length > 0
          ? <a className="btn btn-primary" href="#tuong-tu">Xem món khác</a>
          : <a className="btn btn-primary" href="#theo-doi">Báo khi có lại</a>}
      </div>
      ) : (
      <div className="buy-sticky" role="region" aria-label="Mua nhanh">
        <div>
          <b className="price">{vnd(p.price)}</b>
          {expiring?.endAt ? (
            <UrgencyTimer end={expiring.endAt.toISOString()} label="Mã hết hạn sau" endedLabel="Mã đã hết hạn" bar={false} size="sm" />
          ) : afterCodes < p.price ? (
            <span className="muted" style={{ fontSize: 12 }}>Sau mã: {vnd(afterCodes)}</span>
          ) : null}
        </div>
        <div className="buy-sticky-actions">
          <a className="btn btn-ghost btn-icon" href="#theo-doi" aria-label="Báo khi giá giảm" title="Báo khi giá giảm"><Icon name="bell" size={18} /></a>
          <a className="btn btn-primary" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">Mua ngay <Icon name="external" size={14} /></a>
        </div>
      </div>
      )}

      {gone && replacements.length > 0 && (
        <section className="section" id="tuong-tu" aria-labelledby="repl-head">
          <div className="section-head">
            <h2 id="repl-head"><Icon name="flame" size={22} /> Món tương tự đang bán</h2>
            <span className="muted" style={{ fontSize: 13 }}>Cùng danh mục {p.category}, giá vừa cập nhật từ sàn</span>
          </div>
          <DealGrid items={replacements} />
        </section>
      )}

      {!gone && alts.length > 0 && currentRow && <CompareAlternatives current={currentRow} others={alts} />}

      {!gone && cheaper.length > 0 && (
        <section className="section" aria-labelledby="cheap-head">
          <div className="section-head">
            <h2 id="cheap-head"><Icon name="trendingDown" size={22} /> Món tương tự rẻ hơn</h2>
            <span className="muted" style={{ fontSize: 13 }}>Cùng danh mục {p.category}, giá thấp hơn {vnd(p.price)}</span>
          </div>
          <DealGrid items={cheaper} />
        </section>
      )}

      {alsoRest.length >= 3 && (
        <section className="section" aria-labelledby="also-head">
          <div className="section-head">
            <h2 id="also-head"><Icon name="users" size={22} /> Người xem món này cũng xem</h2>
            <span className="muted" style={{ fontSize: 13 }}>Tính từ lượt xem ẩn danh 30 ngày qua</span>
          </div>
          <DealGrid items={alsoRest} />
        </section>
      )}

      {!gone && similar.length > 0 && (
        <section className="section" aria-labelledby="sim-head">
          <div className="section-head"><h2 id="sim-head"><Icon name="flame" size={22} /> Deal cùng danh mục</h2></div>
          <DealGrid items={similar} />
        </section>
      )}
    </>
  );
}
