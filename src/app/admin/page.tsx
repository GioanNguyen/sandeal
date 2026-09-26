import { and, count, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clicks, conversions, products, users, watches } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { PLATFORMS, shortDate, vnd } from "@/lib/format";
import { productPath } from "@/lib/slug";
import { BarChart } from "@/components/BarChart";
import { PlatformBadge } from "@/components/PlatformBadge";
import { SyncButton } from "@/components/SyncButton";

export const metadata = { title: "Thống kê", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 30;
const TZ = "Asia/Ho_Chi_Minh";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user.email)) {
    return (
      <div className="auth-card">
        <h1>Không có quyền truy cập</h1>
        <p className="muted">
          Tài khoản <b>{user.email}</b> không phải quản trị viên. Thêm email này vào <code>ADMIN_EMAILS</code> trong file <code>.env</code> rồi khởi động lại server.
        </p>
        <Link className="btn btn-ghost btn-block" href="/">Về trang chủ</Link>
      </div>
    );
  }
  await ensureMigrated();
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const okConv = and(gte(conversions.purchasedAt, since), ne(conversions.status, "cancelled"));
  // Múi giờ viết thẳng vào SQL (không dùng tham số) để SELECT và GROUP BY là cùng một biểu thức
  const tz = sql.raw(`'${TZ}'`);
  const clickDay = sql<string>`to_char(${clicks.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const convDay = sql<string>`to_char(${conversions.purchasedAt} at time zone ${tz}, 'YYYY-MM-DD')`;

  const [[clk], [conv], [usr], clicksByDay, commByDay, byPlatformClicks, byPlatformConv, topProducts, recent] = await Promise.all([
    db.select({ n: count() }).from(clicks).where(gte(clicks.createdAt, since)),
    db
      .select({ n: count(), amount: sql<number>`coalesce(sum(${conversions.orderAmount}),0)`, comm: sql<number>`coalesce(sum(${conversions.commission}),0)` })
      .from(conversions)
      .where(okConv),
    db.select({ users: count(), watches: sql<number>`(select count(*) from ${watches})` }).from(users),
    db.select({ day: clickDay, n: count() }).from(clicks).where(gte(clicks.createdAt, since)).groupBy(clickDay),
    db.select({ day: convDay, v: sql<number>`sum(${conversions.commission})` }).from(conversions).where(okConv).groupBy(convDay),
    db.select({ platform: clicks.platform, n: count() }).from(clicks).where(gte(clicks.createdAt, since)).groupBy(clicks.platform),
    db
      .select({ platform: conversions.platform, n: count(), comm: sql<number>`sum(${conversions.commission})` })
      .from(conversions)
      .where(okConv)
      .groupBy(conversions.platform),
    db
      .select({ id: products.id, name: products.name, platform: products.platform, n: count() })
      .from(clicks)
      .innerJoin(products, eq(products.id, clicks.productId))
      .where(and(gte(clicks.createdAt, since), isNotNull(clicks.productId)))
      .groupBy(products.id, products.name, products.platform)
      .orderBy(desc(count()))
      .limit(10),
    db.select().from(conversions).orderBy(desc(conversions.purchasedAt)).limit(10),
  ]);

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() - (DAYS - 1 - i) * 86_400_000);
    const key = d.toLocaleDateString("en-CA", { timeZone: TZ });
    return { key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}` };
  });
  const clickMap = new Map(clicksByDay.map((r) => [r.day, Number(r.n)]));
  const commMap = new Map(commByDay.map((r) => [r.day, Number(r.v)]));
  const cr = clk.n ? (Number(conv.n) / clk.n) * 100 : 0;
  const statusLabel: Record<string, string> = { pending: "Chờ duyệt", completed: "Hoàn tất", cancelled: "Đã huỷ" };

  return (
    <>
      <nav className="tabs" aria-label="Quản trị">
        <Link href="/admin" aria-current="page">Thống kê</Link>
        <Link href="/admin/dang-bai">Đăng bài</Link>
      </nav>
      <div className="account-head">
        <div>
          <h1 className="page-title">Thống kê {DAYS} ngày</h1>
          <p className="page-sub">Lượt bấm ghi qua link /go, đơn hàng và hoa hồng lấy từ báo cáo của mạng affiliate.</p>
        </div>
        <SyncButton />
      </div>

      <div className="kpis kpis-4">
        <div className="kpi"><span>Lượt bấm mua</span><b>{clk.n.toLocaleString("vi-VN")}</b></div>
        <div className="kpi"><span>Đơn hàng</span><b>{Number(conv.n).toLocaleString("vi-VN")}</b><small className="muted">Tỉ lệ chuyển đổi {clk.n >= Number(conv.n) && clk.n > 0 ? `${cr.toFixed(1)}%` : "chưa đủ dữ liệu"}</small></div>
        <div className="kpi"><span>Doanh số</span><b>{vnd(Number(conv.amount))}</b></div>
        <div className="kpi"><span>Hoa hồng</span><b className="save">{vnd(Number(conv.comm))}</b><small className="muted">gồm cả đơn chờ duyệt</small></div>
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h2>Lượt bấm mỗi ngày</h2>
          <BarChart label="Lượt bấm mua mỗi ngày" data={days.map((d) => ({ ...d, value: clickMap.get(d.key) ?? 0 }))} format={(v) => `${v} lượt`} />
        </section>
        <section className="panel">
          <h2>Hoa hồng mỗi ngày</h2>
          <BarChart label="Hoa hồng mỗi ngày" data={days.map((d) => ({ ...d, value: commMap.get(d.key) ?? 0 }))} format={vnd} />
        </section>
      </div>

      <div className="admin-grid">
        <section className="panel">
          <h2>Theo sàn</h2>
          <table className="table">
            <thead><tr><th>Sàn</th><th className="num">Lượt bấm</th><th className="num">Đơn</th><th className="num">Hoa hồng</th></tr></thead>
            <tbody>
              {Object.keys(PLATFORMS).map((k) => {
                const c = byPlatformClicks.find((r) => r.platform === k);
                const o = byPlatformConv.find((r) => r.platform === k);
                return (
                  <tr key={k}>
                    <td><PlatformBadge platform={k} inline /></td>
                    <td className="num">{c?.n ?? 0}</td>
                    <td className="num">{o?.n ?? 0}</td>
                    <td className="num">{vnd(Number(o?.comm ?? 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>{usr.users} người dùng · {Number(usr.watches)} lượt theo dõi giá</p>
        </section>
        <section className="panel">
          <h2>Sản phẩm được bấm nhiều nhất</h2>
          {topProducts.length ? (
            <table className="table">
              <thead><tr><th>Sản phẩm</th><th className="num">Lượt bấm</th></tr></thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.id}>
                    <td><a href={productPath(p)}>{p.name}</a> <span className="muted">· {PLATFORMS[p.platform]?.label}</span></td>
                    <td className="num">{p.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Chưa có lượt bấm nào.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Đơn hàng gần đây</h2>
        {recent.length ? (
          <table className="table">
            <thead><tr><th>Ngày</th><th>Sàn</th><th>Trạng thái</th><th className="num">Giá trị đơn</th><th className="num">Hoa hồng</th></tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td>{shortDate(c.purchasedAt)}</td>
                  <td>{PLATFORMS[c.platform]?.label ?? c.platform}</td>
                  <td><span className={`status status-${c.status}`}>{statusLabel[c.status] ?? c.status}</span></td>
                  <td className="num">{vnd(c.orderAmount)}</td>
                  <td className="num">{vnd(c.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Chưa có đơn hàng. Đơn sẽ xuất hiện khi mạng affiliate trả báo cáo.</p>
        )}
      </section>
    </>
  );
}
