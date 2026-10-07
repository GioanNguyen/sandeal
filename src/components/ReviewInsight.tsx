import type { Insight } from "@/lib/reviews";
import { RISK_LABEL } from "@/lib/reviews/risk";
import { PLATFORMS } from "@/lib/format";
import { Icon } from "./Icon";

/** Hộp cảnh báo gọn ngay dưới giá (chỉ hiện khi có dấu hiệu mức vừa trở lên) */
export function RiskAlert({ risk }: { risk: Insight["risk"] }) {
  if (risk.level !== "high" && risk.level !== "medium") return null;
  const top = risk.flags.filter((f) => f.level !== "low");
  return (
    <a className={`risk-alert r-${risk.level}`} href="#danh-gia">
      <Icon name="alert" size={18} />
      <span>
        <b>{RISK_LABEL[risk.level]}:</b> {top[0].title.toLowerCase()}
        {top.length > 1 ? ` và ${top.length - 1} dấu hiệu khác` : ""}
      </span>
      <span className="risk-more">Xem chi tiết</span>
    </a>
  );
}

function Stars({ dist, label }: { dist: number[]; label: string }) {
  const total = dist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="rv-stars" aria-label={label}>
      {[5, 4, 3, 2, 1].map((s) => {
        const n = dist[s - 1];
        const w = Math.round((n / total) * 100);
        return (
          <div key={s} className="rv-star-row">
            <span>{s}★</span>
            <span className="rv-bar"><i style={{ width: `${w}%` }} className={s <= 2 ? "bad" : s === 3 ? "mid" : ""} /></span>
            <span className="muted">{w}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Mục "Đánh giá & rủi ro" trên trang sản phẩm */
export function ReviewPanel({ insight, platform }: { insight: Insight; platform: string }) {
  const { reviews: r, ai, risk } = insight;
  const label = PLATFORMS[platform]?.label ?? platform;
  const pros = ai?.pros.length ? ai.pros : r?.pros ?? [];
  const cons = ai?.cons.length ? ai.cons : r?.cons ?? [];
  const summary = ai?.summary || r?.headline || "";
  const dist = insight.starCounts ?? r?.dist ?? null;

  return (
    <section className="panel rv-panel" id="danh-gia" aria-labelledby="rv-head">
      <h2 id="rv-head"><Icon name="shield" /> Đánh giá người mua &amp; rủi ro</h2>

      <div className={`rv-risk r-${risk.level}`}>
        <p className="rv-risk-title">
          <Icon name={risk.level === "none" ? "check" : "alert"} size={18} /> {RISK_LABEL[risk.level]}
        </p>
        {risk.flags.length > 0 ? (
          <ul className="rv-flags">
            {risk.flags.map((f) => (
              <li key={f.key} className={`lv-${f.level}`}>
                <b>{f.title}</b>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted rv-risk-note">
            Lịch sử giá và thông tin shop chưa có gì bất thường{r?.count ? ", các đánh giá thu được cũng không có phản ánh đáng lo" : ""}. Vẫn nên xem kỹ phân loại và chính sách đổi trả trước khi mua.
          </p>
        )}
      </div>

      {r && r.count > 0 ? (
        <>
          {summary && (
            <div className="rv-summary">
              {ai && <span className="rv-ai"><Icon name="sparkles" size={14} /> Tóm tắt bằng AI</span>}
              <p>{summary}</p>
            </div>
          )}
          {(pros.length > 0 || cons.length > 0) && (
            <div className="rv-pc">
              {pros.length > 0 && (
                <div>
                  <p className="rv-pc-h good"><Icon name="thumbUp" size={15} /> Được khen</p>
                  <ul>{pros.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              {cons.length > 0 && (
                <div>
                  <p className="rv-pc-h bad"><Icon name="thumbDown" size={15} /> Bị chê</p>
                  <ul>{cons.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <div className="rv-grid">
            {dist && <Stars dist={dist} label="Tỉ lệ đánh giá theo số sao" />}
            {r.aspects.length > 0 && (
              <ul className="rv-aspects" aria-label="Người mua nói gì theo từng khía cạnh">
                {r.aspects.slice(0, 6).map((a) => {
                  const t = a.pos + a.neg;
                  return (
                    <li key={a.key} title={a.example ? `“${a.example}”` : undefined}>
                      <span className="rv-a-name">{a.label}</span>
                      <span className="rv-a-bar" aria-hidden="true"><i style={{ width: `${Math.round((a.pos / t) * 100)}%` }} /></span>
                      <span className="muted rv-a-n">{a.pos} khen · {a.neg} chê</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="muted rv-note">
            Dựa trên {r.count} đánh giá{insight.ratingCount ? ` (trong tổng ${insight.ratingCount.toLocaleString("vi-VN")} lượt trên ${label})` : ` trên ${label}`} mà Săn Deal ghi nhận từ trang sản phẩm
            {ai ? ". Tóm tắt do AI viết từ nội dung đánh giá, có thể chưa chính xác hoàn toàn." : "."}
          </p>
        </>
      ) : (
        <p className="muted rv-note">
          Chưa có đánh giá của người mua cho món này. Cảnh báo ở trên dựa vào lịch sử giá và thông tin shop. Xem thêm đánh giá trực tiếp trên {label}.
        </p>
      )}
    </section>
  );
}
