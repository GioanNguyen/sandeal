import { Icon } from "@/components/Icon";

export const metadata = { title: "Huỷ theo dõi", robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ w?: string; s?: string; t?: string; u?: string; done?: string }> }) {
  const { w, s, t, u, done } = await searchParams;
  const what = t === "digest" ? "bản tin deal qua email" : t === "sale" ? "email nhắc ngày sale" : t === "weekly" ? "mail tóm tắt cuối tuần" : "theo dõi giá sản phẩm này";
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="bell" size={26} /></span>
      {done ? (
        <>
          <h1>Đã huỷ</h1>
          <p className="muted">Bạn sẽ không nhận {done === "digest" ? "bản tin deal" : done === "sale" ? "email nhắc sale" : done === "weekly" ? "mail tóm tắt cuối tuần" : "email về sản phẩm này"} nữa. Có thể bật lại trong trang Sở thích.</p>
          <a className="btn btn-ghost btn-block" href="/">Về trang chủ</a>
        </>
      ) : (
        <>
          <h1>Huỷ nhận thông báo?</h1>
          <p className="muted">Bạn sẽ ngừng nhận {what}.</p>
          <form method="post" action="/api/unsubscribe">
            <input type="hidden" name="w" value={w ?? ""} />
            <input type="hidden" name="t" value={t ?? ""} />
            <input type="hidden" name="u" value={u ?? ""} />
            <input type="hidden" name="s" value={s ?? ""} />
            <button className="btn btn-primary btn-block" type="submit">Xác nhận huỷ</button>
          </form>
        </>
      )}
    </div>
  );
}
