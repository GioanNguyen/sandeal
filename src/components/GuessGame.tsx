"use client";
import { productPath } from "@/lib/slug";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GuessRound } from "@/lib/play";
import { readLocal, writeLocal } from "@/lib/local";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";
import { ShareButtons } from "./ShareButtons";

const KEY = "sd-guess-v1";
type Store = { day: string; score: number; best: number; played: number };

const verdict = (s: number, n: number) =>
  s === n ? "Thánh săn sale! Không lọt một giá nào." : s >= n - 1 ? "Mắt xanh nhìn giá chuẩn đấy!" : s >= n / 2 ? "Khá lắm, thêm chút kinh nghiệm nữa thôi." : "Giá sale khó đoán thật – vậy mới cần Săn Deal!";

/**
 * Mini game "Đoán giá": 5 câu mỗi ngày (mọi người cùng đề). Biết giá thường ngày, đoán giá sale hiện tại.
 * Điểm lần chơi đầu trong ngày được ghi lại; chơi lại chỉ để luyện.
 */
export function GuessGame({ day, rounds, siteUrl }: { day: string; rounds: GuessRound[]; siteUrl: string }) {
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(() => rounds.map(() => null));
  const [store, setStore] = useState<Store | null>(null);
  const [practice, setPractice] = useState(false);

  useEffect(() => {
    const s = readLocal<Store | null>(KEY, null);
    setStore(s);
    if (s?.day === day) setI(rounds.length); // hôm nay chơi rồi -> hiện kết quả
  }, [day, rounds.length]);

  const r = rounds[i];
  const picked = r ? picks[i] : null;
  const score = picks.filter((p, k) => p != null && p === rounds[k].answer).length;
  const finished = i >= rounds.length;
  const todayScore = store?.day === day && !practice ? store.score : score;

  const choose = (v: number) => {
    if (picked != null) return;
    const next = [...picks];
    next[i] = v;
    setPicks(next);
    if (i === rounds.length - 1 && !practice && store?.day !== day) {
      const s = next.filter((p, k) => p === rounds[k].answer).length;
      const saved: Store = { day, score: s, best: Math.max(s, store?.best ?? 0), played: (store?.played ?? 0) + 1 };
      writeLocal(KEY, saved);
      setStore(saved);
    }
  };

  const replay = () => {
    setPractice(true);
    setPicks(rounds.map(() => null));
    setI(0);
  };

  if (!rounds.length) return <div className="empty">Hôm nay chưa đủ deal để ra đề. Quay lại sau nhé!</div>;

  if (finished) {
    const n = rounds.length;
    const shown = practice ? score : todayScore;
    return (
      <div className="guess-end">
        <div className="guess-score" aria-live="polite">
          <span>{practice ? "Lượt luyện tập" : "Kết quả hôm nay"}</span>
          <b>{shown}/{n}</b>
          <p>{verdict(shown, n)}</p>
          {store && <small>Kỷ lục của bạn: {store.best}/{n} · đã chơi {store.played} ngày</small>}
        </div>
        {!practice && (
          <ShareButtons url={`${siteUrl}/doan-gia/ket-qua/${shown}`} title={`Mình đoán đúng ${shown}/${n} giá deal hôm nay trên Săn Deal. Bạn được mấy điểm?`} />
        )}
        <div className="guess-review">
          {rounds.map((q, k) => (
            <Link key={q.id} href={productPath(q)} className={`guess-row${picks[k] == null ? "" : picks[k] === q.answer ? " ok" : " bad"}`}>
              <span className="guess-thumb"><CardImage src={q.imageUrl} /></span>
              <span className="guess-row-name">{q.name}</span>
              <span className="guess-row-price"><b>{vnd(q.answer)}</b><small>−{Math.round(q.realDropPct)}% thật</small></span>
            </Link>
          ))}
        </div>
        <div className="hero-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-ghost" onClick={replay}>Chơi lại để luyện</button>
          <Link className="btn btn-primary" href="/#deals">Săn deal thật <Icon name="arrowRight" size={16} /></Link>
        </div>
        <p className="muted guess-next">Đề mới lúc 0 giờ mỗi ngày.</p>
      </div>
    );
  }

  const correct = picked != null && picked === r.answer;
  return (
    <div className="guess">
      <div className="guess-progress" aria-label={`Câu ${i + 1} trên ${rounds.length}`}>
        {rounds.map((_, k) => (
          <span key={k} className={k < i ? (picks[k] === rounds[k].answer ? "ok" : "bad") : k === i ? "cur" : ""} />
        ))}
        <b>{i + 1}/{rounds.length}{practice ? " · luyện tập" : ""}</b>
      </div>
      <div className="guess-card">
        <div className="guess-media">
          <CardImage src={r.imageUrl} />
          <span className="platform"><span className="dot" style={{ background: PLATFORMS[r.platform]?.color }} aria-hidden="true" />{PLATFORMS[r.platform]?.label}</span>
        </div>
        <div className="guess-body">
          <h2>{r.name}</h2>
          <p className="guess-usual">Giá thường ngày: <b>{vnd(r.usual)}</b></p>
          <p className="guess-q">Giá đang bán hôm nay là bao nhiêu?</p>
          <div className="guess-options">
            {r.options.map((o) => (
              <button
                key={o}
                type="button"
                className={`guess-opt${picked == null ? "" : o === r.answer ? " right" : o === picked ? " wrong" : " dim"}`}
                onClick={() => choose(o)}
                disabled={picked != null}
              >
                {vnd(o)}
              </button>
            ))}
          </div>
          {picked != null && (
            <div className={`guess-reveal ${correct ? "ok" : "bad"}`} aria-live="polite">
              <b>{correct ? "Chính xác!" : `Chưa đúng – giá thật là ${vnd(r.answer)}`}</b>
              <span>Đang rẻ hơn giá thường ngày {vnd(r.usual - r.answer)} (−{Math.round(r.realDropPct)}% thật).</span>
              <div className="guess-next-row">
                <Link href={productPath(r)} className="btn btn-ghost btn-sm">Xem deal này</Link>
                <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)} autoFocus>
                  {i === rounds.length - 1 ? "Xem kết quả" : "Câu tiếp"} <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
