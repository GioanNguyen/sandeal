import { vnd } from "@/lib/format";

/** Biểu đồ giá tí hon (bậc thang) cho thẻ deal: vạch xanh = giá thấp nhất, chấm = giá hiện tại */
export function Sparkline({ series, current, height = 34 }: { series: [number, number][]; current: number; height?: number }) {
  const pts: [number, number][] = [...series, [Date.now(), current]];
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
      <line x1={pad} x2={W - pad} y1={y(lo)} y2={y(lo)} className="spark-low" />
      <path d={d} className="spark-line" vectorEffect="non-scaling-stroke" />
      <circle cx={x(t1)} cy={y(current)} r="3.5" className="spark-dot" />
    </svg>
  );
}
