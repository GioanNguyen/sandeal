"use client";
import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** Đếm ngược tới `to`; khi đã tới giờ mà chưa qua `until` thì hiện "Đang diễn ra" */
export function Countdown({ to, until, compact = false }: { to: string; until?: string; compact?: boolean }) {
  const target = new Date(to).getTime();
  const end = until ? new Date(until).getTime() : target;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now !== null && now >= target && now <= end) return <span className="countdown live">Đang diễn ra</span>;
  // Trước khi chạy ở trình duyệt (render phía server) hiển thị "--" để tránh lệch giờ khi hydrate
  const { d, h, m, s } = parts(now === null ? 0 : target - now);
  if (compact) {
    return (
      <span className="countdown compact" suppressHydrationWarning>
        {now === null ? "…" : `${d > 0 ? `${d} ngày ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`}
      </span>
    );
  }
  return (
    <span className="countdown" role="timer" aria-live="off" suppressHydrationWarning>
      {[
        [d, "ngày"],
        [h, "giờ"],
        [m, "phút"],
        [s, "giây"],
      ].map(([v, l]) => (
        <span key={l as string} className="cd-cell">
          <b>{now === null ? "--" : pad(v as number)}</b>
          <small>{l}</small>
        </span>
      ))}
    </span>
  );
}
