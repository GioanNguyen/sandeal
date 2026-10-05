import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { BarChart } from "@/components/BarChart";
import { Icon } from "@/components/Icon";
import { RevenueImport } from "@/components/RevenueImport";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { channelLabel } from "@/lib/channel";
import { vnd } from "@/lib/format";
import { DEFAULT_CANCEL_RATE, MIN_SETTLED, revenueReport } from "@/lib/revenue";
import { productPath, slugify } from "@/lib/slug";

export const metadata = { title: "Doanh thu", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const TZ_MS = 7 * 3_600_000;
const num = (x: number) => x.toLocaleString("vi-VN");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const ATTR: Record<string, { label: string; hint: string }> = {
  exact: { label: "Bấm đúng món rồi mua", hint: "Khách bấm “Mua” món này trên Săn Deal trong 7 ngày trước khi đặt" },
  cart: { label: "Mua thêm món khác", hint: "Khách vào sàn qua link Săn Deal (món/mã khác) rồi mua thêm món này – sàn vẫn trả hoa hồng" },
  none: { label: "Không tìm được lượt bấm", hint: "Link đăng ở nơi khác (bài Facebook, nhóm…) dẫn thẳng sang sàn, hoặc bấm quá 7 ngày" },
};

type Period = { key: string; label: string; from: Date; to: Date };

/** Mốc 0h ngày/tháng theo giờ Việt Nam */
function periods(now: Date): Period[] {
  const vn = new Date(now.getTime() + TZ_MS);
  const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - TZ_MS);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const tomorrow = new Date(Date.UTC(y, m, vn.getUTCDate() + 1) - TZ_MS);
  return [
    { key: "thang-nay", label: "Tháng này", from: monthStart(y, m), to: tomorrow },
    { key: "thang-truoc", label: "Tháng trước", from: monthStart(y, m - 1), to: monthStart(y, m) },
    { key: "30", label: "30 ngày", from: new Date(tomorrow.getTime() - 30 * DAY), to: tomorrow },
    { key: "90", label: "90 ngày", from: new Date(tomorrow.getTime() - 90 * DAY), to: tomorrow },
  ];
}

const monthLabel = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;

