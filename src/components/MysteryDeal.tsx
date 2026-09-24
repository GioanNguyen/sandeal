"use client";
import { productPath } from "@/lib/slug";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DealRow } from "@/lib/queries";
import { MYSTERY_KEY, readLocal, writeLocal } from "@/lib/local";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";

type Store = { day: string; streak: number };

const prevDay = (day: string) => new Date(Date.parse(day + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
const round1k = (n: number) => Math.round(n / 1000) * 1000;

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = now == null ? null : Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  const parts = s == null ? ["--", "--", "--"] : [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0"));
  return (
    <span className="mys-count" aria-label={s == null ? "Đang tính giờ" : `Deal mới sau ${parts[0]} giờ ${parts[1]} phút`}>
      <Icon name="clock" size={14} /> Deal mới sau
      <span className="mys-digits" aria-hidden="true">
        <b>{parts[0]}</b>:<b>{parts[1]}</b>:<b>{parts[2]}</b>
      </span>
    </span>
  );
}

/** 7 chấm = 1 tuần; chấm sáng = số ngày ghé liên tiếp trong tuần hiện tại của chuỗi */
function Streak({ streak, open }: { streak: number; open: boolean }) {
  const inWeek = streak === 0 ? 0 : ((streak - 1) % 7) + 1;
  const weeks = Math.floor((streak - 1) / 7);
  return (
    <div className="mys-streak" aria-label={`Chuỗi ${streak} ngày ghé liên tiếp`}>
      <span className="mys-streak-label">
        <Icon name="flame" size={15} />
        {streak > 0 ? <>Chuỗi <b>{streak} ngày</b>{weeks > 0 ? ` · ${weeks} tuần trọn` : ""}</> : "Bắt đầu chuỗi ngày săn deal"}
      </span>
      <span className="mys-dots" aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => (
          <i key={k} className={k < inWeek ? (k === inWeek - 1 && open ? "on today" : "on") : !open && k === inWeek ? "next" : ""} />
        ))}
      </span>
    </div>
  );
}

/**
 * "Deal bí ẩn mỗi ngày": thẻ úp bên trái lật ra ảnh deal, bảng bên phải đổi từ lời gợi ý sang giá & nút mua.
 * Mỗi ngày 1 deal (cố định theo ngày giờ VN), đếm chuỗi ngày ghé liên tiếp trên trình duyệt.
 */
export function MysteryDeal({ deal: p, day, nextAt }: { deal: DealRow; day: string; nextAt: string }) {
  const [open, setOpen] = useState(false);
  const [justOpened, setJustOpened] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const s = readLocal<Store | null>(MYSTERY_KEY, null);
    if (s?.day === day) { setOpen(true); setStreak(s.streak); }
    else if (s && s.day === prevDay(day)) setStreak(s.streak); // hôm qua đã lật -> chuỗi đang giữ
  }, [day]);

  const flip = () => {
    if (open) return;
    const s = readLocal<Store | null>(MYSTERY_KEY, null);
    const next = s?.day === day ? s.streak : s?.day === prevDay(day) ? s.streak + 1 : 1;
    writeLocal(MYSTERY_KEY, { day, streak: next });
    setStreak(next);
    setOpen(true);
    setJustOpened(true);
  };

  const platform = PLATFORMS[p.platform]?.label ?? p.platform;
  const teaserPct = Math.floor(p.realDropPct / 5) * 5;
  const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.price;
  const saving = round1k(usual - p.price);

  return (
    <section className="section mystery" aria-labelledby="mys-head">
      <div className="section-head">
        <h2 id="mys-head"><Icon name="sparkles" size={22} /> Deal bí ẩn hôm nay</h2>
      </div>
      <div className={`mys-stage${open ? " is-open" : ""}${justOpened ? " just-opened" : ""}`}>
        <span className="mys-glow" aria-hidden="true" />

        {/* Thẻ lật */}
        <div className="mys-card">
          <div className="mys-inner">
            <button type="button" className="mys-face mys-back" onClick={flip} aria-hidden={open} tabIndex={open ? -1 : 0} aria-label="Lật thẻ xem deal bí ẩn hôm nay">
              <span className="mys-pattern" aria-hidden="true" />
              <span className="mys-q" aria-hidden="true">?</span>
              <span className="mys-tap">Chạm để lật</span>
            </button>
            <Link href={productPath(p)} className="mys-face mys-front" aria-hidden={!open} tabIndex={-1}>
              <CardImage src={p.imageUrl} />
              <span className="mys-drop">−{Math.round(p.realDropPct)}%<small>giảm thật</small></span>
            </Link>
          </div>
          {justOpened && (
            <span className="mys-burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, k) => <i key={k} style={{ ["--k" as string]: k }} />)}
            </span>
          )}
        </div>

        {/* Bảng thông tin */}
        <div className="mys-panel">
          {open ? (
            <div className="mys-info" key="open">
              <span className="mys-tag"><Icon name="check" size={13} /> Đã mở · {platform}</span>
              <Link href={productPath(p)} className="mys-name">{p.name}</Link>
              <div className="mys-price">
                <b className="price">{vnd(p.price)}</b>
                {p.originalPrice && p.originalPrice > p.price ? <s>{vnd(p.originalPrice)}</s> : null}
              </div>
              <div className="mys-perks">
                {saving >= 1000 && <span className="mys-perk save"><Icon name="shield" size={14} /> Rẻ hơn thường ngày <b>{vnd(saving)}</b></span>}
                {p.withVoucher && (
                  <span className="mys-perk voucher"><Icon name="ticket" size={14} /> Còn <b>{vnd(p.withVoucher.price)}</b>{p.withVoucher.code ? <> với mã <code>{p.withVoucher.code}</code></> : null}</span>
                )}
              </div>
              <Link href={productPath(p)} className="btn btn-primary mys-go">Xem deal ngay <Icon name="arrowRight" size={16} /></Link>
            </div>
          ) : (
            <div className="mys-info" key="closed">
              <span className="mys-tag closed"><Icon name="sparkles" size={13} /> 1 deal chọn sẵn mỗi ngày</span>
              <p className="mys-teaser">
                Một món <b>{p.category ? p.category.toLowerCase() : "hot"}</b> trên <b>{platform}</b> đang giảm thật <span className="mys-pct">{teaserPct}%+</span>
              </p>
              <p className="mys-sub">Lật thẻ để xem là món gì. Ghé mỗi ngày để giữ chuỗi!</p>
              <button type="button" className="btn btn-primary mys-go" onClick={flip}><Icon name="sparkles" size={16} /> Lật thẻ ngay</button>
            </div>
          )}
          <div className="mys-meta">
            <Streak streak={streak} open={open} />
            <Countdown to={nextAt} />
          </div>
        </div>
      </div>
    </section>
  );
}
