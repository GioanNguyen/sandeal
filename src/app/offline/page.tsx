import { Icon } from "@/components/Icon";

export const metadata = { title: "Mất kết nối", robots: { index: false } };

export default function Offline() {
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="alert" size={26} /></span>
      <h1>Bạn đang offline</h1>
      <p className="muted">Kiểm tra kết nối mạng rồi thử lại. Deal và giá cần có mạng để cập nhật.</p>
      <a className="btn btn-primary btn-block" href="/">Thử lại</a>
    </div>
  );
}
