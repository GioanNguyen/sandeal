import type { VariantRow } from "@/lib/variants";
import { vnd } from "@/lib/format";
import { Icon } from "./Icon";
import { Sparkline } from "./Sparkline";

function ago(d: Date, now: number) {
  const h = Math.max(1, Math.round((now - d.getTime()) / 3_600_000));
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

/** Bảng "Giá theo phân loại" trên trang sản phẩm (chỉ hiện khi đã ghi nhận được ít nhất 1 phân loại) */
export function VariantPrices({ variants, productPrice, platformLabel }: { variants: VariantRow[]; productPrice: number; platformLabel: string }) {
  if (!variants.length) return null;
  const now = Date.now();
  const cheapest = Math.min(...variants.map((v) => v.price));
  return (
    <section className="panel" id="phan-loai" aria-labelledby="pl-head">
      <h2 id="pl-head"><Icon name="list" /> Giá theo phân loại</h2>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
        Giá {vnd(productPrice)} ở trên thường là phân loại rẻ nhất. Giá từng phân loại được ghi nhận khi xem trang sản phẩm trên {platformLabel}.
      </p>
      <ul className="vp-list">
        {variants.map((v) => {
          const atLow = v.history.length >= 2 && v.price <= v.low90;
          return (
            <li key={v.id} className={v.stale ? "stale" : undefined}>
              <div className="vp-name">
                <b>{v.name}</b>
                <span className="muted">
                  Cập nhật {ago(v.lastSeenAt, now)}
                  {v.stale ? " · có thể đã đổi giá" : ""}
                </span>
              </div>
              <div className="vp-spark">
                {v.history.length >= 2 ? <Sparkline series={v.history} current={v.price} height={28} /> : <span className="muted vp-new">Mới bắt đầu theo dõi</span>}
              </div>
              <div className="vp-price">
                <b className="price">{vnd(v.price)}</b>
                {v.originalPrice && v.originalPrice > v.price ? <s className="muted">{vnd(v.originalPrice)}</s> : null}
                <span className="muted">
                  {atLow ? <span className="save">Thấp nhất 90 ngày</span> : v.history.length >= 2 ? <>Thấp nhất {vnd(v.low90)}</> : null}
                  {v.price === cheapest && variants.length > 1 ? <span className="vp-tag">Rẻ nhất</span> : null}
                </span>
              </div>
              <a className="btn btn-ghost btn-sm vp-watch" href={`?phanloai=${v.id}#theo-doi`} aria-label={`Báo khi ${v.name} giảm giá`}>
                <Icon name="bell" size={14} /> Báo giá
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
