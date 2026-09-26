"use client";
import { thumbUrl } from "@/lib/images";
import { productPath } from "@/lib/slug";
import { useEffect, useRef, useState } from "react";
import type { Summary } from "@/lib/summary";
import { PLATFORMS, vnd } from "@/lib/format";
import { Icon } from "./Icon";

function Chart({ history, current }: { history: [number, number][]; current: number }) {
  const pts: [number, number][] = [...history, [Date.now(), current]];
  if (pts.length < 3) return <p className="muted" style={{ fontSize: 13 }}>Đang thu thập lịch sử giá.</p>;
  const W = 520, H = 150, P = { l: 8, r: 8, t: 10, b: 20 };
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  let d = `M${x(t0)},${y(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0])} V${y(pts[i][1])}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Lịch sử giá: thấp nhất ${vnd(lo)}, cao nhất ${vnd(hi)}`}>
      <path d={`${d} V${H - P.b} H${x(t0)} Z`} fill="var(--primary)" opacity="0.1" />
      <line x1={P.l} x2={W - P.r} y1={y(lo)} y2={y(lo)} stroke="var(--save)" strokeDasharray="5 5" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      <circle cx={x(t1)} cy={y(current)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <text x={P.l} y={H - 4} fontSize="11" fill="var(--muted)">{new Date(t0).toLocaleDateString("vi-VN")}</text>
      <text x={W - P.r} y={H - 4} fontSize="11" fill="var(--muted)" textAnchor="end">Hôm nay</text>
    </svg>
  );
}

/** Nút "Xem nhanh" trên thẻ deal: mở hộp thoại có biểu đồ, kết luận, giá sau mã, giá các sàn */
export function QuickView({ id, name }: { id: number; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState(false);

  async function open() {
    ref.current?.showModal();
    if (data) return;
    const res = await fetch(`/api/quick/${id}`).catch(() => null);
    if (res?.ok) setData(await res.json());
    else setErr(true);
  }
  useEffect(() => {
    const d = ref.current;
    const onClick = (e: MouseEvent) => { if (e.target === d) d?.close(); }; // bấm ra ngoài để đóng
    d?.addEventListener("click", onClick);
    return () => d?.removeEventListener("click", onClick);
  }, []);

  const p = data?.product;
  return (
    <>
      <button type="button" className="qv-btn" onClick={open} aria-label={`Xem nhanh ${name}`}>
        <Icon name="search" size={15} /> <span>Xem nhanh</span>
      </button>
      <dialog ref={ref} className="qv" aria-label={`Xem nhanh ${name}`}>
        <button type="button" className="qv-close" onClick={() => ref.current?.close()} aria-label="Đóng">×</button>
        {!p ? (
          <div className="qv-loading">{err ? "Không tải được dữ liệu, thử lại sau." : <><span className="qv-skel" /><span className="qv-skel short" /><span className="qv-skel tall" /></>}</div>
        ) : (
          <div className="qv-body">
            <div className="qv-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(p.imageUrl) ?? ""} alt="" width={96} height={96} />
              <div>
                <span className="muted" style={{ fontSize: 13 }}>{PLATFORMS[p.platform]?.label}{p.shopName ? ` · ${p.shopName}` : ""}</span>
                <h2>{p.name}</h2>
                <div className="price-row">
                  <span className="price">{vnd(p.price)}</span>
                  {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
                </div>
              </div>
            </div>
            <div className={`verdict ${p.verdict === "good" ? "good" : "wait"}`}>
              <Icon name={p.verdict === "good" ? "shield" : p.verdict === "new" ? "clock" : "alert"} size={20} />
              <div>
                <b>{p.verdict === "good" ? "Giá tốt, có thể mua" : p.verdict === "new" ? "Mới bắt đầu theo dõi" : "Chưa phải giá tốt nhất"}</b>
                <p>
                  {p.verdict === "good"
                    ? `Rẻ hơn ${vnd(Math.max(0, p.usual - p.price))} so với giá thường ngày.`
                    : p.verdict === "new"
                    ? "Cần khoảng 7 ngày dữ liệu để đánh giá chính xác."
                    : `Từng có giá ${vnd(p.low90)} trong 90 ngày.`}
                </p>
              </div>
            </div>
            <Chart history={p.history} current={p.price} />
            <div className="kpis">
              <div className="kpi"><span>Thấp nhất 90 ngày</span><b className="save">{vnd(p.low90)}</b></div>
              <div className="kpi"><span>Giá thường ngày</span><b>{vnd(p.usual)}</b></div>
              <div className="kpi"><span>Sau mã tốt nhất</span><b>{vnd(p.afterCodes)}</b></div>
            </div>
            {data.offers.length > 1 && (
              <div className="qv-offers">
                {data.offers.map((o, i) => (
                  <a key={o.id} href={productPath(o)} className={`gap-offer${i === 0 ? " best" : ""}`}>
                    <span className="dot" style={{ background: PLATFORMS[o.platform]?.color }} aria-hidden="true" />
                    {PLATFORMS[o.platform]?.label}{o.id === p.id ? " (đang xem)" : ""} <b>{vnd(o.price)}</b>
                  </a>
                ))}
              </div>
            )}
            <div className="qv-actions">
              <a className="btn btn-ghost" href={productPath(p)}>Xem chi tiết</a>
              <a className="btn btn-ghost" href={`${productPath(p)}#theo-doi`}><Icon name="bell" size={15} /> Báo khi giảm</a>
              <a className="btn btn-primary" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">Mua trên {PLATFORMS[p.platform]?.label} <Icon name="external" size={14} /></a>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
