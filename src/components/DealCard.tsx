import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { vnd } from "@/lib/format";
import { Icon } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";

export function agoShort(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`;
}

export function DealCard({ p, isLowest = false }: { p: DealRow; isLowest?: boolean }) {
  const score = Math.round(p.dealScore);
  const fresh = p.droppedAt && Date.now() - p.droppedAt.getTime() < 24 * 3_600_000 ? p.droppedAt : null;
  const veryFresh = fresh && Date.now() - fresh.getTime() < 3 * 3_600_000;
  return (
    <Link href={`/product/${p.id}`} className={`deal${veryFresh ? " deal-fresh" : ""}`}>
      <div className="deal-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl ?? ""} alt="" loading="lazy" width={400} height={400} />
        <PlatformBadge platform={p.platform} />
        {fresh && (
          <span className={`fresh-tag${veryFresh ? " live" : ""}`}>
            <span className="pulse-dot" aria-hidden="true" /> Vừa giảm · {agoShort(fresh)}
          </span>
        )}
        {isLowest && !fresh && (
          <span className="lowest-tag"><Icon name="trendingDown" size={14} /> Thấp nhất 30 ngày</span>
        )}
      </div>
      <div className="deal-body">
        <h3 className="deal-name" style={{ margin: 0, fontWeight: 500 }}>{p.name}</h3>
        <div className="price-row">
          <span className="price">{vnd(p.price)}</span>
          {p.discountPct >= 5 && <span className="pct">-{Math.round(p.discountPct)}%</span>}
        </div>
        {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
        {p.realDropPct >= 1 ? (
          <span className="real-drop" title="So với giá trung bình 30 ngày qua"><Icon name="shield" size={14} /> Giảm thật {Math.round(p.realDropPct)}%</span>
        ) : (
          <span className="real-drop neutral">Giá như mọi ngày</span>
        )}
        {(p.clicks24 ?? 0) >= 3 && (
          <span className="hot-line"><Icon name="flame" size={13} /> {p.clicks24} lượt bấm mua · 24h</span>
        )}
        <div className="deal-foot">
          <span className="rating">
            {p.rating ? <><Icon name="star" size={13} />{p.rating.toFixed(1)}</> : null}
            {p.sold ? <span>{p.rating ? " · " : ""}Đã bán {p.sold >= 1000 ? `${(p.sold / 1000).toFixed(1).replace(".0", "")}k` : p.sold}</span> : null}
          </span>
          <span className={`score-pill${score >= 70 ? " hot" : ""}`} title="Điểm deal (0–100)">
            {score}<span className="sr-only"> điểm deal trên 100</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
