import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon, type IconName } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";
import { QuickView } from "./QuickView";
import { SaveButton } from "./Saved";
import { Freshness, ShopBadge } from "./Trust";
import { SparkDetail, Sparkline } from "./Sparkline";
import { SparkPeek } from "./SparkPeek";

export function agoShort(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`;
}

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** Nhãn dễ hiểu thay cho con số điểm (ưu tiên từ trên xuống, chỉ hiện 1 nhãn) */
export function dealLabel(p: DealRow): { text: string; tone: "save" | "hot" | "neutral"; icon: IconName } | null {
  const tracked = (p.trackedDays ?? 0) >= 7;
  // Đáy lịch sử đã có ruy băng riêng trên ảnh, không lặp lại nhãn "thấp nhất 30 ngày"
  if (!p.recordLow && tracked && p.low30 != null && p.price <= p.low30 && p.realDropPct >= 5) return { text: "Thấp nhất 30 ngày", tone: "save", icon: "trendingDown" };
  if (p.cheapestAcross && p.cheapestAcross >= 2) return { text: `Rẻ nhất ${p.cheapestAcross} sàn`, tone: "save", icon: "scale" };
  if ((p.communityNet ?? 0) >= 3) return { text: "Cộng đồng chọn", tone: "hot", icon: "thumbUp" };
  if (p.dealScore >= 70) return { text: "Deal tốt", tone: "hot", icon: "flame" };
  return null;
}

export function DealCard({ p }: { p: DealRow; isLowest?: boolean }) {
  const score = Math.round(p.dealScore);
  const fresh = p.droppedAt && Date.now() - p.droppedAt.getTime() < 24 * 3_600_000 ? p.droppedAt : null;
  const veryFresh = fresh && Date.now() - fresh.getTime() < 3 * 3_600_000;
  const tracked = (p.trackedDays ?? 0) >= 7;
  const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.price;
  const saving = round1k(usual - p.price);
  const label = dealLabel(p);

  return (
    <article className={`deal${veryFresh ? " deal-fresh" : ""}${p.recordLow ? " deal-record" : ""}`}>
      <Link href={`/product/${p.id}`} className="deal-link">
        <div className={`deal-media${p.recordLow ? " has-record" : ""}`}>
          <CardImage src={p.imageUrl} hover={p.images?.[0]} />
          <PlatformBadge platform={p.platform} />
          {p.recordLow && (
            <span className="record-ribbon" title={`Thấp nhất từ trước tới nay: giá thấp nhất trong ${Math.floor(p.trackedDays ?? 0)} ngày Săn Deal theo dõi sản phẩm này`}>
              <Icon name="trophy" size={14} /> Giá thấp kỷ lục
            </span>
          )}
          {fresh && (
            <span className={`fresh-tag${veryFresh ? " live" : ""}`} suppressHydrationWarning>
              <span className="pulse-dot" aria-hidden="true" /> Vừa giảm · {agoShort(fresh)}
            </span>
          )}
        </div>
        <div className="deal-body">
          <h3 className="deal-name">{p.name}</h3>
          <span className="shop-line">
            <ShopBadge type={p.shopType} />
            {p.shopName && <span className="shop-name">{p.shopName}</span>}
            <Freshness at={p.lastSeenAt} compact />
          </span>
          <div className="price-row">
            <span className="price">{vnd(p.price)}</span>
            {p.discountPct >= 5 && <span className="pct">-{Math.round(p.discountPct)}%</span>}
            {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
          </div>

          {p.withVoucher && (
            <span className="voucher-line" title={`Mã toàn sàn “${p.withVoucher.title}” – áp dụng khi đơn đủ điều kiện, giá cuối cùng hiển thị lúc thanh toán trên sàn`}>
              <Icon name="ticket" size={14} />
              <span>Chỉ còn <b>{vnd(p.withVoucher.price)}</b> <small>{p.withVoucher.code ? <>với mã <code>{p.withVoucher.code}</code></> : "với mã sàn"}</small></span>
            </span>
          )}

          {tracked && saving >= 1000 ? (
            <span className="saving" title="So với giá thường ngày trong 30 ngày qua">
              <small><Icon name="shield" size={12} /> Rẻ hơn thường ngày</small>
              <b>{vnd(saving)}</b>
            </span>
          ) : (
            <span className="saving neutral">{tracked ? "Giá như mọi ngày" : "Mới theo dõi giá"}</span>
          )}

          {p.spark && (
            <SparkPeek detail={<SparkDetail series={p.spark} current={p.price} allTimeLow={p.allTimeLow} />}>
              <Sparkline series={p.spark} current={p.price} />
            </SparkPeek>
          )}

          {p.cheaperElsewhere && (
            <span className="elsewhere"><Icon name="scale" size={13} /> {PLATFORMS[p.cheaperElsewhere.platform]?.label} rẻ hơn {vnd(p.price - p.cheaperElsewhere.price)}</span>
          )}
          {(p.clicks24 ?? 0) >= 3 && (
            <span className="hot-line"><Icon name="flame" size={13} /> {p.clicks24} lượt bấm mua · 24h</span>
          )}

          {(p.communityNote || (p.communityUp ?? 0) >= 2) && (
            <span className="cm-line">
              <Icon name="users" size={13} />
              <span>
                {p.communityNote && <q>{p.communityNote}</q>}
                {p.communityNote && (p.communityUp ?? 0) >= 1 ? " · " : ""}
                {(p.communityUp ?? 0) >= 1 && <b>{p.communityUp} người thấy hot</b>}
              </span>
            </span>
          )}

          <div className="deal-foot">
            <span className="rating">
              {p.rating ? <><Icon name="star" size={13} />{p.rating.toFixed(1)}</> : null}
              {p.sold ? <span>{p.rating ? " · " : ""}{p.sold >= 1000 ? `${(p.sold / 1000).toFixed(1).replace(".0", "")}k` : p.sold} đã bán</span> : null}
            </span>
            {label && (
              <span className={`deal-label ${label.tone}`} title={`Điểm deal ${score}/100`}>
                <Icon name={label.icon} size={12} /> {label.text}
              </span>
            )}
          </div>
        </div>
      </Link>
      <SaveButton id={p.id} name={p.name} price={p.price} />
      <QuickView id={p.id} name={p.name} />
    </article>
  );
}
