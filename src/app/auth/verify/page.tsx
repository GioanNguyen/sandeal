import { Icon } from "@/components/Icon";

export const metadata = { title: "Xác nhận email", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; next?: string }> }) {
  const { token, next } = await searchParams;
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="mail" size={26} /></span>
      <h1>Xác nhận email</h1>
      {token ? (
        <>
          <p className="muted">Bấm nút dưới đây để hoàn tất đăng nhập.</p>
          <form method="post" action="/api/auth/verify">
            <input type="hidden" name="token" value={token} />
            {next && <input type="hidden" name="next" value={next} />}
            <button className="btn btn-primary btn-block" type="submit">Xác nhận & tiếp tục</button>
          </form>
        </>
      ) : (
        <p className="muted">Link không hợp lệ. Hãy yêu cầu link đăng nhập mới.</p>
      )}
    </div>
  );
}
