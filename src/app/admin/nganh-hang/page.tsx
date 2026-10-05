import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { DEFAULT_CR, MIN_VIEWS, NO_CAT, categoryStats, sortCategories, type CategorySort } from "@/lib/categorystats";
import { slugify } from "@/lib/slug";

export const metadata = { title: "Ngành hàng", robots: { index: false } };
export const dynamic = "force-dynamic";

const SORTS: { key: CategorySort; label: string }[] = [
  { key: "rpm", label: "HH ước tính / 1.000 lượt xem" },
  { key: "commission", label: "Hoa hồng mỗi đơn" },
  { key: "rate", label: "Tỉ lệ hoa hồng" },
  { key: "watchRate", label: "Tỉ lệ đặt cảnh báo" },
  { key: "clickRate", label: "Tỉ lệ bấm mua" },
  { key: "views", label: "Lượt xem" },
  { key: "products", label: "Số món" },
];
const DAYS = [7, 30, 90];

const pct = (x: number | null, d = 1) => (x == null ? "–" : `${(x * 100).toFixed(d).replace(".", ",")}%`);
const money = (x: number | null) => (x == null ? "–" : `${Math.round(x).toLocaleString("vi-VN")}đ`);
const num = (x: number) => x.toLocaleString("vi-VN");

export default async function CategoryAdmin({ searchParams }: { searchParams: Promise<{ xep?: string; ngay?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/nganh-hang");
  if (!isAdmin(user.email)) redirect("/admin");
  const sp = await searchParams;
  const days = DAYS.includes(Number(sp.ngay)) ? Number(sp.ngay) : 30;
  const sort = (SORTS.find((s) => s.key === sp.xep)?.key ?? "rpm") as CategorySort;
  const st = await categoryStats(days);
  const rows = sortCategories(st.rows, sort);
  const href = (p: { xep?: string; ngay?: number }) => {
    const u = new URLSearchParams();
    const xep = p.xep ?? sort;
    const ngay = p.ngay ?? days;
    if (xep !== "rpm") u.set("xep", xep);
    if (ngay !== 30) u.set("ngay", String(ngay));
    const s = u.toString();
    return s ? `/admin/nganh-hang?${s}` : "/admin/nganh-hang";
  };
  // Gợi ý: chỉ ngành đủ lượt xem và có từ 3 món (1–2 món dễ cho số liệu ảo)
  const top = sortCategories(st.rows, "rpm").filter((r) => r.enough && r.rpm != null && r.products >= 3).slice(0, 3);

  return (
    <>
      <AdminTabs current="/admin/nganh-hang" />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Ngành hàng</h1>
        <nav className="seg" aria-label="Khoảng thời gian">
          {DAYS.map((d) => <Link key={d} href={href({ ngay: d })} aria-current={d === days ? "page" : undefined}>{d} ngày</Link>)}
        </nav>
      </div>
      <p className="page-sub">
        Chọn ngành để tập trung bằng số liệu thật: hoa hồng mỗi đơn (từ tỉ lệ hoa hồng sàn trả), khách có bấm mua không, có đặt cảnh báo giá
        (sẽ quay lại) không. Ngành có ít hơn {MIN_VIEWS} lượt xem trong kỳ được làm mờ vì tỉ lệ chưa đáng tin.
      </p>

      <div className="kpis kpis-4">
        <div className="kpi"><span>Lượt xem sản phẩm ({days} ngày)</span><b>{num(st.totals.views)}</b></div>
        <div className="kpi"><span>Tỉ lệ bấm mua</span><b>{pct(st.totals.clickRate)}</b><small className="muted">{num(st.totals.clicks)} lượt bấm</small></div>
        <div className="kpi"><span>Tỉ lệ đặt cảnh báo</span><b className="save">{pct(st.totals.watchRate, 2)}</b><small className="muted">{num(st.totals.watches)} cảnh báo mới</small></div>
        <div className="kpi">
          <span>Tỉ lệ chốt đơn dùng để ước tính</span><b>{pct(st.cr.value)}</b>
          <small className="muted">{st.cr.fromOrders ? `${num(st.totals.orders)} đơn / ${num(st.totals.clicks)} lượt bấm (báo cáo sàn)` : `mặc định ${pct(DEFAULT_CR, 0)} – chưa đủ đơn hàng để tính`}</small>
        </div>
      </div>

      {top.length > 0 && (
        <p className="data-intro">
          <b>Gợi ý:</b> {top.map((r, i) => <span key={r.category}>{i ? ", " : ""}<b>{r.category}</b> ({money(r.rpm)} / 1.000 lượt xem)</span>)} đang mang lại nhiều hoa hồng ước tính nhất trên mỗi lượt xem.
          Tăng số món và nội dung cho các ngành này trước.
        </p>
      )}

      <section className="section" aria-labelledby="cat-head">
        <h2 id="cat-head" className="sr-only">Bảng ngành hàng</h2>
        <nav className="chips wrap ph-filters" aria-label="Sắp xếp" style={{ marginBottom: 12 }}>
          {SORTS.map((s) => <Link key={s.key} className="chip" href={href({ xep: s.key })} aria-current={s.key === sort ? "page" : undefined}>{s.label}</Link>)}
        </nav>
        <div className="table-wrap">
          <table className="table cat-table">
            <thead>
              <tr>
                <th>Ngành</th>
                <th className="num">Số món<br /><small className="muted">đang hiện</small></th>
                <th className="num">Tỉ lệ HH</th>
                <th className="num">HH / đơn<br /><small className="muted">giá phổ biến</small></th>
                <th className="num">Lượt xem</th>
                <th className="num">Bấm mua</th>
                <th className="num">Đặt cảnh báo</th>
                <th className="num">HH ước tính<br /><small className="muted">/ 1.000 lượt xem</small></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className={r.enough ? undefined : "cat-thin"}>
                  <td>
                    {r.category === NO_CAT ? <span className="muted">{r.category}</span> : <Link href={`/danh-muc/${slugify(r.category)}`} target="_blank">{r.category}</Link>}
                    {r.withRate < r.products && <small className="muted" style={{ display: "block" }}>{r.withRate}/{r.products} món có tỉ lệ HH</small>}
                  </td>
                  <td className="num">{num(r.products)}<br /><small className="muted">{num(r.available)}</small></td>
                  <td className="num">{pct(r.avgRate)}</td>
                  <td className="num"><b>{money(r.avgCommission)}</b><br /><small className="muted">{money(r.medianPrice)}</small></td>
                  <td className="num">{num(r.views)}</td>
                  <td className="num">{num(r.clicks)}<br /><small className="muted">{pct(r.clickRate)}</small></td>
                  <td className="num">{num(r.watches)}<br /><small className="muted">{pct(r.watchRate, 2)}</small></td>
                  <td className="num"><b>{money(r.rpm)}</b></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="muted">Chưa có sản phẩm.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          HH / đơn = trung bình (giá × tỉ lệ hoa hồng) của các món có tỉ lệ hoa hồng – chỉ là ước tính, hoa hồng thật tính trên giá trị cả đơn và có thể bị trừ khi đơn huỷ.
          HH ước tính / 1.000 lượt xem = 1.000 × tỉ lệ bấm mua × tỉ lệ chốt đơn × HH / đơn. Lượt xem: mỗi khách mỗi món mỗi ngày tính 1 lần.
        </p>
      </section>
    </>
  );
}
