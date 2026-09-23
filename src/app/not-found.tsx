import Link from "next/link";
import { Icon } from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="auth-card">
      <span className="auth-icon"><Icon name="search" size={26} /></span>
      <h1>Không tìm thấy trang</h1>
      <p className="muted">Trang bạn tìm không tồn tại hoặc sản phẩm đã bị gỡ.</p>
      <Link className="btn btn-primary btn-block" href="/">Xem deal hot</Link>
    </div>
  );
}
