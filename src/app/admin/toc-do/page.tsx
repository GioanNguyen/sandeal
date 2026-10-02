import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { Icon } from "@/components/Icon";
import { VitalsTrend } from "@/components/VitalsTrend";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { METRIC_INFO, METRICS, THRESHOLDS, fmtMetric, passes, rate, vitalsReport, type Metric, type MetricSummary, type Rating } from "@/lib/vitals";

export const metadata = { title: "Tốc độ trang", robots: { index: false } };
export const dynamic = "force-dynamic";

const RATING_TEXT: Record<Rating, string> = { good: "Tốt", "needs-improvement": "Cần cải thiện", poor: "Kém" };
const RATING_ICON: Record<Rating, "check" | "alert"> = { good: "check", "needs-improvement": "alert", poor: "alert" };

function Status({ metric, value }: { metric: Metric; value: number | null }) {
  if (value == null) return <span className="muted">–</span>;
  const r = rate(metric, value);
  return (
    <span className={`vs vs-${r}`}>
      <Icon name={RATING_ICON[r]} size={13} /> {fmtMetric(metric, value)}
    </span>
  );
}

function Tiles({ list, prev, device }: { list: MetricSummary[]; prev: (m: Metric, d: string) => number | null; device: string }) {
  return (
    <div className="vt-tiles">
      {list.map((s) => {
        const r = s.p75 == null ? null : rate(s.metric, s.p75);
        const before = prev(s.metric, device);
        const delta = s.p75 != null && before != null && before > 0 ? ((s.p75 - before) / before) * 100 : null;
        return (
          <div key={s.metric} className={`vt-tile${METRIC_INFO[s.metric].core ? " core" : ""}`}>
            <p className="vt-name"><b>{s.metric}</b> {METRIC_INFO[s.metric].name}</p>
            <p className="vt-val">{fmtMetric(s.metric, s.p75)}</p>
            {r ? (
              <p className={`vs vs-${r}`}><Icon name={RATING_ICON[r]} size={13} /> {RATING_TEXT[r]}</p>
            ) : (
              <p className="muted vt-small">Chưa có số đo</p>
            )}
            {s.n > 0 && (
              <>
                <div className="vt-bar" aria-hidden="true">
                  <i className="g" style={{ width: `${s.good}%` }} />
                  <i className="n" style={{ width: `${Math.max(0, 100 - s.good - s.poor)}%` }} />
                  <i className="p" style={{ width: `${s.poor}%` }} />
                </div>
                <p className="muted vt-small">
                  {Math.round(s.good)}% lượt tốt · {s.n.toLocaleString("vi-VN")} lượt đo
                  {delta != null && Math.abs(delta) >= 5 ? (
                    <> · {delta < 0 ? <span className="vs-good">nhanh hơn {Math.round(-delta)}%</span> : <span className="vs-poor">chậm hơn {Math.round(delta)}%</span>} kỳ trước</>
                  ) : null}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Verdict({ label, list }: { label: string; list: MetricSummary[] }) {
  const ok = passes(list);
  return (
    <div className={`vt-verdict ${ok == null ? "" : ok ? "ok" : "bad"}`}>
      <Icon name={ok ? "check" : ok == null ? "clock" : "alert"} size={18} />
      <span>
        <b>{label}:</b> {ok == null ? "chưa đủ số đo (cần ít nhất 20 lượt cho mỗi chỉ số chính)" : ok ? "đạt Core Web Vitals" : "chưa đạt Core Web Vitals"}
      </span>
    </div>
  );
}

export default async function SpeedPage({ searchParams }: { searchParams?: Promise<{ ngay?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/toc-do");
  if (!isAdmin(user.email)) redirect("/admin");
  const days = (await searchParams)?.ngay === "7" ? 7 : 28;
  const r = await vitalsReport(days);
  const total = r.views.mobile + r.views.desktop;

  return (
    <>
      <AdminTabs current="/admin/toc-do" />
      <div className="account-head">
        <h1 className="page-title">Tốc độ trang trên máy người dùng thật</h1>
        <nav className="seg" aria-label="Khoảng thời gian">
          <Link href="/admin/toc-do?ngay=7" aria-current={days === 7 ? "page" : undefined}>7 ngày</Link>
          <Link href="/admin/toc-do" aria-current={days === 28 ? "page" : undefined}>28 ngày</Link>
        </nav>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Đo trong trình duyệt của khách khi họ xem trang, gửi về khi rời trang. Số hiển thị là <b>p75</b>: 75% lượt xem nhanh hơn mức này – cách Google chấm điểm
        trong Search Console. Ba chỉ số chính (LCP, INP, CLS) ảnh hưởng tới thứ hạng tìm kiếm.
      </p>

      {total === 0 ? (
        <section className="panel">
          <h2><Icon name="gauge" /> Chưa có số đo</h2>
          <p className="muted" style={{ margin: 0 }}>
            Số đo sẽ xuất hiện sau khi có khách xem trang. Mỗi lượt xem gửi số đo khi khách rời hoặc chuyển sang tab khác. Bot và công cụ đo thử (Lighthouse,
            PageSpeed) không được tính.
          </p>
        </section>
      ) : (
        <>
          <div className="vt-verdicts">
            <Verdict label="Điện thoại" list={r.mobile} />
            <Verdict label="Máy tính" list={r.desktop} />
          </div>

          <section className="section">
            <h2>Điện thoại <span className="muted vt-small">{r.views.mobile.toLocaleString("vi-VN")} lượt xem</span></h2>
            <Tiles list={r.mobile} prev={r.prevP75} device="mobile" />
          </section>
          <section className="section">
            <h2>Máy tính <span className="muted vt-small">{r.views.desktop.toLocaleString("vi-VN")} lượt xem</span></h2>
            <Tiles list={r.desktop} prev={r.prevP75} device="desktop" />
          </section>

          <section className="section">
            <h2>Theo ngày trên điện thoại</h2>
            <div className="vt-trends">
              {(["LCP", "INP", "CLS"] as const).map((m) => (
                <div key={m} className="panel">
                  <h3 className="vt-h3"><b>{m}</b> {METRIC_INFO[m].name}</h3>
                  <VitalsTrend metric={m} days={r.trend.days} values={r.trend[m]} />
                </div>
              ))}
            </div>
          </section>

          <section className="section panel">
            <h2>Theo loại trang</h2>
            <div className="table-wrap">
              <table className="table vt-table">
                <caption className="sr-only">p75 theo loại trang, điện thoại và máy tính</caption>
                <thead>
                  <tr>
                    <th scope="col">Loại trang</th>
                    <th scope="col">Lượt xem</th>
                    <th scope="col">LCP điện thoại</th>
                    <th scope="col">INP điện thoại</th>
                    <th scope="col">CLS điện thoại</th>
                    <th scope="col">TTFB điện thoại</th>
                    <th scope="col">LCP máy tính</th>
                  </tr>
                </thead>
                <tbody>
                  {r.pages.map((p) => (
                    <tr key={p.page}>
                      <th scope="row">{p.page}</th>
                      <td>{p.views.toLocaleString("vi-VN")}</td>
                      <td><Status metric="LCP" value={p.mobile.LCP?.p75 ?? null} /></td>
                      <td><Status metric="INP" value={p.mobile.INP?.p75 ?? null} /></td>
                      <td><Status metric="CLS" value={p.mobile.CLS?.p75 ?? null} /></td>
                      <td><Status metric="TTFB" value={p.mobile.TTFB?.p75 ?? null} /></td>
                      <td><Status metric="LCP" value={p.desktop.LCP?.p75 ?? null} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {r.slowPaths.length > 0 && (
            <section className="section panel">
              <h2>Trang cần tăng tốc (LCP)</h2>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Trang có LCP p75 trên 2,5 giây (từ 3 lượt đo trở lên, cả điện thoại và máy tính) – nên xem trước.</p>
              <ol className="vt-slow">
                {r.slowPaths.map((s) => (
                  <li key={s.path}>
                    <a href={s.path} target="_blank" rel="noopener">{s.path}</a>
                    <span className="muted"> · {s.page} · {s.n} lượt</span>
                    <Status metric="LCP" value={s.p75} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <section className="section panel">
        <h2>Các chỉ số và ngưỡng</h2>
        <ul className="vt-legend">
          {METRICS.map((m) => (
            <li key={m}>
              <b>{m} – {METRIC_INFO[m].name}{METRIC_INFO[m].core ? " (chỉ số chính)" : ""}:</b> {METRIC_INFO[m].what}. Tốt ≤ {fmtMetric(m, THRESHOLDS[m][0])}, kém &gt;{" "}
              {fmtMetric(m, THRESHOLDS[m][1])}.
            </li>
          ))}
        </ul>
        <p className="muted vt-small" style={{ margin: "10px 0 0" }}>
          Gợi ý khi chậm: LCP cao trên trang sản phẩm thường do ảnh lớn hoặc máy chủ phản hồi chậm (xem TTFB); INP cao do trang chạy nhiều mã khi bấm; CLS cao
          do ảnh/quảng cáo không giữ sẵn chỗ. Số đo được giữ 60 ngày. Tắt bằng <code>VITALS=0</code>, chỉ đo một phần lượt xem bằng <code>VITALS_SAMPLE=0.5</code>.
        </p>
      </section>
    </>
  );
}
