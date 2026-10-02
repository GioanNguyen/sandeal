import { THRESHOLDS, fmtMetric, rate, type Metric } from "@/lib/vitals";

const COLOR = { good: "var(--save)", "needs-improvement": "var(--warn)", poor: "var(--primary)" } as const;

/**
 * p75 theo ngày của 1 chỉ số (điện thoại). Một trục, một chuỗi; hai đường đứt là ngưỡng "tốt" và "kém" của Google.
 * Rê chuột/chạm từng ngày để xem số liệu; ngày không có số đo bỏ trống (không nối qua).
 */
export function VitalsTrend({ metric, days, values }: { metric: Metric; days: string[]; values: (number | null)[] }) {
  const W = 640, H = 170, P = { l: 52, r: 10, t: 12, b: 24 };
  const [good, poor] = THRESHOLDS[metric];
  const have = values.filter((v): v is number => v != null);
  const max = Math.max(poor * 1.15, ...have) || 1;
  const x = (i: number) => P.l + (i / Math.max(1, days.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  // Đường nối các ngày liên tiếp có số đo
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${i > 0 && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const every = Math.ceil(days.length / 6);
  const label = `${metric} theo ngày (p75, điện thoại): ${have.length ? `mới nhất ${fmtMetric(metric, have.at(-1))}` : "chưa có số đo"}`;
  return (
    <figure className="vt">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        {[[good, "Tốt"], [poor, "Kém"]].map(([v, t]) => (
          <g key={t as string}>
            <line x1={P.l} x2={W - P.r} y1={y(v as number)} y2={y(v as number)} stroke="var(--border)" strokeDasharray="4 4" />
            <text x={P.l - 6} y={y(v as number) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmtMetric(metric, v as number)}</text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--border)" />
        {d && <path d={d} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {values.map((v, i) => (
          <g key={days[i]} className="vt-day">
            <rect x={x(i) - (W - P.l - P.r) / days.length / 2} y={P.t} width={(W - P.l - P.r) / days.length} height={H - P.t - P.b} fill="transparent" />
            {v != null && <circle cx={x(i)} cy={y(v)} r="4.5" fill={COLOR[rate(metric, v)]} stroke="var(--surface)" strokeWidth="2" />}
            <title>{`${days[i].slice(8, 10)}/${days[i].slice(5, 7)}: ${v == null ? "chưa có số đo" : fmtMetric(metric, v)}`}</title>
            {i % every === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{`${days[i].slice(8, 10)}/${days[i].slice(5, 7)}`}</text>}
          </g>
        ))}
      </svg>
    </figure>
  );
}