export default async function RevenueAdmin({ searchParams }: { searchParams: Promise<{ ky?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/doanh-thu");
  if (!isAdmin(user.email)) redirect("/admin");
  const now = new Date();
  const all = periods(now);
  const ky = (await searchParams).ky;
  const p = all.find((x) => x.key === ky) ?? all[0];
  const r = await revenueReport(p.from, p.to, now);
  const t = r.totals;
  const live = Number(t.completed) + Number(t.pending);
  const epc = r.clicks ? r.expected / r.clicks : null;
  const matched = r.byAttribution.filter((a) => a.attribution !== "none").reduce((s, a) => s + a.commission, 0);

  const dayCount = Math.min(92, Math.round((p.to.getTime() - p.from.getTime()) / DAY));
  const dayMap = new Map(r.daily.map((d) => [d.day, d.completed + d.pending]));
  const days = Array.from({ length: dayCount }, (_, i) => {
    const key = new Date(p.from.getTime() + TZ_MS + i * DAY).toISOString().slice(0, 10);
    return { key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, value: dayMap.get(key) ?? 0 };
  });

  return (
    <>
      <AdminTabs current="/admin/doanh-thu" />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Doanh thu</h1>
        <nav className="seg" aria-label="Khoảng thời gian">
          {all.map((x) => <Link key={x.key} href={x.key === "thang-nay" ? "/admin/doanh-thu" : `/admin/doanh-thu?ky=${x.key}`} aria-current={x.key === p.key ? "page" : undefined}>{x.label}</Link>)}
        </nav>
      </div>
      <p className="page-sub">
        Hoa hồng theo từng dòng sản phẩm trong đơn, tách <b>đã chốt</b> / <b>đang chờ</b> / <b>bị huỷ</b>, và ghép với lượt bấm “Mua” trên site để biết kênh, món, ngành nào thật sự ra tiền.
        Tính theo ngày đặt hàng (giờ Việt Nam).
      </p>

      <section className="panel rev-source" aria-label="Nguồn dữ liệu">
        <div>
          <b>Nguồn dữ liệu:</b>{" "}
          {r.lastImport ? (
            <>lần cập nhật gần nhất {r.lastImport.at.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })} ({r.lastImport.source === "csv" ? "tệp CSV" : r.lastImport.source === "api" ? "API Shopee, tự đồng bộ" : "dữ liệu mẫu"}).</>
          ) : (
            <>chưa có đơn nào.</>
          )}{" "}
          <span className="muted">Chưa có Open API: ở trang Shopee Affiliate, mở báo cáo đơn hàng / chuyển đổi (Conversion report), xuất tệp .csv rồi nhập ở đây. Nhập lại tệp mới thì đơn cũ được cập nhật trạng thái, không bị cộng trùng.</span>
        </div>
        <RevenueImport />
      </section>

      <div className="kpis kpis-4">
        <div className="kpi"><span>Ước tính thực nhận</span><b className="save">{vnd(r.expected)}</b><small className="muted">đã chốt + đang chờ × {pct(1 - r.cancel.rate)}</small></div>
        <div className="kpi"><span>Đã chốt (hoàn thành)</span><b>{vnd(Number(t.completed))}</b><small className="muted">{num(Number(t.orders))} đơn · doanh số {vnd(Number(t.amount))}</small></div>
        <div className="kpi"><span>Đang chờ</span><b>{vnd(Number(t.pending))}</b><small className="muted">còn có thể bị huỷ/trả hàng</small></div>
        <div className="kpi"><span>Bị huỷ</span><b className={Number(t.cancelled) ? "vs-poor" : undefined}>{vnd(Number(t.cancelled))}</b><small className="muted">{num(Number(t.cancelledOrders))} đơn có dòng bị huỷ / trả hàng</small></div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, marginTop: -4 }}>
        Tỉ lệ huỷ dùng để ước tính: <b>{pct(r.cancel.rate)}</b>{" "}
        {r.cancel.fromData ? `– theo giá trị hàng của ${num(r.cancel.settled)} đơn đã có kết quả trong 90 ngày (bỏ 14 ngày gần nhất).` : `– mặc định ${pct(DEFAULT_CANCEL_RATE)} vì chưa đủ ${MIN_SETTLED} đơn đã có kết quả để tính.`}
        {" "}· {num(r.clicks)} lượt bấm “Mua” · hoa hồng ước tính / lượt bấm: <b>{epc == null ? "–" : vnd(epc)}</b>
      </p>

      <section className="panel section" aria-labelledby="day-head">
        <h2 id="day-head">Hoa hồng mỗi ngày <small className="muted">(đã chốt + đang chờ)</small></h2>
        <BarChart label="Hoa hồng mỗi ngày" data={days} format={vnd} />
      </section>

      <div className="admin-grid">
        <section className="panel" aria-labelledby="ch-head">
          <h2 id="ch-head"><Icon name="users" /> Theo kênh khách tới</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Kênh</th><th scope="col" className="num">Lượt bấm</th><th scope="col" className="num">Đơn</th><th scope="col" className="num">Hoa hồng</th><th scope="col" className="num">/ lượt bấm</th></tr></thead>
              <tbody>
                {r.byChannel.map((c) => (
                  <tr key={c.channel}>
                    <td>{c.channel === "none" ? <span className="muted" title={ATTR.none.hint}>Không ghép được</span> : channelLabel(c.channel)}</td>
                    <td className="num">{c.channel === "none" ? "–" : num(c.clicks)}</td>
                    <td className="num">{num(c.orders)}</td>
                    <td className="num">{vnd(c.commission)}</td>
                    <td className="num">{c.clicks ? vnd(c.commission / c.clicks) : "–"}</td>
                  </tr>
                ))}
                {!r.byChannel.length && <tr><td colSpan={5} className="muted">Chưa có lượt bấm hay đơn hàng trong kỳ.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
            Kênh ghi theo nguồn khách vào site gần nhất (link có utm_source, Facebook, Google…) trong 7 ngày. Hoa hồng tính đơn chưa huỷ.
          </p>
        </section>
        <section className="panel" aria-labelledby="att-head">
          <h2 id="att-head"><Icon name="link" /> Đơn ghép được với lượt bấm</h2>
          <p style={{ marginTop: 0 }}>
            <b>{live ? pct(matched / live) : "–"}</b> hoa hồng kỳ này ghép được với lượt bấm trên site.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Cách ghép</th><th scope="col" className="num">Đơn</th><th scope="col" className="num">Hoa hồng</th></tr></thead>
              <tbody>
                {r.byAttribution.map((a) => (
                  <tr key={a.attribution}>
                    <td>{ATTR[a.attribution]?.label ?? a.attribution}<div className="muted" style={{ fontSize: 12.5 }}>{ATTR[a.attribution]?.hint}</div></td>
                    <td className="num">{num(a.orders)}</td>
                    <td className="num">{vnd(a.commission)}</td>
                  </tr>
                ))}
                {!r.byAttribution.length && <tr><td colSpan={3} className="muted">Chưa có đơn.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="admin-grid">
        <section className="panel" aria-labelledby="top-head">
          <h2 id="top-head"><Icon name="trophy" /> Món ra hoa hồng nhiều nhất</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Sản phẩm</th><th scope="col" className="num">Đơn · SL</th><th scope="col" className="num">Hoa hồng</th></tr></thead>
              <tbody>
                {r.topProducts.map((x) => (
                  <tr key={`${x.productId}-${x.itemId}`}>
                    <td>
                      {x.productId ? <Link href={productPath({ id: x.productId, name: x.name })} target="_blank">{x.name}</Link> : <span>{x.name}</span>}
                      {!x.tracked && <div className="muted" style={{ fontSize: 12.5 }}>Chưa có trên site – khách mua thêm khi vào sàn</div>}
                    </td>
                    <td className="num">{num(x.orders)} · {num(x.qty)}</td>
                    <td className="num">{vnd(x.commission)}</td>
                  </tr>
                ))}
                {!r.topProducts.length && <tr><td colSpan={3} className="muted">Chưa có đơn có mã sản phẩm (API cơ bản không trả mã – nhập CSV báo cáo để có chi tiết).</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" aria-labelledby="cat-head">
          <h2 id="cat-head"><Icon name="grid" /> Theo ngành hàng</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Ngành</th><th scope="col" className="num">Lượt bấm</th><th scope="col" className="num">Đơn</th><th scope="col" className="num">Hoa hồng</th><th scope="col" className="num">/ lượt bấm</th></tr></thead>
              <tbody>
                {r.byCategory.map((c) => (
                  <tr key={c.category}>
                    <td><Link href={`/danh-muc/${slugify(c.category)}`} target="_blank">{c.category}</Link></td>
                    <td className="num">{num(c.clicks)}</td>
                    <td className="num">{num(c.orders)}</td>
                    <td className="num">{vnd(c.commission)}</td>
                    <td className="num">{c.clicks ? vnd(c.commission / c.clicks) : "–"}</td>
                  </tr>
                ))}
                {!r.byCategory.length && <tr><td colSpan={5} className="muted">Chưa có đơn ghép được với món trên site.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Chỉ tính các dòng nhận ra món trên site. Xem thêm tỉ lệ hoa hồng từng ngành ở <Link href="/admin/nganh-hang">Ngành hàng</Link>.</p>
        </section>
      </div>

      <section className="panel section" aria-labelledby="mon-head">
        <h2 id="mon-head"><Icon name="calendar" /> Theo tháng – để đối chiếu với sàn</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th scope="col">Tháng đặt hàng</th><th scope="col" className="num">Đơn</th><th scope="col" className="num">Đã chốt</th><th scope="col" className="num">Đang chờ</th><th scope="col" className="num">Bị huỷ</th><th scope="col" className="num">Hoàn thành trong tháng<br /><small className="muted">theo ngày hoàn thành</small></th></tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month}>
                  <td className="nw">{monthLabel(m.month)}</td>
                  <td className="num">{num(m.orders)}</td>
                  <td className="num">{vnd(m.completed)}</td>
                  <td className="num">{m.pending ? vnd(m.pending) : "–"}</td>
                  <td className="num">{m.cancelled ? vnd(m.cancelled) : "–"}</td>
                  <td className="num">{m.completedInMonth ? vnd(m.completedInMonth) : "–"}</td>
                </tr>
              ))}
              {!r.months.length && <tr><td colSpan={6} className="muted">Chưa có đơn.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
          Sàn thường tính tiền theo ngày đơn <b>hoàn thành</b>, không theo ngày đặt – cột cuối dùng để so với số tiền sàn báo trả (chỉ có khi nguồn dữ liệu ghi ngày hoàn thành).
          Điều kiện thanh toán cụ thể xem trên trang affiliate của sàn.
        </p>
      </section>
    </>
  );
}
