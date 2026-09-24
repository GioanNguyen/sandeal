"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DealRow } from "@/lib/queries";
import { LIKES_KEY, readLocal, reviveDeal, SWIPED_KEY, writeLocal } from "@/lib/local";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";
import { useSaved } from "./Saved";

const THRESHOLD = 90;
const round1k = (n: number) => Math.round(n / 1000) * 1000;

type Swiped = { id: number; dir: "like" | "skip" };

/**
 * Lướt deal kiểu vuốt thẻ: vuốt phải (hoặc ♡) để lưu, vuốt trái (hoặc ✕) để bỏ qua.
 * Danh mục bạn lưu được ghi nhớ trên trình duyệt để mục "Dành cho bạn" gợi ý đúng hơn.
 */
export function SwipeDeck() {
  const { save, toggle, isSaved } = useSaved();
  const [queue, setQueue] = useState<DealRow[]>([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<(Swiped & { deal: DealRow })[]>([]);
  const [drag, setDrag] = useState<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });
  const [leaving, setLeaving] = useState<"like" | "skip" | null>(null);
  const [liked, setLiked] = useState(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const moved = useRef(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const swiped = new Set(readLocal<Swiped[]>(SWIPED_KEY, []).map((s) => s.id));
      const r = await fetch(`/api/deals?sort=score&size=24&page=${p}`);
      const d = await r.json();
      const fresh = (d.items as DealRow[]).map(reviveDeal).filter((x) => !swiped.has(x.id));
      setQueue((q) => [...q, ...fresh.filter((x) => !q.some((y) => y.id === x.id))]);
      setPage(p + 1);
      if (!d.hasMore) setDone(true);
      return fresh.length;
    } catch {
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  // Sắp hết thẻ -> tải thêm (bỏ qua các trang toàn món đã lướt)
  useEffect(() => {
    if (queue.length < 4 && !done && !loading) load(page);
  }, [queue.length, done, loading, page, load]);

  const decide = useCallback((dir: "like" | "skip") => {
    const deal = queue[0];
    if (!deal || leaving) return;
    setLeaving(dir);
    if (dir === "like") {
      save(deal.id, deal.name, deal.price);
      setLiked((n) => n + 1);
      if (deal.category) {
        const likes = readLocal<Record<string, number>>(LIKES_KEY, {});
        likes[deal.category] = (likes[deal.category] ?? 0) + 1;
        writeLocal(LIKES_KEY, likes);
      }
    }
    const list = readLocal<Swiped[]>(SWIPED_KEY, []).filter((s) => s.id !== deal.id);
    list.unshift({ id: deal.id, dir });
    writeLocal(SWIPED_KEY, list.slice(0, 400));
    setHistory((h) => [{ id: deal.id, dir, deal }, ...h].slice(0, 20));
    setTimeout(() => {
      setQueue((q) => q.slice(1));
      setLeaving(null);
      setDrag({ dx: 0, dy: 0, active: false });
    }, 260);
  }, [queue, leaving, save]);

  const undo = () => {
    const [last, ...rest] = history;
    if (!last) return;
    writeLocal(SWIPED_KEY, readLocal<Swiped[]>(SWIPED_KEY, []).filter((s) => s.id !== last.id));
    setHistory(rest);
    setQueue((q) => [last.deal, ...q]);
    if (last.dir === "like") {
      if (isSaved(last.id)) toggle(last.id, last.deal.name); // hoàn tác cả việc lưu
      setLiked((n) => Math.max(0, n - 1));
      if (last.deal.category) {
        const likes = readLocal<Record<string, number>>(LIKES_KEY, {});
        likes[last.deal.category] = Math.max(0, (likes[last.deal.category] ?? 0) - 1);
        writeLocal(LIKES_KEY, likes);
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") decide("like");
      if (e.key === "ArrowLeft") decide("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const reset = () => {
    writeLocal(SWIPED_KEY, []);
    setQueue([]);
    setDone(false);
    setHistory([]);
    load(1);
  };

  const top = queue[0];
  const dx = leaving === "like" ? 600 : leaving === "skip" ? -600 : drag.dx;
  const style = top ? { transform: `translate(${dx}px, ${leaving ? drag.dy : drag.dy * 0.3}px) rotate(${dx / 18}deg)`, transition: drag.active ? "none" : "transform .26s ease" } : undefined;
  const likeOpacity = Math.max(0, Math.min(1, dx / THRESHOLD));
  const skipOpacity = Math.max(0, Math.min(1, -dx / THRESHOLD));

  return (
    <div className="swipe">
      <div className="swipe-stage">
        {!top && !loading && (
          <div className="swipe-empty">
            <Icon name="check" size={36} />
            <b>Bạn đã lướt hết deal hiện có</b>
            <span>Deal mới được cập nhật mỗi 2 giờ.{liked ? ` Bạn vừa lưu ${liked} món.` : ""}</span>
            <div className="hero-actions" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/da-luu"><Icon name="heart" size={16} /> Xem đã lưu</Link>
              <button type="button" className="btn btn-ghost" onClick={reset}>Lướt lại từ đầu</button>
            </div>
          </div>
        )}
        {!top && loading && <div className="swipe-card skeleton-card" aria-hidden="true" />}
        {queue.slice(1, 3).reverse().map((p, i, arr) => (
          <div key={p.id} className="swipe-card is-behind" style={{ transform: `scale(${1 - (arr.length - i) * 0.04}) translateY(${(arr.length - i) * 12}px)` }} aria-hidden="true">
            <div className="swipe-media"><CardImage src={p.imageUrl} /></div>
          </div>
        ))}
        {top && (() => {
          const usual = top.realDropPct >= 1 ? top.price / (1 - top.realDropPct / 100) : top.price;
          const saving = round1k(usual - top.price);
          return (
            <div
              key={top.id}
              className="swipe-card"
              style={style}
              onPointerDown={(e) => {
                start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
                moved.current = false;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ dx: 0, dy: 0, active: true });
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const ddx = e.clientX - start.current.x, ddy = e.clientY - start.current.y;
                if (Math.abs(ddx) > 6) moved.current = true;
                setDrag({ dx: ddx, dy: ddy, active: true });
              }}
              onPointerUp={(e) => {
                if (!start.current) return;
                const ddx = e.clientX - start.current.x;
                const fast = Math.abs(ddx) / Math.max(1, Date.now() - start.current.t) > 0.6;
                start.current = null;
                if (ddx > THRESHOLD || (fast && ddx > 30)) decide("like");
                else if (ddx < -THRESHOLD || (fast && ddx < -30)) decide("skip");
                else setDrag({ dx: 0, dy: 0, active: false });
              }}
              onPointerCancel={() => { start.current = null; setDrag({ dx: 0, dy: 0, active: false }); }}
              onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); } }}
            >
              <span className="swipe-stamp like" style={{ opacity: likeOpacity }}>LƯU ♡</span>
              <span className="swipe-stamp skip" style={{ opacity: skipOpacity }}>BỎ QUA</span>
              <div className="swipe-media">
                <CardImage src={top.imageUrl} />
                <span className="platform"><span className="dot" style={{ background: PLATFORMS[top.platform]?.color }} aria-hidden="true" />{PLATFORMS[top.platform]?.label}</span>
                {top.recordLow && <span className="record-ribbon"><Icon name="trophy" size={14} /> Giá thấp kỷ lục</span>}
              </div>
              <div className="swipe-body">
                <b className="swipe-name">{top.name}</b>
                <div className="price-row">
                  <span className="price">{vnd(top.price)}</span>
                  {top.realDropPct >= 1 && <span className="pct">−{Math.round(top.realDropPct)}% thật</span>}
                </div>
                {saving >= 1000 && <span className="swipe-save"><Icon name="shield" size={14} /> Rẻ hơn thường ngày {vnd(saving)}</span>}
                {top.withVoucher && <span className="swipe-voucher"><Icon name="ticket" size={14} /> Chỉ còn <b>{vnd(top.withVoucher.price)}</b>{top.withVoucher.code ? <> với mã <code>{top.withVoucher.code}</code></> : null}</span>}
                <Link href={`/product/${top.id}`} className="swipe-more" draggable={false}>Xem chi tiết & lịch sử giá <Icon name="arrowRight" size={14} /></Link>
              </div>
            </div>
          );
        })()}
      </div>
      <div className="swipe-actions">
        <button type="button" className="sw-btn skip" onClick={() => decide("skip")} disabled={!top} aria-label="Bỏ qua (phím ←)">✕</button>
        <button type="button" className="sw-btn undo" onClick={undo} disabled={!history.length} aria-label="Hoàn tác">↶</button>
        <button type="button" className="sw-btn like" onClick={() => decide("like")} disabled={!top} aria-label="Lưu (phím →)"><Icon name="heartFill" size={26} /></button>
      </div>
      <p className="swipe-help">Vuốt phải để lưu, vuốt trái để bỏ qua · trên máy tính dùng phím ← →{liked ? ` · đã lưu ${liked} món` : ""}</p>
    </div>
  );
}
