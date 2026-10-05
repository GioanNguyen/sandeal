import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { Icon } from "@/components/Icon";
import { OpsTestButton } from "@/components/OpsTestButton";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { vnd } from "@/lib/format";
import { adminTelegramChats, alertsEnabled, jobStates, openAlerts } from "@/lib/ops";
import { dayStats, todoList, type TodoLevel } from "@/lib/todo";
import { briefHour } from "@/worker/watchdog";

export const metadata = { title: "Hôm nay", robots: { index: false } };
export const dynamic = "force-dynamic";

const LEVEL: Record<TodoLevel, { label: string; cls: string }> = {
  high: { label: "Làm ngay", cls: "todo-high" },
  normal: { label: "Trong ngày", cls: "todo-normal" },
  low: { label: "Khi rảnh", cls: "todo-low" },
};
const num = (x: number) => x.toLocaleString("vi-VN");
const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return "chưa lần nào";
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 48 * 60 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};

export default async function TodayAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/hom-nay");
  if (!isAdmin(user.email)) redirect("/admin");
  const now = new Date();
  const [todo, jobs, alerts, today, yesterday, chats] = await Promise.all([todoList(now), jobStates(now), openAlerts(), dayStats(now, 0), dayStats(now, -1), adminTelegramChats()]);
  const t = now.getTime();
  const failing = jobs.filter((j) => j.stale || (j.state?.fails ?? 0) > 0);
  const hour = briefHour();

  return (
    <>
      <AdminTabs current="/admin/hom-nay" />
      <h1 className="page-title">Hôm nay</h1>
      <p className="page-sub">Việc cần làm gom từ mọi tab, xếp theo mức gấp, và tình trạng các việc site tự chạy.</p>

      {alerts.length > 0 && (
        <section className="panel todo-alerts" aria-labelledby="al-head" role="alert">
          <h2 id="al-head"><Icon name="alert" /> Sự cố đang mở</h2>
          <ul>
            {alerts.map((a) => (
              <li key={a.key}>
                <b>{a.title}</b> <span className="muted">· từ {ago(a.firstAt, t)}</span>
                <div>{a.detail}</div>
                {a.href && <Link href={a.href}>Xem chi tiết</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="kpis kpis-4">
        <div className="kpi"><span>Lượt xem món</span><b>{num(today.views)}</b><small className="muted">hôm qua {num(yesterday.views)}</small></div>
        <div className="kpi"><span>Lượt bấm “Mua”</span><b>{num(today.clicks)}</b><small className="muted">hôm qua {num(yesterday.clicks)}</small></div>
        <div className="kpi"><span>Lượt tìm</span><b>{num(today.searches)}</b><small className="muted">{today.zeroSearches ? `${today.zeroSearches} không ra kết quả · ` : ""}hôm qua {num(yesterday.searches)}</small></div>
        <div className="kpi"><span>Hoa hồng ghi nhận</span><b className="save">{vnd(today.commission)}</b><small className="muted">{today.orders} đơn · hôm qua {vnd(yesterday.commission)}</small></div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>Hoa hồng theo ngày đặt hàng, chỉ có khi đã đồng bộ/nhập báo cáo của sàn (thường chậm vài giờ đến vài ngày).</p>

      <section className="section panel" aria-labelledby="todo-head">
        <h2 id="todo-head"><Icon name="list" /> Việc cần làm ({todo.length})</h2>
        {todo.length ? (
          <ol className="todo-list">
            {todo.map((x) => (
              <li key={x.key} className={LEVEL[x.level].cls}>
                <span className="todo-level">{LEVEL[x.level].label}</span>
                <div className="todo-body">
                  <b>{x.title}</b>
                  <div className="muted">{x.why}</div>
                </div>
                <Link className="btn btn-ghost btn-sm" href={x.href}>{x.action} <Icon name="arrowRight" size={14} /></Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="vt-verdict ok" style={{ margin: 0 }}><Icon name="check" size={18} /> Không có việc gì cần làm – mọi thứ đang ổn.</p>
        )}
      </section>

      <section className="section panel" aria-labelledby="job-head">
        <h2 id="job-head"><Icon name="refresh" /> Việc site tự chạy</h2>
        {failing.length === 0 && <p className="vs vs-good" style={{ marginTop: 0 }}><Icon name="check" size={14} /> Tất cả đang chạy bình thường</p>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Việc</th><th scope="col">Lần chạy được gần nhất</th><th scope="col">Tình trạng</th></tr></thead>
            <tbody>
              {jobs.map((j) => {
                const bad = j.stale || (j.state?.fails ?? 0) > 0;
                return (
                  <tr key={j.name}>
                    <td>{j.href ? <Link href={j.href}>{j.label}</Link> : j.label}{j.state?.summary ? <div className="muted" style={{ fontSize: 12.5 }}>{j.state.summary}</div> : null}</td>
                    <td className="nw">{ago(j.state?.lastOk, t)}</td>
                    <td>
                      {!j.state ? (
                        <span className="muted">Chưa chạy lần nào kể từ khi bật theo dõi</span>
                      ) : bad ? (
                        <span className="vs vs-poor rev-msg"><Icon name="alert" size={13} /> {j.stale ? "Đứng quá lâu" : `Lỗi ${j.state.fails} lần liên tiếp`}{j.state.lastError ? `: ${j.state.lastError.slice(0, 160)}` : ""}</span>
                      ) : (
                        <span className="vs vs-good"><Icon name="check" size={13} /> Bình thường</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section panel" aria-labelledby="ntf-head">
        <h2 id="ntf-head"><Icon name="bell" /> Báo cho bạn</h2>
        <ul className="vm-tips" style={{ marginTop: 0 }}>
          <li>
            Nơi nhận:{" "}
            {!alertsEnabled() ? (
              <b>đang tắt (ADMIN_ALERTS=0)</b>
            ) : chats.length ? (
              <b>Telegram ({chats.length} chat)</b>
            ) : (
              <>
                <b>email ADMIN_EMAILS</b> – muốn nhận trên Telegram (nhanh hơn): liên kết Telegram ở <Link href="/account/so-thich">Tài khoản › Sở thích &amp; thông báo</Link> bằng tài khoản quản trị này, hoặc đặt <code>ADMIN_TELEGRAM_CHAT_ID</code>.
              </>
            )}
          </li>
          <li>Báo ngay khi: đồng bộ giá lỗi 2 lần liền hoặc đứng quá 6 giờ, đăng bài mạng xã hội lỗi (vd token Facebook hết hạn), tỉ lệ huỷ đơn tăng vọt, các việc tự chạy khác lỗi nhiều lần. Mỗi sự cố báo tối đa 1 lần / 12 giờ, hết sự cố thì báo “đã ổn lại”.</li>
          <li>Tin tóm tắt mỗi sáng: {hour == null ? <b>đang tắt</b> : <b>{hour} giờ</b>} – số liệu hôm qua và việc cần làm (đổi bằng <code>ADMIN_BRIEF_HOUR</code>, “off” để tắt).</li>
          <li>Web dừng hẳn thì không tự báo được: dùng thêm dịch vụ theo dõi miễn phí (UptimeRobot, BetterStack…) gọi <code>/api/health</code> 5 phút/lần.</li>
        </ul>
        <div style={{ marginTop: 12 }}><OpsTestButton /></div>
      </section>
    </>
  );
}
