"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const pad = (n: number) => String(n).padStart(2, "0");
import { levelOf } from "@/lib/urgency";
export { levelOf };

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d > 0 ? `${d} ngày ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Đồng hồ đếm ngược THẬT tới `end` (hạn mã / hết đợt sale), kèm thanh thời gian còn lại nếu có `start`.
 * Chỉ dùng mốc thời gian có thật từ dữ liệu, không tạo khan hiếm giả.
 */
export function UrgencyTimer({
  end, start, label = "Còn", endedLabel = "Đã kết thúc", bar = true, size = "md",
}: { end: string; start?: string | null; label?: string; endedLabel?: string; bar?: boolean; size?: "sm" | "md" }) {
  const endMs = new Date(end).getTime();
  const startMs = start ? new Date(start).getTime() : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = now === null ? null : endMs - now;
  const level = left === null ? "calm" : levelOf(left);
  const pct = startMs && now !== null ? Math.min(100, Math.max(0, ((endMs - now) / (endMs - startMs)) * 100)) : null;

  if (level === "ended") return <span className={`utimer ended ${size}`}>{endedLabel}</span>;
  return (
    <span className={`utimer ${level} ${size}`} suppressHydrationWarning>
      <span className="utimer-row">
        <Icon name={level === "critical" || level === "urgent" ? "flame" : "clock"} size={size === "sm" ? 13 : 15} />
        <span>{label}</span>
        <b className="utimer-time">{left === null ? "--:--:--" : fmt(left)}</b>
      </span>
      {bar && pct !== null && (
        <span className="utimer-bar" role="progressbar" aria-label="Thời gian còn lại" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  );
}
