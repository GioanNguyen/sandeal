import Link from "next/link";
import type { Advice } from "@/lib/advice";
import { vnd } from "@/lib/format";
import { Icon, type IconName } from "./Icon";

const META: Record<Advice["verdict"], { icon: IconName; cls: string }> = {
  buy: { icon: "check", cls: "buy" },
  consider: { icon: "scale", cls: "consider" },
  wait: { icon: "clock", cls: "wait" },
  new: { icon: "clock", cls: "new" },
};

const dm = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

/** Ô kết luận "Nên mua ngay hay chờ?" kèm thước giá: thấp nhất – thường ngày – cao nhất */
export function AdviceBox({ a, price, buyHref, buyLabel, cheaperElsewhere }: {
  a: Advice;
  price: number;
  buyHref: string;
  buyLabel: string;
  cheaperElsewhere?: { label: string; save: number; href: string } | null;
}) {
  const m = META[a.verdict];
  const span = Math.max(1, a.high - a.low);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - a.low) / span) * 100))}%`;
  const showGauge = a.verdict !== "new" && a.high > a.low;
  // Giá tốt nhưng sàn khác đang rẻ hơn -> hướng khách sang chỗ rẻ hơn thay vì bảo "mua ngay" ở đây
  const elsewhere = a.verdict === "buy" && cheaperElsewhere ? cheaperElsewhere : null;
  const title = elsewhere ? `Giá tốt – nhưng ${elsewhere.label} còn rẻ hơn` : a.title;
  return (
    <section className={`advice ${m.cls}`} aria-labelledby="advice-head">
      <div className="advice-head">
        <span className="advice-icon" aria-hidden="true"><Icon name={m.icon} size={20} /></span>
        <div>
          <small>Nên mua ngay hay chờ?</small>
          <h2 id="advice-head">{title}</h2>
        </div>
        {a.verdict !== "new" && <span className="advice-chip" title="Tính theo thời lượng giá được giữ trong lịch sử theo dõi">Rẻ hơn {Math.round(a.cheaperThanPct)}% thời gian</span>}
      </div>

      {showGauge && (
        <div className="gauge" role="img" aria-label={`Giá hiện tại ${vnd(price)}, thấp nhất ${vnd(a.low)}, thường ngày ${vnd(a.usual)}, cao nhất ${vnd(a.high)}`}>
          <div className="gauge-track">
            <span className="gauge-usual" style={{ left: pos(a.usual) }}><i>Thường ngày</i></span>
            <span className="gauge-now" style={{ left: pos(price) }}><b>{vnd(price)}</b></span>
          </div>
          <div className="gauge-ends">
            <span><b className="save">{vnd(a.low)}</b> thấp nhất{a.lowAt ? ` · ${dm.format(a.lowAt)}` : ""}</span>
            <span><b>{vnd(a.high)}</b> cao nhất</span>
          </div>
        </div>
      )}

      <ul className="advice-reasons">
        {a.reasons.map((r) => <li key={r}>{r}</li>)}
        {cheaperElsewhere && (
          <li className="warn-line">
            <b>{cheaperElsewhere.label}</b> đang bán rẻ hơn {vnd(cheaperElsewhere.save)} – <Link href={cheaperElsewhere.href}>xem bên đó</Link>.
          </li>
        )}
      </ul>

      <div className="advice-actions">
        {elsewhere ? (
          <>
            <Link className="btn btn-primary" href={elsewhere.href}>Xem giá rẻ hơn ở {elsewhere.label} <Icon name="arrowRight" size={16} /></Link>
            <a className="btn btn-ghost" href={buyHref} target="_blank" rel="nofollow sponsored noopener">{buyLabel} <Icon name="external" size={14} /></a>
          </>
        ) : a.verdict === "buy" ? (
          <a className="btn btn-primary" href={buyHref} target="_blank" rel="nofollow sponsored noopener">{buyLabel} <Icon name="external" size={16} /></a>
        ) : (
          <>
            <a className="btn btn-primary" href="#theo-doi"><Icon name="bell" size={16} /> Báo tôi khi giá giảm</a>
            <a className="btn btn-ghost" href={buyHref} target="_blank" rel="nofollow sponsored noopener">Vẫn mua <Icon name="external" size={14} /></a>
          </>
        )}
      </div>
    </section>
  );
}
