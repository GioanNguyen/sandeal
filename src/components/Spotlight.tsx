"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DealRow } from "@/lib/queries";
import { vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";
import { PlatformBadge } from "./PlatformBadge";

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/**
 * Dải "Deal nổi bật": 3–5 deal điểm cao nhất, ảnh to, tự trượt mỗi 5 giây.
 * Dừng khi rê chuột / chạm / focus bàn phím; không tự trượt nếu người dùng bật giảm chuyển động.
 */
export function Spotlight({ items }: { items: DealRow[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = items.length;
    const next = ((i % n) + n) % n;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, [items.length]);

  // Theo dõi slide đang hiện khi người dùng tự vuốt
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (paused || items.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") go(index + 1);
    }, 5000);
    return () => clearInterval(t);
  }, [paused, index, go, items.length]);

  if (!items.length) return null;
  return (
    <section
      className="section spotlight"
      aria-roledescription="carousel"
      aria-labelledby="spot-head"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="section-head">
        <h2 id="spot-head"><Icon name="sparkles" size={22} /> Deal nổi bật hôm nay</h2>
        <div className="spot-nav">
          <button type="button" onClick={() => go(index - 1)} aria-label="Deal trước">‹</button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Deal tiếp theo">›</button>
        </div>
      </div>
      <div className="spot-track" ref={track}>
        {items.map((p, i) => {
          const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.price;
          const saving = round1k(usual - p.price);
          return (
            <Link
              key={p.id}
              href={`/product/${p.id}`}
              className="spot-slide"
              aria-roledescription="slide"
              aria-label={`${i + 1}/${items.length}: ${p.name}`}
              tabIndex={i === index ? 0 : -1}
            >
              <div className="spot-media">
                <CardImage src={p.imageUrl} />
                <PlatformBadge platform={p.platform} />
                {p.recordLow && <span className="record-ribbon"><Icon name="trophy" size={14} /> Giá thấp kỷ lục</span>}
              </div>
              <div className="spot-body">
                <span className="spot-rank">#{i + 1} điểm deal hôm nay</span>
                <h3>{p.name}</h3>
                <div className="spot-price">
                  <b className="price">{vnd(p.price)}</b>
                  <span className="pct">−{Math.round(p.realDropPct)}% thật</span>
                </div>
                {saving >= 1000 && <p className="spot-save"><Icon name="shield" size={14} /> Rẻ hơn giá thường ngày <b>{vnd(saving)}</b></p>}
                {p.withVoucher && (
                  <p className="spot-voucher"><Icon name="ticket" size={14} /> Chỉ còn <b>{vnd(p.withVoucher.price)}</b>{p.withVoucher.code ? <> với mã <code>{p.withVoucher.code}</code></> : null}</p>
                )}
                <span className="btn btn-primary spot-cta">Xem deal <Icon name="arrowRight" size={16} /></span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="spot-dots" role="tablist" aria-label="Chọn deal">
        {items.map((p, i) => (
          <button key={p.id} type="button" role="tab" aria-selected={i === index} aria-label={`Deal ${i + 1}`} onClick={() => go(i)} />
        ))}
      </div>
    </section>
  );
}
