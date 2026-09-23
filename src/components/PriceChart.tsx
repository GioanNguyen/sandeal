import { vnd, shortDate } from "@/lib/format";

/** Biểu đồ bậc thang lịch sử giá, SVG thuần, không cần thư viện */
export function PriceChart({ points, current }: { points: { price: number; capturedAt: Date }[]; current: number }) {
  if (points.length === 0) return <p className="muted">Chưa có lịch sử giá.</p>;
  const W = 640, H = 220, P = { l: 70, r: 12, t: 12, b: 28 };
  const data = [...points, { price: current, capturedAt: new Date() }];
  const t0 = data[0].capturedAt.getTime(), t1 = data[data.length - 1].capturedAt.getTime() || t0 + 1;
  const prices = data.map((d) => d.price);
  const lo = Math.min(...prices) * 0.95, hi = Math.max(...prices) * 1.05;
  const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  let d = `M${x(t0)},${y(data[0].price)}`;
  for (let i = 1; i < data.length; i++) {
    d += ` H${x(data[i].capturedAt.getTime())} V${y(data[i].price)}`;
  }
  const min = Math.min(...prices);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lịch sử giá">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{vnd(v)}</text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={y(min)} y2={y(min)} stroke="var(--good)" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(t1)} cy={y(current)} r="4" fill="var(--accent)" />
      <text x={P.l} y={H - 8} fontSize="11" fill="var(--muted)">{shortDate(data[0].capturedAt)}</text>
      <text x={W - P.r} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">Hôm nay</text>
    </svg>
  );
}
