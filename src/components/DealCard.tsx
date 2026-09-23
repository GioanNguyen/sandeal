import Link from "next/link";
import type { Product } from "@prisma/client";
import { vnd } from "@/lib/format";
import { Icon } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";

export function DealCard({ p, isLowest = false }: { p: Product; isLowest?: boolean }) {
  const score = Math.round(p.dealScore);
  return (
    <Link href={`/product/${p.id}`} className="deal">
      <div className="deal-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl ?? ""} alt="" loading="lazy" width={400} height={400} />
        <PlatformBadge platform={p.platform} />
        {isLowest && (
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
