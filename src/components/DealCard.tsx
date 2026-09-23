import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon, type IconName } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";
import { QuickView } from "./QuickView";
import { Sparkline } from "./Sparkline";

export function agoShort(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`;
}

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** Nhãn dễ hiểu thay cho con số điểm (ưu tiên từ trên xuống, chỉ hiện 1 nhãn) */
export function dealLabel(p: DealRow): { text: string; tone: "save" | "hot" | "neutral"; icon: IconName } | null {
  const tracked = (p.trackedDays ?? 0) >= 7;
  if (tracked && p.low30 != null && p.price <= p.low30 && p.realDropPct >= 5) return { text: "Thấp nhất 30 ngày", tone: "save", icon: "trendingDown" };
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
    <article className={`deal${veryFresh ? " deal-fresh" : ""}`}>
      <Link href={`/product/${p.id}`} className="deal-link">
        <div className="deal-media">
          <CardImage src={p.imageUrl} />
          <PlatformBadge platform={p.platform} />
          {fresh && (
            <span className={`fresh-tag${veryFresh ? " live" : ""}`}>
              <span className="pulse-dot" aria-hidden="true" /> Vừa giảm · {agoShort(fresh)}
            </span>
          )}
        </div>
        <div className="deal-body">
          <h3 className="deal-name">{p.name}</h3>
          <div className="price-row">
            <span className="price">{vnd(p.price)}</span>
            {p.discountPct >= 5 && <span className="pct">-{Math.round(p.discountPct)}%</span>}
            {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
          </div>

          {tracked && saving >= 1000 ? (
            <span className="saving" title="So với giá thường ngày trong 30 ngày qua">
              <small><Icon name="shield" size={12} /> Rẻ hơn thường ngày</small>
              <b>{vnd(saving)}</b>
            </span>
          ) : (
            <span className="saving neutral">{tracked ? "Giá như mọi ngày" : "Mới theo dõi giá"}</span>
          )}

          {p.spark && <Sparkline series={p.spark} current={p.price} />}

          {p.cheaperElsewhere && (
            <span className="elsewhere"><Icon name="scale" size={13} /> {PLATFORMS[p.cheaperElsewhere.platform]?.label} rẻ hơn {vnd(p.price - p.cheaperElsewhere.price)}</span>
          )}
          {(p.clicks24 ?? 0) >= 3 && (
            <span className="hot-line"><Icon name="flame" size={13} /> {p.clicks24} lượt bấm mua · 24h</span>
          )}

          <div className="deal-foot">
            <span className="rating">
              {p.rating ? <><Icon name="star" size={13} />{p.rating.toFixed(1)}</> : null}
              {p.sold ? <span>{p.rating ? " · " : ""}Đã bán {p.sold >= 1000 ? `${(p.sold / 1000).toFixed(1).replace(".0", "")}k` : p.sold}</span> : null}
            </span>
            {label && (
              <span className={`deal-label ${label.tone}`} title={`Điểm deal ${score}/100`}>
                <Icon name={label.icon} size={12} /> {label.text}
              </span>
            )}
          </div>
        </div>
      </Link>
      <QuickView id={p.id} name={p.name} />
    </article>
  );
}
