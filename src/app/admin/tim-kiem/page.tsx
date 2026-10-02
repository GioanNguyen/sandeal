import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { Icon } from "@/components/Icon";
import { IndexNowButton } from "@/components/IndexNowButton";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { KEY_PATH, indexNowHistory, indexNowStatus } from "@/lib/indexnow";
import { siteUrl } from "@/lib/mail";
import { sitemapFiles } from "@/lib/sitemaps";

export const metadata = { title: "Công cụ tìm kiếm", robots: { index: false } };
export const dynamic = "force-dynamic";

const RESULT: Record<number, string> = { 200: "Đã nhận", 202: "Đã nhận, chờ xác minh khoá", 400: "Sai định dạng", 403: "Khoá không hợp lệ", 422: "Đường dẫn không hợp lệ", 429: "Bị giới hạn tần suất", 0: "Lỗi mạng" };

export default async function SearchAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/tim-kiem");
  if (!isAdmin(user.email)) redirect("/admin");
  const st = indexNowStatus();
  const [log, files] = await Promise.all([indexNowHistory(15), sitemapFiles()]);
  const site = siteUrl();
  const t = (d: Date) => d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <>
      <AdminTabs current="/admin/tim-kiem" />
      <h1 className="page-title">Báo công cụ tìm kiếm</h1>
      <p className="muted" style={{ marginTop: 0 }}>Giúp trang mới (món mới, giá đổi, bài hướng dẫn, mã tháng mới) được tìm thấy sớm hơn thay vì chờ công cụ tìm kiếm tự ghé.</p>

      <section className="section panel" aria-labelledby="in-head">
        <h2 id="in-head"><Icon name="send" /> IndexNow – Bing, Yandex, Naver, Seznam</h2>
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
