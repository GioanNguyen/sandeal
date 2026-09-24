"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DealRow } from "@/lib/queries";
import { reviveDeal } from "@/lib/local";
import { vnd } from "@/lib/format";
import { DealCard } from "./DealCard";
import { Icon } from "./Icon";
import { useSaved, type Drop } from "./Saved";

/** Trang "Đã lưu": món vừa giảm lên đầu kèm mức giảm; mở trang xong thì đánh dấu đã xem */
export function SavedList() {
  const { ids, drops, dropsReady, markSeen } = useSaved();
  const { loggedIn } = useSaved();
  const [items, setItems] = useState<DealRow[] | null>(null);
  const [shownDrops, setShownDrops] = useState<Drop[]>([]);
  const done = useRef(false);

  useEffect(() => {
    if (!dropsReady) return; // chờ kiểm tra giá xong để biết món nào vừa giảm
    if (done.current) return;
    if (!ids.length) { setItems([]); return; }
    done.current = true;
    fetch(`/api/deals/by-ids?ids=${ids.slice(0, 60).join(",")}`)
      .then((r) => r.json())
      .then((d) => {
        const list: DealRow[] = d.items.map(reviveDeal);
        setItems(list);
        setShownDrops(drops);
        markSeen(Object.fromEntries(list.map((p) => [p.id, p.price])));
      })
      .catch(() => setItems([]));
  }, [ids, dropsReady, drops, markSeen]);

  if (items === null) return <div className="grid deal-grid">{Array.from({ length: 5 }, (_, i) => <div key={i} className="deal skeleton-card" aria-hidden="true" />)}</div>;

  if (!items.length)
    return (
      <div className="empty saved-empty">
        <Icon name="heart" size={32} />
        <p><b>Chưa có món nào được lưu.</b><br />Bấm ♡ trên thẻ deal, hoặc lướt nhanh và vuốt phải để lưu món bạn thích.</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/luot-deal"><Icon name="sparkles" size={16} /> Lướt deal</Link>
          <Link className="btn btn-ghost" href="/#deals">Xem deal hot</Link>
        </div>
      </div>
    );

  const dropIds = new Map(shownDrops.map((d) => [d.id, d]));
  const sorted = [...items].sort((a, b) => Number(dropIds.has(b.id)) - Number(dropIds.has(a.id)));
  return (
    <>
      {shownDrops.length > 0 && (
        <section className="drop-alert" aria-live="polite">
          <h2><Icon name="trendingDown" size={20} /> {shownDrops.length} món giảm giá kể từ lần trước bạn xem</h2>
          <ul>
            {shownDrops.map((d) => {
              const p = items.find((x) => x.id === d.id);
              return p ? (
                <li key={d.id}>
                  <Link href={`/product/${d.id}`}>{p.name}</Link>
                  <span><s>{vnd(d.from)}</s> → <b>{vnd(d.to)}</b> <em>−{vnd(d.from - d.to)}</em></span>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}
      {!loggedIn && (
        <p className="saved-note"><Icon name="bell" size={16} /> Danh sách này lưu trên trình duyệt. <Link href="/login?next=/da-luu">Đăng nhập</Link> để được báo qua email khi giá giảm và xem trên mọi thiết bị.</p>
      )}
      <p className="result-count">{items.length} món</p>
      <div className="grid deal-grid">{sorted.map((p) => <DealCard key={p.id} p={p} />)}</div>
    </>
  );
}
