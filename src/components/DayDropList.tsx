import Link from "next/link";
import type { DayDrop } from "@/lib/daily";
import { PLATFORMS, vnd } from "@/lib/format";
import { productPath } from "@/lib/slug";
import { CardImage } from "./CardImage";

/** Danh sách lần giảm giá thật trong một ngày */
export function DayDropList({ items, today }: { items: DayDrop[]; today: boolean }) {
  const hm = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <ol className="srow-list">
      {items.map((d) => {
        const p = d.product;
        return (
          <li key={p.id}>
            <Link href={productPath(p)} className="thumb"><CardImage src={p.imageUrl} alt={p.name} /></Link>
            <Link href={productPath(p)} className="name">
              {p.name}
              <small>{PLATFORMS[p.platform]?.label} · giảm lúc {hm(d.at)} từ {vnd(d.before)} · giá thường ngày {vnd(d.usual)}</small>
            </Link>
            <span className="num">
              <b>{vnd(d.price)}</b>
              <span className="down">−{Math.round((1 - d.price / d.usual) * 100)}% thật</span>
              {!today || p.price !== d.price ? (
                <small className="muted" style={{ display: "block", fontSize: 12 }}>{d.gone ? "không còn thấy trên sàn" : `hiện ${vnd(p.price)}`}</small>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
