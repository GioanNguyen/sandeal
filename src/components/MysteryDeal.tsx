"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DealRow } from "@/lib/queries";
import { MYSTERY_KEY, readLocal, writeLocal } from "@/lib/local";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";

type Store = { day: string; streak: number };

const prevDay = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

function Left({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return null;
  const s = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0"), mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
  return <span className="mys-left">Deal mới sau <b>{hh}:{mm}:{ss}</b></span>;
}

/** "Deal bí ẩn mỗi ngày": thẻ úp, bấm để lật; mỗi ngày 1 deal mới, đếm chuỗi ngày ghé liên tiếp (lưu trên trình duyệt) */
export function MysteryDeal({ deal: p, day, nextAt }: { deal: DealRow; day: string; nextAt: string }) {
  const [open, setOpen] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const s = readLocal<Store | null>(MYSTERY_KEY, null);
    if (s?.day === day) { setOpen(true); setStreak(s.streak); }
    else if (s && s.day === prevDay(day)) setStreak(s.streak); // hôm qua đã lật -> chuỗi đang giữ
  }, [day]);

  const flip = () => {
    const s = readLocal<Store | null>(MYSTERY_KEY, null);
    const next = s?.day === day ? s.streak : s?.day === prevDay(day) ? s.streak + 1 : 1;
    writeLocal(MYSTERY_KEY, { day, streak: next });
    setStreak(next);
    setOpen(true);
  };

  const teaserPct = Math.floor(p.realDropPct / 5) * 5;
  return (
    <section className="section mystery" aria-labelledby="mys-head">
      <div className="section-head">
        <h2 id="mys-head"><Icon name="sparkles" size={22} /> Deal bí ẩn hôm nay</h2>
        <Left to={nextAt} />
      </div>
      <div className={`mys-card${open ? " is-open" : ""}`}>
        <div className="mys-inner">
          <button type="button" className="mys-face mys-back" onClick={flip} aria-hidden={open} tabIndex={open ? -1 : 0}>
            <span className="mys-q" aria-hidden="true">?</span>
            <span className="mys-hint">
              <b>Một món {p.category ? p.category.toLowerCase() : "hot"} trên {PLATFORMS[p.platform]?.label} giảm thật {teaserPct}%+</b>
              <span>Mỗi ngày một deal được chọn sẵn. Bấm để lật xem!</span>
            </span>
            <span className="btn btn-light mys-cta"><Icon name="sparkles" size={16} /> Lật thẻ</span>
          </button>
          <Link href={`/product/${p.id}`} className="mys-face mys-front" aria-hidden={!open} tabIndex={open ? 0 : -1}>
            <span className="mys-media"><CardImage src={p.imageUrl} /></span>
            <span className="mys-body">
              <span className="mys-tag">Deal bí ẩn · {PLATFORMS[p.platform]?.label}</span>
              <b className="mys-name">{p.name}</b>
              <span className="mys-price"><b className="price">{vnd(p.price)}</b> <span className="pct">−{Math.round(p.realDropPct)}% thật</span></span>
              {p.withVoucher && <span className="mys-voucher"><Icon name="ticket" size={14} /> Chỉ còn <b>{vnd(p.withVoucher.price)}</b>{p.withVoucher.code ? <> với mã <code>{p.withVoucher.code}</code></> : null}</span>}
              <span className="btn btn-primary mys-go">Xem deal <Icon name="arrowRight" size={16} /></span>
            </span>
          </Link>
        </div>
      </div>
      {streak > 0 && (
        <p className="mys-streak">
          <Icon name="flame" size={16} /> Chuỗi <b>{streak} ngày</b> ghé liên tiếp{streak >= 3 ? " – giỏi quá!" : ""} {!open && " · lật thẻ hôm nay để giữ chuỗi"}
        </p>
      )}
    </section>
  );
}
