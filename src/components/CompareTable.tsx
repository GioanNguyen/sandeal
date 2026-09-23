import type { Product } from "@/db/schema";
import { vnd } from "@/lib/format";
import { Icon } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";

/** Bảng giá cùng sản phẩm ở các sàn, sàn rẻ nhất lên đầu */
export function CompareTable({ offers, currentId }: { offers: Product[]; currentId?: number }) {
  const min = offers[0]?.price ?? 0;
  return (
    <div className="table-wrap"><table className="table compare">
      <thead>
        <tr><th>Sàn</th><th className="col-shop">Shop</th><th className="num">Giá</th><th className="num"><span className="sr-only">Mua</span></th></tr>
      </thead>
      <tbody>
        {offers.map((o, i) => (
          <tr key={o.id} className={i === 0 ? "cheapest" : undefined}>
            <td>
              <PlatformBadge platform={o.platform} inline />
              {i === 0 && <span className="real-drop" style={{ marginLeft: 6 }}><Icon name="check" size={13} /> Rẻ nhất</span>}
            </td>
            <td className="muted col-shop">
              {o.id === currentId ? <b>Đang xem</b> : <a href={`/product/${o.id}`}>{o.shopName ?? "Xem chi tiết"}</a>}
              {o.rating ? <span> · <Icon name="star" size={12} /> {o.rating.toFixed(1)}</span> : null}
            </td>
            <td className="num">
              <b>{vnd(o.price)}</b>
              {i > 0 && <div className="muted" style={{ fontSize: 12 }}>+{vnd(o.price - min)}</div>}
            </td>
            <td className="num">
              <a className="btn btn-ghost btn-sm" href={`/go/${o.id}`} target="_blank" rel="nofollow sponsored noopener">Mua <Icon name="external" size={13} /></a>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
