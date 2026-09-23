import Link from "next/link";
import type { Product } from "@prisma/client";
import { vnd } from "@/lib/format";
import { PlatformBadge } from "./PlatformBadge";

export function DealCard({ p }: { p: Product }) {
  return (
    <Link href={`/product/${p.id}`} className="card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.imageUrl ?? ""} alt={p.name} loading="lazy" />
      <div className="body">
        <div className="row">
          <PlatformBadge platform={p.platform} />
          <span className={`score ${p.dealScore >= 70 ? "hot" : ""}`}>{Math.round(p.dealScore)} điểm</span>
        </div>
        <div className="name">{p.name}</div>
        <div>
          <span className="price">{vnd(p.price)}</span>
          {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
        </div>
        <div className="meta">
          <span>
            {p.realDropPct > 0 ? <span className="good">−{p.realDropPct}% so với 30 ngày</span> : <span>Giá như thường</span>}
          </span>
          <span>{p.sold ? `Đã bán ${p.sold.toLocaleString("vi-VN")}` : ""}</span>
        </div>
      </div>
    </Link>
  );
}
