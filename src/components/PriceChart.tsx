import { vnd, shortDate } from "@/lib/format";

/** Biểu đồ bậc thang lịch sử giá, SVG thuần. Đường nét đứt xanh = giá thấp nhất. */
export function PriceChart({ points, current }: { points: { price: number; capturedAt: Date }[]; current: number }) {
  if (points.length === 0) return <p className="muted">Chưa có lịch sử giá.</p>;
  const W = 640, H = 240, P = { l: 84, r: 16, t: 16, b: 30 };
  const data = [...points, { price: current, capturedAt: new Date() }];
  const t0 = data[0].capturedAt.getTime(), t1 = data[data.length - 1].capturedAt.getTime();
  const prices = data.map((d) => d.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const pad = Math.max((max - min) * 0.15, max * 0.03);
  const lo = min - pad, hi = max + pad;
  const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  let line = `M${x(t0)},${y(data[0].price)}`;
  for (let i = 1; i < data.length; i++) line += ` H${x(data[i].capturedAt.getTime())} V${y(data[i].price)}`;
  const area = `${line} V${H - P.b} H${x(t0)} Z`;
  const ticks = [max, (min + max) / 2, min];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Lịch sử giá: thấp nhất ${vnd(min)}, cao nhất ${vnd(max)}, hiện tại ${vnd(current)}`} style={{ marginTop: 8 }}>
      <defs>
        <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{vnd(v)}</text>
        </g>
      ))}
      <path d={area} fill="url(#pc-fill)" />
      <line x1={P.l} x2={W - P.r} y1={y(min)} y2={y(min)} stroke="var(--save)" strokeDasharray="5 5" strokeWidth="1.5" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(t1)} cy={y(current)} r="6" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <text x={P.l} y={H - 8} fontSize="12" fill="var(--muted)">{shortDate(data[0].capturedAt)}</text>
      <text x={W - P.r} y={H - 8} fontSize="12" fill="var(--muted)" textAnchor="end">Hôm nay</text>
    </svg>
  );
}
