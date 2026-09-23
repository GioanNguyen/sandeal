import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { median } from "@/lib/score";
import { PLATFORMS, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchForm } from "@/components/WatchForm";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.product.findUnique({
    where: { id: Number(id) || 0 },
    include: { prices: { orderBy: { capturedAt: "asc" }, where: { capturedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } } },
  });
  if (!p) notFound();

  const prices = p.prices.map((x) => x.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const med = prices.length ? median(prices) : p.price;
  const good = p.price <= low || p.realDropPct >= 10;
  const platformLabel = PLATFORMS[p.platform]?.label ?? p.platform;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Deal hot</Link> <span aria-hidden="true">/</span>
        {p.category ? <><Link href={`/?category=${encodeURIComponent(p.category)}`}>{p.category}</Link> <span aria-hidden="true">/</span></> : null}
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

          <div className={`verdict ${good ? "good" : "wait"}`} role="status">
            <Icon name={good ? "shield" : "alert"} size={22} />
            <div>
              <b>{good ? "Giá tốt, có thể mua ngay" : "Chưa phải giá tốt nhất"}</b>
              <p>
                {good
                  ? `Rẻ hơn ${Math.max(0, Math.round(((med - p.price) / med) * 100))}% so với giá trung bình 90 ngày.`
                  : `Từng có giá ${vnd(low)}. Đặt cảnh báo bên dưới để được báo khi giá giảm.`}
              </p>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi"><span>Giá hiện tại</span><b>{vnd(p.price)}</b></div>
            <div className="kpi"><span>Thấp nhất 90 ngày</span><b className="save">{vnd(low)}</b></div>
            <div className="kpi"><span>Giá trung bình</span><b>{vnd(med)}</b></div>
          </div>

          <div className="buy-row">
            <a className="btn btn-primary" href={p.affiliateUrl} target="_blank" rel="nofollow sponsored noopener">
              Mua trên {platformLabel} <Icon name="external" size={16} />
            </a>
            <span className="updated"><Icon name="clock" size={14} /> Cập nhật {p.lastSeenAt.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
          </div>

          <section className="panel" style={{ marginTop: 20 }}>
            <h2><Icon name="trendingDown" /> Lịch sử giá 90 ngày</h2>
            <PriceChart points={p.prices} current={p.price} />
          </section>
          <section className="panel">
            <h2><Icon name="bell" /> Báo tôi khi giá giảm</h2>
            <p className="muted" style={{ margin: 0 }}>Nhận email khi giá xuống bằng hoặc thấp hơn mức bạn đặt. Tối đa 1 email mỗi ngày.</p>
            <WatchForm productId={p.id} suggested={Math.round((low * 0.98) / 1000) * 1000} />
          </section>
        </div>
      </div>
    </>
  );
}
