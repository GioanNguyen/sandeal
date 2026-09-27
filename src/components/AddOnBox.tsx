import Link from "next/link";
import type { AddOn } from "@/lib/addon";
import { SHIP_EST } from "@/lib/addon";
import { vnd } from "@/lib/format";
import { productPath } from "@/lib/slug";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";

/** Gợi ý mua kèm cho đủ đơn tối thiểu của mã giảm (số liệu tính từ mã đang còn hạn) */
export function AddOnBox({ price, items }: { price: number; items: AddOn[] }) {
  if (!items.length) return null;
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  return (
    <aside className="addon" aria-labelledby="addon-head">
      <h2 id="addon-head"><Icon name="ticket" size={16} /> Mua kèm cho đủ điều kiện mã giảm</h2>
      <ul>
        {items.map(({ item, voucher, sameShop, together, separate, save }) => (
          <li key={item.id}>
            <Link href={productPath(item)} className="addon-row">
              <span className="thumb"><CardImage src={item.imageUrl} alt={item.name} /></span>
              <span className="addon-main">
                <span className="nm">{item.name}</span>
                <span className="addon-meta">
                  <b>{vnd(item.price)}</b>
                  <span className={`addon-tag${sameShop ? " same" : ""}`}>{sameShop ? "Cùng shop" : `Khác shop · thêm ~${k(SHIP_EST)} ship`}</span>
                </span>
                <span className="addon-why">
                  Đủ đơn {k(voucher.minSpend ?? 0)} để dùng {voucher.code ? <>mã <b>{voucher.code}</b></> : voucher.title} · mua riêng {vnd(separate)}, gộp đơn {vnd(together)}
                </span>
              </span>
              <span className="addon-save">−{k(save)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="addon-note">
        Món đang xem {vnd(price)}. Chỉ đáng mua kèm khi bạn vẫn cần món đó. Tính theo mã đang còn hạn và phí ship ước tính {k(SHIP_EST)}/shop – mã có thể hết lượt, hãy kiểm tra lại trong giỏ hàng.
      </p>
    </aside>
  );
}
