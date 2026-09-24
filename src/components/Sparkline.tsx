import { vnd } from "@/lib/format";

/** "Bây giờ" làm tròn 10 phút: server và trình duyệt vẽ ra cùng toạ độ (tránh lệch khi hydrate) */
const nowTick = () => Math.floor(Date.now() / 600_000) * 600_000;

/** Biểu đồ giá tí hon (bậc thang) cho thẻ deal: vạch xanh = giá thấp nhất, chấm = giá hiện tại */
export function Sparkline({ series, current, height = 34 }: { series: [number, number][]; current: number; height?: number }) {
  const pts: [number, number][] = [...series, [Math.max(nowTick(), series.at(-1)?.[0] ?? 0), current]];
  if (pts.length < 3) return <div className="spark spark-empty" style={{ height }}>Đang thu thập lịch sử giá</div>;
  const W = 200, H = height, pad = 4;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2) + pad;
  const y = (v: number) => pad + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad * 2);
  let d = `M${x(t0).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0]).toFixed(1)} V${y(pts[i][1]).toFixed(1)}`;
  const atLow = current <= lo;
  return (
    <svg className={`spark${atLow ? " at-low" : ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} role="img"
      aria-label={`Giá 30 ngày: thấp nhất ${vnd(lo)}, cao nhất ${vnd(hi)}, hiện tại ${vnd(current)}`}>
      <line x1={pad} x2={W - pad} y1={y(lo)} y2={y(lo)} className="spark-low" suppressHydrationWarning />
      <path d={d} className="spark-line" vectorEffect="non-scaling-stroke" suppressHydrationWarning />
      <circle cx={x(t1)} cy={y(current)} r="3.5" className="spark-dot" suppressHydrationWarning />
    </svg>
  );
}

// Cố định múi giờ VN để server và trình duyệt ra cùng một chuỗi (tránh lệch khi hydrate)
const dmFmt = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const dm = (t: number) => dmFmt.format(t);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Biểu đồ giá phóng to (hiện khi rê chuột / nhấn giữ biểu đồ nhỏ trên thẻ) */
export function SparkDetail({ series, current, allTimeLow }: { series: [number, number][]; current: number; allTimeLow?: number | null }) {
  const pts: [number, number][] = [...series, [Math.max(nowTick(), series.at(-1)?.[0] ?? 0), current]];
  if (pts.length < 3) return null;
  const W = 280, H = 96, padX = 6, padY = 10;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - padX * 2) + padX;
  const y = (v: number) => padY + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - padY * 2);
  let d = `M${x(t0).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0]).toFixed(1)} V${y(pts[i][1]).toFixed(1)}`;
  const area = `${d} V${H} H${x(t0).toFixed(1)} Z`;
  const hiAt = pts.find((p) => p[1] === hi)![0];
  const loAt = [...pts].reverse().find((p) => p[1] === lo)![0];
  const days = Math.max(1, Math.round((t1 - t0) / 86_400_000));
  return (
    <div className="spark-detail">
      <div className="sd-head">
        <b>Giá {days} ngày qua</b>
        <span>Bây giờ <b className={current <= lo ? "save" : ""}>{vnd(current)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
        <path d={area} className="sd-area" suppressHydrationWarning />
        <line x1={padX} x2={W - padX} y1={r1(y(lo))} y2={r1(y(lo))} className="spark-low" suppressHydrationWarning />
        <path d={d} className="spark-line" vectorEffect="non-scaling-stroke" suppressHydrationWarning />
        <circle cx={r1(x(hiAt))} cy={r1(y(hi))} r="3" className="sd-hi" suppressHydrationWarning />
        <circle cx={r1(x(t1))} cy={r1(y(current))} r="4" className="spark-dot" suppressHydrationWarning />
      </svg>
      <div className="sd-axis"><span>{dm(t0)}</span><span>Hôm nay</span></div>
      <dl className="sd-stats">
        <div><dt>Cao nhất</dt><dd>{vnd(hi)} <small>{dm(hiAt)}</small></dd></div>
        <div><dt>Thấp nhất</dt><dd className="save">{vnd(lo)} <small>{dm(loAt)}</small></dd></div>
        {allTimeLow != null && allTimeLow < lo && <div><dt>Đáy lịch sử</dt><dd>{vnd(allTimeLow)}</dd></div>}
      </dl>
    </div>
  );
}
