import { Icon } from "@/components/Icon";

export const metadata = { title: "Huỷ theo dõi", robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ w?: string; s?: string; done?: string }> }) {
  const { w, s, done } = await searchParams;
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="bell" size={26} /></span>
      {done ? (
        <>
          <h1>Đã huỷ theo dõi</h1>
          <p className="muted">Bạn sẽ không nhận email về sản phẩm này nữa.</p>
          <a className="btn btn-ghost btn-block" href="/">Về trang chủ</a>
        </>
      ) : (
        <>
          <h1>Huỷ theo dõi giá?</h1>
          <p className="muted">Bạn sẽ ngừng nhận email báo giảm giá cho sản phẩm này.</p>
          <form method="post" action="/api/unsubscribe">
            <input type="hidden" name="w" value={w ?? ""} />
            <input type="hidden" name="s" value={s ?? ""} />
            <button className="btn btn-primary btn-block" type="submit">Huỷ theo dõi</button>
          </form>
        </>
      )}
    </div>
  );
}
