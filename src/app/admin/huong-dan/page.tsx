import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { GuideAiButtons } from "@/components/GuideAiButtons";
import { GuideShareButton } from "@/components/GuideShareButton";
import { Icon } from "@/components/Icon";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { guidePublishAt } from "@/lib/guides";
import { draftGuides, livePublishedGuides, liveUpcomingGuides } from "@/lib/guides-db";
import { guideAiEnabled } from "@/worker/guide-ai";
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
  const [done, next, drafts] = await Promise.all([livePublishedGuides(now), liveUpcomingGuides(now), draftGuides()]);
  const ai = guideAiEnabled();
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

      {daysLeft < 21 && !ai && (
        <div className="vt-verdict bad" role="status" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={18} />
          <span>
            <b>Lịch sắp hết bài.</b> Đăng đều mỗi tuần giúp Google ghé site thường xuyên hơn. Đặt <code>ANTHROPIC_API_KEY</code> trong .env để AI tự soạn bài
            nháp mỗi tuần cho bạn duyệt.
          </span>
        </div>
      )}

      <section className="section panel" aria-labelledby="ai-head">
        <h2 id="ai-head"><Icon name="sparkles" /> Bài nháp AI soạn, chờ duyệt</h2>
        {!ai ? (
          <p className="muted" style={{ margin: 0 }}>
            Chưa bật. Đặt <code>ANTHROPIC_API_KEY</code> trong .env: mỗi thứ Hai, khi 3 tuần tới còn dưới 2 bài, AI soạn 1 bài nháp từ số liệu thật của site và
            email cho bạn. Bài chỉ được đăng khi bạn bấm Duyệt.
          </p>
        ) : (
          <>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
              Mỗi thứ Hai 9h15, nếu 3 tuần tới còn dưới 2 bài, AI tự soạn 1 bài nháp và email cho bạn. Đọc kỹ trước khi duyệt: AI có thể viết chưa chính xác.
              Bài duyệt xong xếp vào thứ Ba trống kế tiếp.
            </p>
            {drafts.length === 0 && <p className="muted" style={{ margin: "0 0 10px" }}>Chưa có bài nháp nào.</p>}
            {drafts.map((d) => (
              <article key={d.id} className="draft-card">
                <a className="guide-thumb" href={`/huong-dan/${d.slug}/anh-bia`} target="_blank" rel="noopener" title="Xem ảnh bìa">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/huong-dan/${d.slug}/anh-bia`} alt="" width={96} height={120} loading="lazy" />
                </a>
                <div>
                  <h3>{d.title}</h3>
                  <p className="muted">{d.description}</p>
                  <p className="muted" style={{ fontSize: 12.5 }}>Soạn lúc {d.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}{d.model ? ` · ${d.model}` : ""}</p>
                  <div className="guide-ai-btns">
                    <Link className="btn btn-ghost btn-sm" href={`/huong-dan/${d.slug}?xem-truoc=1`} target="_blank"><Icon name="eye" size={14} /> Đọc bài</Link>
                    <GuideAiButtons id={d.id} mode="draft" />
                  </div>
                </div>
              </article>
            ))}
            <div style={{ marginTop: 10 }}><GuideAiButtons mode="new" /></div>
          </>
        )}
      </section>

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
                    <td>{g.title} {g.aiId ? <span className="ai-badge"><Icon name="sparkles" size={11} /> AI soạn</span> : null}</td>
                    <td>
                      <div className="guide-ai-btns">
                        <Link className="btn btn-ghost btn-sm" href={`/huong-dan/${g.slug}?xem-truoc=1`}><Icon name="eye" size={14} /> Xem trước</Link>
                        {g.aiId ? <GuideAiButtons id={g.aiId} mode="scheduled" /> : null}
                      </div>
                    </td>
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
                    <td><Link href={`/huong-dan/${g.slug}`}>{g.title}</Link> {g.aiId ? <span className="ai-badge"><Icon name="sparkles" size={11} /> AI soạn</span> : null}</td>
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
