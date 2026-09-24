import type { SaleMark } from "@/lib/advice";
import { vnd, shortDate } from "@/lib/format";

const dm = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const k = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}tr` : `${Math.round(v / 1000)}K`);

/**
 * Biểu đồ bậc thang lịch sử giá (SVG thuần) có ghi chú:
 * vạch xanh = thấp nhất (kèm ngày), vạch xám = giá thường ngày, dải tím = các ngày sale lớn (kèm giá lúc đó).
 */
export function PriceChart({ points, current, usual, sales = [] }: { points: { price: number; capturedAt: Date }[]; current: number; usual?: number; sales?: SaleMark[] }) {
  if (points.length === 0) return <p className="muted">Chưa có lịch sử giá.</p>;
  const W = 640, H = 260, P = { l: 84, r: 16, t: 30, b: 30 };
  const now = Math.floor(Date.now() / 600_000) * 600_000; // làm tròn 10 phút: server & trình duyệt vẽ giống nhau
  const data = [...points, { price: current, capturedAt: new Date(Math.max(now, points[points.length - 1].capturedAt.getTime())) }];
  const t0 = data[0].capturedAt.getTime(), t1 = data[data.length - 1].capturedAt.getTime();
  const prices = data.map((d) => d.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const pad = Math.max((max - min) * 0.15, max * 0.03);
  const lo = min - pad, hi = max + pad;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const x = (t: number) => r1(P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r));
  const y = (v: number) => r1(P.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b));
  let line = `M${x(t0)},${y(data[0].price)}`;
  for (let i = 1; i < data.length; i++) line += ` H${x(data[i].capturedAt.getTime())} V${y(data[i].price)}`;
  const area = `${line} V${H - P.b} H${x(t0)} Z`;
  const ticks = [max, (min + max) / 2, min];
  // Lần gần nhất chạm đáy
  const lowPt = [...data].reverse().find((d) => d.price === min)!;
  const lx = x(lowPt.capturedAt.getTime());
  const lowLabel = `Thấp nhất ${k(min)} · ${dm.format(lowPt.capturedAt)}`;
  const lowAnchor = lx > W - 150 ? "end" : lx < P.l + 60 ? "start" : "middle";
  const visibleSales = sales.filter((s) => s.end.getTime() >= t0 && s.start.getTime() <= t1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Lịch sử giá: thấp nhất ${vnd(min)} ngày ${shortDate(lowPt.capturedAt)}, cao nhất ${vnd(max)}, hiện tại ${vnd(current)}${visibleSales.length ? `; các đợt sale: ${visibleSales.map((s) => `${s.short}${s.low ? ` giá ${vnd(s.low)}` : ""}`).join(", ")}` : ""}`} style={{ marginTop: 8 }} className="price-chart">
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

      {/* Ngày sale lớn */}
      {visibleSales.map((s) => {
        const a = Math.max(P.l, x(s.start.getTime())), b = Math.min(W - P.r, x(s.end.getTime()));
        const w = Math.max(6, b - a), cx = a + w / 2;
        return (
          <g key={s.start.toISOString()} className="pc-sale">
            <rect x={a} y={P.t} width={w} height={H - P.t - P.b} />
            <text x={cx} y={P.t - 16} textAnchor="middle" fontSize="11" fontWeight="700">{s.short}</text>
            {s.low != null && <text x={cx} y={P.t - 4} textAnchor="middle" fontSize="10">{k(s.low)}</text>}
          </g>
        );
      })}

      <path d={area} fill="url(#pc-fill)" />
      {usual != null && usual > lo && usual < hi && (
        <g className="pc-usual">
          <line x1={P.l} x2={W - P.r} y1={y(usual)} y2={y(usual)} strokeDasharray="2 4" />
          <text x={W - P.r - 4} y={y(usual) - 5} textAnchor="end" fontSize="11">Thường ngày {k(usual)}</text>
        </g>
      )}
      <line x1={P.l} x2={W - P.r} y1={y(min)} y2={y(min)} stroke="var(--save)" strokeDasharray="5 5" strokeWidth="1.5" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Điểm thấp nhất */}
      <circle cx={lx} cy={y(min)} r="4.5" fill="var(--save)" stroke="var(--surface)" strokeWidth="2" />
      <text x={lx} y={y(min) + 18} textAnchor={lowAnchor} fontSize="11" fontWeight="700" fill="var(--save)" className="pc-low-label">{lowLabel}</text>
      <circle cx={x(t1)} cy={y(current)} r="6" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <text x={P.l} y={H - 8} fontSize="12" fill="var(--muted)">{shortDate(data[0].capturedAt)}</text>
      <text x={W - P.r} y={H - 8} fontSize="12" fill="var(--muted)" textAnchor="end">Hôm nay</text>
    </svg>
  );
}
