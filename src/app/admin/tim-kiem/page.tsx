import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { Icon } from "@/components/Icon";
import { IndexNowButton } from "@/components/IndexNowButton";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { KEY_PATH, indexNowHistory, indexNowStatus } from "@/lib/indexnow";
import { siteUrl } from "@/lib/mail";
import { sitemapFiles } from "@/lib/sitemaps";
import { SEO_RULES, seoReport } from "@/lib/seoquality";
import { PLATFORMS } from "@/lib/format";

export const metadata = { title: "SEO", robots: { index: false } };
export const dynamic = "force-dynamic";

const RESULT: Record<number, string> = { 200: "Đã nhận", 202: "Đã nhận, chờ xác minh khoá", 400: "Sai định dạng", 403: "Khoá không hợp lệ", 422: "Đường dẫn không hợp lệ", 429: "Bị giới hạn tần suất", 0: "Lỗi mạng" };

export default async function SearchAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/tim-kiem");
  if (!isAdmin(user.email)) redirect("/admin");
  const st = indexNowStatus();
  const [log, files, seo] = await Promise.all([indexNowHistory(15), sitemapFiles(), seoReport()]);
  const num = (x: number) => x.toLocaleString("vi-VN");
  const catIdx = seo.categories.filter((c) => c.indexable).length;
  const thinCats = seo.categories.filter((c) => !c.indexable);
  const REASON_LINK: Record<string, string> = { hidden: "/admin/san-pham?loc=hidden", gone_long: "/admin/san-pham?loc=gone", bare: "/admin/san-pham?loc=no_image" };
  const site = siteUrl();
  const t = (d: Date) => d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <>
      <AdminTabs current="/admin/tim-kiem" />
      <h1 className="page-title">SEO</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Trang nào được Google index, trang nào đang bị coi là “mỏng” (ít nội dung riêng) nên tạm không index, và báo trang mới cho công cụ tìm kiếm.
      </p>

      <section className="section panel" aria-labelledby="iq-head">
        <h2 id="iq-head"><Icon name="check" /> Chất lượng chỉ mục</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          Nhiều trang mỏng bị index làm Google đánh giá thấp cả site. Trang mỏng vẫn mở được và vẫn có link, chỉ gắn <code>noindex</code> và không đưa vào
          sitemap/IndexNow – đủ dữ liệu là tự được index lại, không cần làm gì.
        </p>
        <div className="kpis kpis-4">
          <div className="kpi"><span>Trang sản phẩm index được</span><b>{num(seo.products.indexable)}</b><small className="muted">/ {num(seo.products.total)} món</small></div>
          <div className="kpi"><span>Trang sản phẩm noindex</span><b>{num(seo.products.total - seo.products.indexable)}</b><small className="muted">ẩn, vắng lâu hoặc mỏng</small></div>
          <div className="kpi"><span>Danh mục index được</span><b>{num(catIdx)}</b><small className="muted">/ {num(seo.categories.length)} danh mục</small></div>
          <div className="kpi"><span>Tệp sitemap</span><b>{files.length}</b><small className="muted">chỉ gồm trang index được</small></div>
        </div>

        <h3 style={{ marginTop: 18 }}>Trang sản phẩm chưa index – lý do</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Lý do</th><th scope="col" className="num">Số món</th><th scope="col">Cách xử lý</th></tr></thead>
            <tbody>
              {seo.products.reasons.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.n ? <Link href={REASON_LINK[r.key]}>{num(r.n)}</Link> : 0}</td>
                  <td className="muted" style={{ fontSize: 13.5 }}>
                    {r.key === "bare"
                      ? <>Có ảnh (bấm “Lấy ảnh ngay” ở <Link href="/admin/san-pham?loc=no_image">Sản phẩm</Link>), đủ {SEO_RULES.productMinPoints} mức giá hoặc theo dõi đủ {SEO_RULES.productMinDays} ngày là tự index lại.</>
                      : r.key === "gone_long"
                        ? "Món xuất hiện lại trên sàn là tự index lại. Trang vẫn giữ để link cũ không hỏng."
                        : "Do bạn ẩn – hiện lại ở trang Sản phẩm nếu ẩn nhầm."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 18 }}>Danh mục mỏng <small className="muted">(dưới {SEO_RULES.categoryMin} món còn bán)</small></h3>
        {thinCats.length ? (
          <>
            <p className="muted" style={{ fontSize: 13.5, margin: "0 0 8px" }}>Gộp vào danh mục lớn hơn (sửa hàng loạt ở trang Sản phẩm) hoặc thêm món để đủ {SEO_RULES.categoryMin} món.</p>
            <nav className="chips wrap">
              {thinCats.slice(0, 40).map((c) => (
                <Link key={c.name} className="chip" href={`/admin/san-pham?dm=${encodeURIComponent(c.name)}`} title={`${c.available} món còn bán / ${c.total} món`}>
                  {c.name} · {c.available}/{c.total}
                </Link>
              ))}
              {thinCats.length > 40 && <span className="muted">+{thinCats.length - 40} danh mục</span>}
            </nav>
          </>
        ) : (
          <p className="muted">Không có – mọi danh mục đều đủ món.</p>
        )}

        {seo.duplicates.length > 0 && (
          <>
            <h3 style={{ marginTop: 18 }}>Tên sản phẩm trùng nhau</h3>
            <p className="muted" style={{ fontSize: 13.5, margin: "0 0 8px" }}>
              Nhiều trang cùng một tên dễ bị Google coi là trùng lặp và chỉ chọn 1 trang. Thường là cùng món ở nhiều shop – ẩn bản kém (ít lịch sử giá, shop không uy tín) nếu không cần.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Tên</th><th scope="col">Sàn</th><th scope="col" className="num">Số trang</th></tr></thead>
                <tbody>
                  {seo.duplicates.map((d) => (
                    <tr key={`${d.platform}-${d.name}`}>
                      <td><Link href={`/admin/san-pham?q=${encodeURIComponent(d.name.slice(0, 120))}`}>{d.name}</Link></td>
                      <td className="nw">{PLATFORMS[d.platform]?.label ?? d.platform}</td>
                      <td className="num">{d.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <details style={{ marginTop: 16 }}>
          <summary>Quy tắc noindex đang áp dụng</summary>
          <ul className="vm-tips">
            <li>Sản phẩm: đã ẩn; vắng trên sàn quá {SEO_RULES.productGoneDays} ngày; chưa có ảnh, chưa đủ {SEO_RULES.productMinPoints} mức giá trong 90 ngày và mới theo dõi dưới {SEO_RULES.productMinDays} ngày.</li>
            <li>Danh mục: dưới {SEO_RULES.categoryMin} món còn bán.</li>
            <li>Trang “Giá … hôm nay”: dưới {SEO_RULES.topicMin} mẫu còn bán hoặc theo dõi chưa đủ {SEO_RULES.topicMinDays} ngày.</li>
            <li>Shop: theo dõi chưa đủ 7 ngày · So sánh 2 món: 1 món đã vắng hoặc chưa đủ 7 ngày dữ liệu · Báo cáo tuần/ngày: dưới 3 món.</li>
          </ul>
        </details>
      </section>

      <section className="section panel" aria-labelledby="in-head">
        <h2 id="in-head"><Icon name="send" /> Báo trang mới: IndexNow – Bing, Yandex, Naver, Seznam</h2>
        <div className={`vt-verdict ${st.on ? "ok" : "bad"}`} style={{ margin: "4px 0 12px" }}>
          <Icon name={st.on ? "check" : "alert"} size={18} />
          <span>{st.on ? <>Đang bật: 45 phút sau mỗi lần đồng bộ giá, máy chủ gửi các trang mới/đổi. Trang tổng hợp (trang chủ, mã giảm giá…) gửi tối đa 1 lần/ngày.</> : <><b>Đang tắt:</b> {st.reason}.</>}</span>
        </div>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 10px" }}>
          Tệp khoá xác nhận site: <a href={KEY_PATH} target="_blank" rel="noopener">{site}{KEY_PATH}</a> (tự tạo, không cần làm gì).
        </p>
        {st.on && <IndexNowButton />}
        {log.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th scope="col">Lúc</th><th scope="col" className="num">Số trang</th><th scope="col">Kết quả</th><th scope="col">Ví dụ</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{t(l.at)}{l.hubs ? <span className="muted"> · kèm trang tổng hợp</span> : null}</td>
                    <td className="num">{l.urls}</td>
                    <td>
                      <span className={`vs ${l.status === 200 || l.status === 202 ? "vs-good" : "vs-poor"}`} title={l.error ?? undefined}>
                        <Icon name={l.status === 200 || l.status === 202 ? "check" : "alert"} size={13} /> {RESULT[l.status] ?? `HTTP ${l.status}`}
                      </span>
                      {l.error ? <div className="muted" style={{ fontSize: 12 }}>{l.error}</div> : null}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{(l.sample ?? []).slice(0, 2).map((u) => u.replace(site, "")).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 12 }}>Chưa gửi lần nào.</p>
        )}
      </section>

      <section className="section panel" aria-labelledby="gg-head">
        <h2 id="gg-head"><Icon name="search" /> Google (làm 1 lần)</h2>
        <p style={{ marginTop: 0 }}>
          Google không nhận IndexNow. Google tìm trang mới qua <b>sitemap</b> – site đã có sẵn và ghi ngày cập nhật theo lần đổi giá, nên Google chỉ cần khai báo 1 lần:
        </p>
        <ol className="vm-tips">
          <li>Mở <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a>, thêm site (chọn “Miền”, xác minh bằng bản ghi DNS TXT ở nơi quản lý tên miền).</li>
          <li>Vào <b>Sơ đồ trang web</b> (Sitemaps), nhập <code>{site}/sitemap.xml</code> rồi bấm Gửi.</li>
          <li>Trang quan trọng mới đăng (bài hướng dẫn, trang mã tháng mới) có thể dán vào ô <b>Kiểm tra URL</b> rồi bấm “Yêu cầu lập chỉ mục” – Google giới hạn vài chục lần mỗi ngày.</li>
          <li>Mở <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a>, chọn “Nhập từ Google Search Console” – 1 lần bấm là xong, Bing dùng chung IndexNow ở trên.</li>
        </ol>
        <p className="muted" style={{ fontSize: 14, marginBottom: 6 }}>Sitemap hiện có {files.length} tệp:</p>
        <nav className="chips wrap">
          <a className="chip" href="/sitemap.xml" target="_blank" rel="noopener">sitemap.xml (mục lục)</a>
          {files.map((f) => <a key={f.name} className="chip" href={`/sitemap/${f.name}`} target="_blank" rel="noopener">{f.name}</a>)}
        </nav>
      </section>
    </>
  );
}
