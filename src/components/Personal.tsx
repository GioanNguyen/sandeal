"use client";
import { productPath } from "@/lib/slug";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { LIKES_KEY, readLocal, reviveDeal, VIEWED_KEY, writeLocal, type ViewedItem } from "@/lib/local";
import { vnd } from "@/lib/format";
import { DealCard } from "./DealCard";
import { Icon } from "./Icon";

/** Ghi lại sản phẩm vừa xem (tối đa 20, chỉ lưu trên trình duyệt này) */
export function RecordView({ id, price, category }: { id: number; price: number; category: string | null }) {
  useEffect(() => {
    const list = readLocal<ViewedItem[]>(VIEWED_KEY, []).filter((v) => v.id !== id);
    list.unshift({ id, price, category, at: Date.now() });
    writeLocal(VIEWED_KEY, list.slice(0, 20));
    // Đếm lượt xem ẩn danh cho "Người xem món này cũng xem"
    fetch("/api/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), keepalive: true }).catch(() => {});
  }, [id, price, category]);
  return null;
}

function ago(at: number) {
  const h = Math.round((Date.now() - at) / 3_600_000);
  if (h < 1) return "vừa xong";
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

/** "Bạn vừa xem" kèm thay đổi giá kể từ lúc xem */
export function RecentlyViewed() {
  const [viewed, setViewed] = useState<ViewedItem[]>([]);
  const [items, setItems] = useState<DealRow[] | null>(null);
  useEffect(() => {
    const v = readLocal<ViewedItem[]>(VIEWED_KEY, []);
    setViewed(v);
    if (!v.length) return setItems([]);
    fetch(`/api/deals/by-ids?ids=${v.slice(0, 12).map((x) => x.id).join(",")}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items.map(reviveDeal)))
      .catch(() => setItems([]));
  }, []);
  if (!items?.length) return null;
  const byId = new Map(viewed.map((v) => [v.id, v]));
  const changed = items.filter((p) => byId.get(p.id) && byId.get(p.id)!.price !== p.price).length;

  return (
    <section className="section" aria-labelledby="rv-head">
      <div className="section-head">
        <h2 id="rv-head"><Icon name="eye" size={22} /> Bạn vừa xem{changed ? <span className="live-badge" style={{ marginLeft: 8 }}><span className="pulse-dot" aria-hidden="true" /> {changed} món đổi giá</span> : null}</h2>
        <button type="button" className="link-btn" onClick={() => { writeLocal(VIEWED_KEY, []); setItems([]); }}>Xoá lịch sử</button>
      </div>
      <div className="drop-strip">
        {items.map((p) => {
          const v = byId.get(p.id);
          const diff = v ? p.price - v.price : 0;
          return (
            <Link key={p.id} href={productPath(p)} className={`drop-item${diff < 0 ? " went-down" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl ?? ""} alt="" width={64} height={64} loading="lazy" />
              <span className="drop-info">
                <span className="drop-name">{p.name}</span>
                <b className="price" style={{ fontSize: 16 }}>{vnd(p.price)}</b>
                <span className="drop-meta">
                  {diff < 0 ? <b className="save">↓ {vnd(-diff)} từ lúc bạn xem</b> : diff > 0 ? <span className="warn">↑ {vnd(diff)} từ lúc bạn xem</span> : <>Giá không đổi · {v ? ago(v.at) : ""}</>}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** "Dành cho bạn": deal thuộc các danh mục bạn hay xem (tính trên trình duyệt, không cần đăng nhập) */
export function ForYou() {
  const [state, setState] = useState<{ cats: string[]; items: DealRow[] } | null>(null);
  useEffect(() => {
    const v = readLocal<ViewedItem[]>(VIEWED_KEY, []);
    const count = new Map<string, number>();
    for (const x of v) if (x.category) count.set(x.category, (count.get(x.category) ?? 0) + 1);
    // Món đã lưu ở chế độ "Lướt deal" nói rõ gu hơn 1 lượt xem -> tính gấp đôi
    const likes = readLocal<Record<string, number>>(LIKES_KEY, {});
    for (const [c, n] of Object.entries(likes)) count.set(c, (count.get(c) ?? 0) + n * 2);
    const cats = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
    const signal = [...count.values()].reduce((a, b) => a + b, 0);
    if (signal < 2 || !cats.length) return;
    const q = new URLSearchParams({ cats: cats.join(","), exclude: v.map((x) => x.id).join(","), size: "5", min: "5" });
    fetch(`/api/deals?${q}`)
      .then((r) => r.json())
      .then((d) => setState({ cats, items: d.items.map(reviveDeal) }))
      .catch(() => {});
  }, []);
  if (!state?.items.length) return null;
  return (
    <section className="section foryou" aria-labelledby="fy-head">
      <div className="section-head">
        <h2 id="fy-head"><Icon name="sparkles" size={22} /> Dành cho bạn</h2>
        <span className="muted" style={{ fontSize: 13 }}>Vì bạn hay xem {state.cats.join(", ")}</span>
      </div>
      <div className="grid deal-grid">{state.items.map((p) => <DealCard key={p.id} p={p} />)}</div>
    </section>
  );
}

/**
 * Danh sách deal + cuộn vô hạn trong CÙNG một lưới (trang đầu do máy chủ gửi sẵn trong `initial`),
 * nên hàng cuối của trang đầu không bị hụt ô khi tải thêm. Nút "Xem thêm" là link thật khi chưa có JS.
 */
export function LoadMore({ initial, query, startPage, hasMore: initialMore, nextHref }: { initial: DealRow[]; query: string; startPage: number; hasMore: boolean; nextHref: string }) {
  const [items, setItems] = useState<DealRow[]>(initial);
  const [page, setPage] = useState(startPage);
  const [more, setMore] = useState(initialMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current || !more) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const r = await fetch(`/api/deals?${query}${query ? "&" : ""}page=${page}`);
      const d = await r.json();
      setItems((xs) => {
        const seen = new Set(xs.map((x) => x.id)); // bỏ trùng nếu thứ tự thay đổi giữa hai lần tải
        return [...xs, ...d.items.map(reviveDeal).filter((x: DealRow) => !seen.has(x.id))];
      });
      setMore(d.hasMore);
      setPage((p) => p + 1);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [more, page, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || failed) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && load(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load, more, failed]);

  return (
    <>
      {items.length === 0 ? (
        <div className="empty">Không có deal nào khớp bộ lọc. Thử bỏ bớt điều kiện nhé.</div>
      ) : (
        <div className="grid deal-grid">
          {items.map((p) => <DealCard key={p.id} p={p} />)}
          {loading && Array.from({ length: 5 }, (_, i) => <div key={`sk${i}`} className="deal skeleton-card" aria-hidden="true" />)}
        </div>
      )}
      <div ref={sentinel} className="loadmore">
        {more && !loading && (
          <a href={nextHref} className="btn btn-ghost" onClick={(e) => { e.preventDefault(); load(); }}>
            {failed ? "Lỗi tải, thử lại" : "Xem thêm deal"}
          </a>
        )}
        {!more && items.length > initial.length && <p className="muted">Bạn đã xem hết deal phù hợp.</p>}
      </div>
    </>
  );
}
