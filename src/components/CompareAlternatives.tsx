import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { PLATFORMS, vnd } from "@/lib/format";
import { CardImage } from "./CardImage";
import { Icon } from "./Icon";

type Row = { label: string; get: (p: DealRow) => number | null; show: (p: DealRow) => React.ReactNode; better: "low" | "high" };

const ROWS: Row[] = [
  { label: "Giá hiện tại", get: (p) => p.price, show: (p) => vnd(p.price), better: "low" },
  { label: "Giá sau mã", get: (p) => p.withVoucher?.price ?? p.price, show: (p) => (p.withVoucher ? vnd(p.withVoucher.price) : <span className="muted">Không có mã</span>), better: "low" },
  { label: "Giảm thật (so với 30 ngày)", get: (p) => (p.realDropPct >= 1 ? p.realDropPct : 0), show: (p) => (p.realDropPct >= 1 ? `−${Math.round(p.realDropPct)}%` : <span className="muted">Không giảm</span>), better: "high" },
  { label: "Đánh giá", get: (p) => p.rating ?? null, show: (p) => (p.rating ? <><Icon name="star" size={13} /> {p.rating.toFixed(1)}</> : "—"), better: "high" },
  { label: "Đã bán", get: (p) => p.sold ?? null, show: (p) => (p.sold ? p.sold.toLocaleString("vi-VN") : "—"), better: "high" },
  { label: "Điểm deal", get: (p) => Math.round(p.dealScore), show: (p) => `${Math.round(p.dealScore)}/100`, better: "high" },
];

/** "Món này hay món kia?": bảng so sánh món đang xem với 2 món cùng loại, ô tốt nhất mỗi hàng được tô xanh */
export function CompareAlternatives({ current, others }: { current: DealRow; others: DealRow[] }) {
  if (!others.length) return null;
  const cols = [current, ...others];
  return (
    <section className="section" aria-labelledby="alt-head">
      <div className="section-head">
        <h2 id="alt-head"><Icon name="scale" size={22} /> Món này hay món kia?</h2>
        <span className="muted" style={{ fontSize: 13 }}>So với món cùng loại · ô xanh là tốt nhất</span>
      </div>
      <div className="alt-wrap">
        <table className="alt-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Tiêu chí</span></th>
              {cols.map((p, i) => (
                <th key={p.id} scope="col" className={i === 0 ? "is-current" : undefined}>
                  <Link href={`/product/${p.id}`} className="alt-head" aria-current={i === 0 ? "page" : undefined}>
                    <span className="alt-img"><CardImage src={p.imageUrl} /></span>
                    <span className="alt-name">{p.name}</span>
                    <span className="alt-meta">{PLATFORMS[p.platform]?.label}{p.shopType === "mall" ? " · Mall" : ""}{i === 0 ? " · đang xem" : ""}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const vals = cols.map(r.get);
              const nums = vals.filter((v): v is number => v != null);
              const best = nums.length > 1 && new Set(nums).size > 1 ? (r.better === "low" ? Math.min(...nums) : Math.max(...nums)) : null;
              return (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {cols.map((p, i) => (
                    <td key={p.id} className={`${vals[i] != null && vals[i] === best ? "best" : ""}${i === 0 ? " is-current" : ""}`}>
                      {r.show(p)}{vals[i] != null && vals[i] === best && <Icon name="check" size={13} />}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row"><span className="sr-only">Hành động</span></th>
              {cols.map((p, i) => (
                <td key={p.id} className={i === 0 ? "is-current" : undefined}>
                  {i === 0 ? (
                    <a className="btn btn-primary btn-sm" href={`/go/${p.id}`} target="_blank" rel="nofollow sponsored noopener">Mua <Icon name="external" size={13} /></a>
                  ) : (
                    <Link className="btn btn-ghost btn-sm" href={`/product/${p.id}`}>Xem món này</Link>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
