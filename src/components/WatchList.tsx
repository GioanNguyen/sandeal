"use client";
import { useState } from "react";
import Link from "next/link";
import { vnd } from "@/lib/format";
import { Icon } from "./Icon";

export interface WatchItem {
  id: number;
  targetPrice: number;
  product: { id: number; name: string; price: number; imageUrl: string | null; platform: string };
}

export function WatchList({ initial }: { initial: WatchItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function save(id: number, targetPrice: number) {
    const res = await fetch(`/api/watch/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetPrice }) });
    if (!res.ok) return setError("Không lưu được, thử lại.");
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, targetPrice } : x)));
    setEditing(null);
    setError("");
  }
  async function remove(id: number) {
    const res = await fetch(`/api/watch/${id}`, { method: "DELETE" });
    if (!res.ok) return setError("Không xoá được, thử lại.");
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        Bạn chưa theo dõi sản phẩm nào. Mở một sản phẩm và bấm <b>Theo dõi giá</b> để nhận email khi giá giảm.
        <p><Link className="btn btn-primary" href="/">Xem deal hot</Link></p>
      </div>
    );
  }
  return (
    <>
      {error && <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> {error}</p>}
      <ul className="watch-list">
        {items.map((w) => {
          const reached = w.product.price <= w.targetPrice;
          return (
            <li key={w.id} className="watch-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.product.imageUrl ?? ""} alt="" width={64} height={64} />
              <div className="watch-main">
                <Link href={`/product/${w.product.id}`} className="watch-name">{w.product.name}</Link>
                <div className="watch-prices">
                  <span>Hiện tại <b>{vnd(w.product.price)}</b></span>
                  {editing === w.id ? (
                    <form
                      className="inline-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(w.id, Number(new FormData(e.currentTarget).get("p")));
                      }}
                    >
                      <label className="sr-only" htmlFor={`p-${w.id}`}>Giá mong muốn</label>
                      <input id={`p-${w.id}`} name="p" className="input" type="number" min={1000} step={1000} defaultValue={w.targetPrice} autoFocus />
                      <button className="btn btn-primary">Lưu</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Huỷ</button>
                    </form>
                  ) : (
                    <span>Mục tiêu <b>{vnd(w.targetPrice)}</b></span>
                  )}
                  {reached && <span className="real-drop"><Icon name="check" size={14} /> Đã chạm giá</span>}
                </div>
              </div>
              {editing !== w.id && (
                <div className="watch-actions">
                  <button className="btn btn-ghost" onClick={() => setEditing(w.id)}>Sửa giá</button>
                  <button className="btn btn-ghost icon-btn" aria-label={`Bỏ theo dõi ${w.product.name}`} onClick={() => remove(w.id)}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
