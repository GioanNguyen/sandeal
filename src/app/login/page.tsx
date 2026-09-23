import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Đăng nhập", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; sent?: string; error?: string; next?: string }> }) {
  const { expired, sent, error, next } = await searchParams;
  const to = safeNext(next);
  if (await getCurrentUser()) redirect(to ?? "/account");
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="user" size={26} /></span>
      <h1>Đăng nhập Săn Deal</h1>
      <p className="muted">Không cần mật khẩu. Nhập email, chúng tôi gửi link đăng nhập cho bạn.</p>
      {expired && (
        <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> Link đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.</p>
      )}
      {to === "/admin" && !sent && <p className="muted" style={{ fontSize: 14 }}>Trang thống kê chỉ dành cho quản trị viên. Đăng nhập bằng email có trong <code>ADMIN_EMAILS</code>.</p>}
      <LoginForm sent={!!sent} error={error} next={to} />
    </div>
  );
}
