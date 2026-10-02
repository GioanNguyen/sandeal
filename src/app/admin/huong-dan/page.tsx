import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { GuideShareButton } from "@/components/GuideShareButton";
import { Icon } from "@/components/Icon";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { guidePublishAt, publishedGuides, upcomingGuides } from "@/lib/guides";
import { guideShareStatus, guidesFbEnabled } from "@/worker/guides";

export const metadata = { title: "Lịch bài hướng dẫn", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const vnDate = (d: Date) => d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

export default async function GuidesAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/huong-dan");
  if (!isAdmin(user.email)) redirect("/admin");
  const now = new Date();
  const done = publishedGuides(now);
  const next = upcomingGuides(now);
  const shares = await guideShareStatus();
  const fb = guidesFbEnabled();
  const last = next.at(-1);
  const daysLeft = last ? Math.ceil((guidePublishAt(last).getTime() - now.getTime()) / DAY) : 0;
  const thisWeek = done.filter((g) => now.getTime() - guidePublishAt(g).getTime() < 7 * DAY).length;

  return (
    <>
      <AdminTabs current="/admin/huong-dan" />
      <h1 className="page-title">Lịch bài hướng dẫn</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Mỗi bài tự hiện trên <Link href="/huong-dan">/huong-dan</Link>, sitemap và <a href="/huong-dan/rss.xml">RSS</a> lúc 8h sáng ngày đăng
        {fb ? ", rồi tự đăng lên Trang Facebook từ 8h12: bài ảnh dùng ảnh bìa dọc, link đọc bài ở bình luận đầu." : ". Chưa cấu hình Trang Facebook nên bài không tự đăng lên Facebook."}
      </p>

      <div className="vt-tiles" style={{ margin: "14px 0" }}>
        <div className="vt-tile"><p className="vt-name">Đã đăng</p><p className="vt-val">{done.length}</p><p className="muted vt-small">{thisWeek} bài trong 7 ngày qua</p></div>
        <div className="vt-tile"><p className="vt-name">Chờ đăng</p><p className="vt-val">{next.length}</p><p className="muted vt-small">{next[0] ? `Bài kế tiếp: ${vnDate(guidePublishAt(next[0]))}` : "Không còn bài nào"}</p></div>
        <div className="vt-tile"><p className="vt-name">Lịch còn đủ tới</p><p className="vt-val">{last ? `${daysLeft} ngày` : "–"}</p><p className="muted vt-small">{last ? vnDate(guidePublishAt(last)) : "Cần thêm bài"}</p></div>
      </div>

      {daysLeft < 21 && (
        <div className="vt-verdict bad" role="status" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={18} />
          <span>
            <b>Lịch sắp hết bài.</b> Đăng đều mỗi tuần giúp Google ghé site thường xuyên hơn. Thêm bài mới vào cuối <code>src/lib/guides-lich.tsx</code> (mỗi bài 1
            ngày đăng, nên cách nhau 7 ngày).
          </span>
        </div>
      )}

      <section className="section panel">
        <h2><Icon name="calendar" /> Sắp đăng</h2>
        {next.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Ảnh bìa</th><th scope="col">Ngày đăng</th><th scope="col">Bài</th><th scope="col"></th></tr></thead>
              <tbody>
                {next.map((g) => (
                  <tr key={g.slug}>
                    <td><a className="guide-thumb" href={`/huong-dan/${g.slug}/anh-bia`} target="_blank" rel="noopener" title="Xem ảnh bìa đăng Facebook">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/huong-dan/${g.slug}/anh-bia`} alt="" width={48} height={60} loading="lazy" />
                    </a></td>
                    <td style={{ whiteSpace: "nowrap" }}>{vnDate(guidePublishAt(g))}</td>
                    <td>{g.title}</td>
                    <td><Link className="btn btn-ghost btn-sm" href={`/huong-dan/${g.slug}?xem-truoc=1`}><Icon name="eye" size={14} /> Xem trước</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Không còn bài nào trong lịch.</p>
        )}
      </section>

      <section className="section panel">
        <h2><Icon name="book" /> Đã đăng</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Ảnh bìa</th><th scope="col">Ngày đăng</th><th scope="col">Bài</th><th scope="col">Facebook</th></tr></thead>
            <tbody>
              {done.map((g) => {
                const s = shares.get(g.slug);
                return (
                  <tr key={g.slug}>
                    <td><a className="guide-thumb" href={`/huong-dan/${g.slug}/anh-bia`} target="_blank" rel="noopener" title="Xem ảnh bìa đăng Facebook">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/huong-dan/${g.slug}/anh-bia`} alt="" width={48} height={60} loading="lazy" />
                      </a></td>
                    <td style={{ whiteSpace: "nowrap" }}>{vnDate(guidePublishAt(g))}</td>
                    <td><Link href={`/huong-dan/${g.slug}`}>{g.title}</Link></td>
                    <td>
                      {s && s.externalId ? (
                        <span className="guide-share">
                          <a className="vs vs-good" href={s.externalId ? `https://www.facebook.com/${s.externalId}` : undefined} target="_blank" rel="noopener">
                            <Icon name="check" size={13} /> Đã đăng {s.at.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}
                          </a>
                          {s.error && <span className="vs vs-needs-improvement" title={s.error}><Icon name="alert" size={13} /> Thiếu bình luận link</span>}
                          {fb && <GuideShareButton slug={g.slug} again />}
                        </span>
                      ) : (
                        <span className="guide-share">
                          {s?.error && <span className="vs vs-poor" title={s.error}><Icon name="alert" size={13} /> Lỗi</span>}
                          {fb ? <GuideShareButton slug={g.slug} /> : <span className="muted">Chưa cấu hình</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
