import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { DraftGuideButton } from "@/components/DemandActions";
import { Icon } from "@/components/Icon";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { demandReport, guidedQueries, marketSearchUrl, queryTopicKey, rising, type DemandRow } from "@/lib/demand";
import { PLATFORMS } from "@/lib/format";
import { gscConfig, gscOpportunities, gscRows, type GscOpportunity } from "@/lib/gsc";
import { siteUrl } from "@/lib/mail";
import { guideAiEnabled } from "@/worker/guide-ai";

export const metadata = { title: "Nhu cầu khách", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = [7, 30, 90];
const num = (x: number) => x.toLocaleString("vi-VN");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const dm = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(5, 10).split("-").reverse().join("/");

const STATUS: Record<DemandRow["status"], { label: string; cls: string }> = {
  missing: { label: "Không có kết quả", cls: "vs-poor" },
  thin: { label: "Ít kết quả", cls: "vs-needs-improvement" },
  covered: { label: "Đủ kết quả", cls: "vs-good" },
};
const GSC_KIND: Record<GscOpportunity["kind"], string> = {
  near: "Sắp lên top – thêm nội dung, thêm món",
  lowctr: "Top đầu nhưng ít người bấm – sửa tiêu đề/mô tả",
};

function Trend({ r }: { r: DemandRow }) {
  if (rising(r)) return <span className="vs vs-good" title={`Kỳ trước: ${r.prev} lượt`}>↑ tăng</span>;
  return null;
}

export default async function DemandAdmin({ searchParams }: { searchParams: Promise<{ ngay?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/nhu-cau");
  if (!isAdmin(user.email)) redirect("/admin");
  const days = DAYS.includes(Number((await searchParams).ngay)) ? Number((await searchParams).ngay) : 30;
  const [rep, guided] = await Promise.all([demandReport(days), guidedQueries()]);
  const aiOn = guideAiEnabled();
  const gsc = gscConfig();
  let gscOpp: GscOpportunity[] = [];
  let gscTotal = 0;
  let gscError: string | null = null;
  if (gsc) {
    try {
      const rows = await gscRows(28);
      gscTotal = rows.length;
      gscOpp = gscOpportunities(rows);
    } catch (e) {
      gscError = (e as Error).message;
    }
  }
  const site = siteUrl();
  const gaps = rep.rows.filter((r) => r.status !== "covered").slice(0, 30);
  const covered = rep.rows.filter((r) => r.status === "covered").slice(0, 30);
  const up = rep.rows.filter(rising).slice(0, 15);
  const zeroShare = rep.totals.searches ? rep.totals.zeroSearches / rep.totals.searches : 0;
  const guideBtn = (q: string) => <DraftGuideButton q={q} aiOn={aiOn} done={guided.has(queryTopicKey(q))} />;

  return (
    <>
      <AdminTabs current="/admin/nhu-cau" />
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Nhu cầu khách</h1>
        <nav className="seg" aria-label="Khoảng thời gian">
          {DAYS.map((d) => <Link key={d} href={d === 30 ? "/admin/nhu-cau" : `/admin/nhu-cau?ngay=${d}`} aria-current={d === days ? "page" : undefined}>{d} ngày</Link>)}
        </nav>
      </div>
      <p className="page-sub">
        Khách đang tìm gì mà site chưa có, hoặc chưa có trang riêng. Mỗi từ khoá có việc nên làm: nhập thêm món (tìm trên sàn, xuất CSV rồi nhập ở trang Sản phẩm)
        hoặc để AI soạn bài hướng dẫn từ giá thật – bạn đọc và duyệt ở <Link href="/admin/huong-dan">Hướng dẫn</Link> trước khi đăng.
      </p>

      <div className="kpis kpis-4">
        <div className="kpi"><span>Lượt tìm trên site ({days} ngày)</span><b>{num(rep.totals.searches)}</b></div>
        <div className="kpi"><span>Từ khoá khác nhau</span><b>{num(rep.totals.unique)}</b><small className="muted">đã gộp có/không dấu</small></div>
        <div className="kpi"><span>Lượt tìm không ra kết quả</span><b className={zeroShare > 0.2 ? "vs-poor" : undefined}>{pct(zeroShare)}</b><small className="muted">{num(rep.totals.zeroSearches)} lượt</small></div>
        <div className="kpi"><span>Link khách dán chưa có món</span><b>{num(rep.requests.pending)}</b><small className="muted">từ “Kiểm tra giá”</small></div>
      </div>

      <section className="section panel" aria-labelledby="gap-head">
        <h2 id="gap-head"><Icon name="search" /> Khách tìm nhưng không có / ít hàng</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          Mỗi dòng là khách đã rời đi tay trắng. Ưu tiên từ khoá nhiều lượt tìm: nhập thêm món đang bán (rồi tự có trang danh mục, trang “Giá … hôm nay”).
        </p>
        {gaps.length ? (
          <div className="table-wrap">
            <table className="table demand-table">
              <thead>
                <tr><th scope="col">Từ khoá</th><th scope="col" className="num">Lượt tìm</th><th scope="col">Kết quả lần cuối</th><th scope="col">Việc nên làm</th></tr>
              </thead>
              <tbody>
                {gaps.map((r) => (
                  <tr key={r.key}>
                    <td><a href={`/?q=${encodeURIComponent(r.q)}`} target="_blank" rel="noopener"><b>{r.q}</b></a> <Trend r={r} /><div className="muted" style={{ fontSize: 12.5 }}>lần cuối {dm(r.last)}</div></td>
                    <td className="num" data-label="Lượt tìm">{num(r.searches)}</td>
                    <td className="nw" data-label="Kết quả lần cuối"><span className={`vs ${STATUS[r.status].cls}`}>{r.lastResults ? `${r.lastResults} món` : STATUS[r.status].label}</span></td>
                    <td>
                      <span className="demand-acts">
                        {(["shopee", "lazada", "tiktok"] as const).map((p) => (
                          <a key={p} className="chip" href={marketSearchUrl(p, r.q)} target="_blank" rel="noopener" title={`Tìm "${r.q}" trên ${PLATFORMS[p]?.label ?? p} để nhập thêm món`}>
                            <Icon name="external" size={12} /> {PLATFORMS[p]?.label ?? p}
                          </a>
                        ))}
                        {r.status === "thin" && guideBtn(r.q)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{rep.totals.searches ? "Không có – khách tìm gì cũng ra kết quả." : "Chưa có lượt tìm nào trong khoảng này."}</p>
        )}
      </section>

      <section className="section panel" aria-labelledby="cov-head">
        <h2 id="cov-head"><Icon name="chart" /> Tìm nhiều – đã có trang riêng chưa?</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          Từ khoá khách tìm nhiều trên site thường cũng được tìm trên Google. Có trang riêng (danh mục, “Giá … hôm nay”, thương hiệu) hoặc bài hướng dẫn thì Google mới có trang để xếp hạng.
        </p>
        {covered.length ? (
          <div className="table-wrap">
            <table className="table demand-table">
              <thead>
                <tr><th scope="col">Từ khoá</th><th scope="col" className="num">Lượt tìm</th><th scope="col" className="num">Kết quả</th><th scope="col">Trang riêng</th><th scope="col">Việc nên làm</th></tr>
              </thead>
              <tbody>
                {covered.map((r) => (
                  <tr key={r.key}>
                    <td><a href={`/?q=${encodeURIComponent(r.q)}`} target="_blank" rel="noopener"><b>{r.q}</b></a> <Trend r={r} /></td>
                    <td className="num" data-label="Lượt tìm">{num(r.searches)}</td>
                    <td className="num" data-label="Kết quả">{num(r.lastResults)}</td>
                    <td data-label="Trang riêng">{r.landing ? <a href={r.landing.href} target="_blank" rel="noopener">{r.landing.label}</a> : <span className="muted">Chưa có</span>}</td>
                    <td>{guideBtn(r.q)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Chưa có từ khoá nào đủ kết quả.</p>
        )}
        {up.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Đang tăng <small className="muted">(gấp đôi kỳ trước)</small></h3>
            <nav className="chips wrap">
              {up.map((r) => <a key={r.key} className="chip" href={`/?q=${encodeURIComponent(r.q)}`} target="_blank" rel="noopener">{r.q} · {r.prev} → {r.searches}</a>)}
            </nav>
          </>
        )}
      </section>

      <section className="section panel" aria-labelledby="gsc-head">
        <h2 id="gsc-head"><Icon name="eye" /> Google: khách tìm gì mà thấy Săn Deal</h2>
        {!gsc ? (
          <>
            <p style={{ marginTop: 0 }}>Nối Google Search Console (chỉ đọc) để thấy từ khoá Google đang đưa khách tới và từ khoá <b>sắp lên top</b> – nơi thêm một chút nội dung là có thêm khách. Làm 1 lần:</p>
            <ol className="vm-tips">
              <li>Mở <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a> → tạo dự án → bật <b>Google Search Console API</b>.</li>
              <li>Vào <b>IAM &amp; Admin › Service Accounts</b> → tạo tài khoản dịch vụ → tab <b>Keys</b> → Add key › JSON (tải về 1 tệp .json).</li>
              <li>Trong <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Search Console</a> › Cài đặt › Người dùng và quyền → thêm email tài khoản dịch vụ, quyền <b>Bị hạn chế</b>.</li>
              <li>Thêm vào <code>.env</code> của máy chủ rồi khởi động lại:
                <pre className="code-block">{`GSC_SITE=sc-domain:${site.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
GSC_CLIENT_EMAIL=<client_email trong tệp .json>
GSC_PRIVATE_KEY="<private_key trong tệp .json, giữ nguyên \\n>"`}</pre>
              </li>
            </ol>
          </>
        ) : gscError ? (
          <div className="vt-verdict bad"><Icon name="alert" size={18} /><span>{gscError}</span></div>
        ) : gscOpp.length ? (
          <>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>28 ngày gần nhất (Google chậm ~2 ngày), {num(gscTotal)} cặp từ khoá – trang. Đây là các cơ hội nhiều lượt hiện nhất:</p>
            <div className="table-wrap">
              <table className="table demand-table">
                <thead>
                  <tr><th scope="col">Từ khoá Google</th><th scope="col">Trang</th><th scope="col" className="num">Lượt hiện</th><th scope="col" className="num">Bấm · CTR</th><th scope="col" className="num">Vị trí</th><th scope="col">Việc nên làm</th></tr>
                </thead>
                <tbody>
                  {gscOpp.map((r) => {
                    const path = r.page.replace(/^https?:\/\/[^/]+/, "") || "/";
                    return (
                      <tr key={`${r.query}|${r.page}`}>
                        <td><b>{r.query}</b></td>
                        <td style={{ wordBreak: "break-all", fontSize: 13 }}><a href={path} target="_blank" rel="noopener">{decodeURIComponent(path).slice(0, 60)}</a></td>
                        <td className="num" data-label="Lượt hiện">{num(r.impressions)}</td>
                        <td className="num" data-label="Bấm · CTR">{num(r.clicks)} · {pct(r.ctr)}</td>
                        <td className="num" data-label="Vị trí">{r.position.toFixed(1).replace(".", ",")}</td>
                        <td>
                          <div style={{ fontSize: 13 }}>{GSC_KIND[r.kind]}</div>
                          {r.kind === "near" && guideBtn(r.query)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Đã nối Search Console. Chưa có từ khoá nào đủ lượt hiện để gợi ý (site mới thường cần vài tuần).</p>
        )}
      </section>

      {rep.requests.top.length > 0 && (
        <section className="section panel" aria-labelledby="req-head">
          <h2 id="req-head"><Icon name="link" /> Link khách dán vào “Kiểm tra giá” mà site chưa theo dõi</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Máy chủ tự tra cứu các link này (tối đa 10 lần); tiện ích quản trị (cập nhật hàng loạt) cũng mở lần lượt từng link, link có người chờ báo trước. Món được nhiều người dán là món khách thật sự định mua.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Link</th><th scope="col">Sàn</th><th scope="col" className="num">Số lần dán</th><th scope="col">Lần cuối</th></tr></thead>
              <tbody>
                {rep.requests.top.map((r) => (
                  <tr key={r.url}>
                    <td style={{ wordBreak: "break-all", fontSize: 13 }}>
                      {r.nameHint && <b style={{ display: "block", wordBreak: "normal" }}>{r.nameHint}</b>}
                      <a href={r.url} target="_blank" rel="noopener nofollow">{r.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}</a>
                      {Number(r.watchers) > 0 && <div className="vs vs-good" style={{ fontSize: 12.5 }}>{Number(r.watchers)} người đang chờ báo</div>}
                    </td>
                    <td className="nw">{PLATFORMS[r.platform]?.label ?? r.platform}</td>
                    <td className="num">{r.count}</td>
                    <td className="nw">{dm(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
