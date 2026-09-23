import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Đăng nhập", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; sent?: string; error?: string }> }) {
  if (await getCurrentUser()) redirect("/account");
  const { expired, sent, error } = await searchParams;
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="user" size={26} /></span>
      <h1>Đăng nhập Săn Deal</h1>
      <p className="muted">Không cần mật khẩu. Nhập email, chúng tôi gửi link đăng nhập cho bạn.</p>
      {expired && (
        <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> Link đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.</p>
      )}
      <LoginForm sent={!!sent} error={error} />
    </div>
  );
}
