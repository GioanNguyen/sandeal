/** Biểu đồ cột một chuỗi, SVG thuần. Hover từng cột để xem giá trị; có bảng dữ liệu kèm theo. */
export function BarChart({
  data,
  format,
  label,
}: {
  data: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  label: string;
}) {
  const W = 640, H = 210, P = { l: 8, r: 8, t: 24, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - P.l - P.r) / Math.max(1, data.length);
  const bw = Math.max(3, slot - 3);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const every = Math.ceil(data.length / 6);
  return (
    <figure className="barchart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--border)" />
        {data.map((d, i) => {
          const x = P.l + i * slot + (slot - bw) / 2;
          const top = y(d.value);
          const h = Math.max(0, H - P.b - top);
          return (
            <g key={d.key} className="bar">
              <rect x={P.l + i * slot} y={P.t} width={slot} height={H - P.t - P.b} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - P.b} V${top + Math.min(4, h)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - P.b} Z`} fill="var(--primary)" />}
              <title>{`${d.label}: ${format(d.value)}`}</title>
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">{d.label}</text>
              )}
            </g>
          );
        })}
        <text x={P.l} y={12} fontSize="11" fill="var(--muted)">Cao nhất {format(max)}</text>
      </svg>
      <details className="data-table">
        <summary>Xem bảng số liệu</summary>
        <table>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}><td>{d.label}</td><td>{format(d.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
