import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tiện ích Chrome Săn Deal – xem lịch sử giá ngay trên Shopee, Lazada, TikTok Shop",
  description: "Cài tiện ích để biết giảm giá thật hay ảo, sàn nào rẻ hơn và giá sau mã ngay khi đang xem sản phẩm.",
  alternates: { canonical: "/tien-ich" },
};

export default function ExtensionPage() {
  const hasZip = fs.existsSync(path.join(process.cwd(), "public", "downloads", "san-deal-extension.zip"));
  return (
    <>
      <section className="sale-hero ext-hero">
        <div>
          <span className="hero-eyebrow"><Icon name="puzzle" size={14} /> Tiện ích trình duyệt</span>
          <h1>Biết giá thật ngay trên Shopee</h1>
          <p>Đang xem sản phẩm trên Shopee, Lazada hay TikTok Shop, Săn Deal hiện ngay lịch sử giá, giá sau mã và sàn nào đang rẻ hơn. Không cần copy link.</p>
        </div>
        <div className="hero-actions">
          {hasZip ? (
            <a className="btn btn-light" href="/downloads/san-deal-extension.zip" download><Icon name="download" size={16} /> Tải tiện ích (Chrome, Edge, Cốc Cốc)</a>
          ) : (
            <span className="btn btn-light" aria-disabled="true">Chạy <code>npm run ext:build</code> để tạo file cài đặt</span>
          )}
        </div>
      </section>

      <div className="sale-grid">
        <section className="panel">
          <h2><Icon name="sparkles" /> Tiện ích làm được gì</h2>
          <ul className="tips" style={{ listStyle: "disc" }}>
            <li><b>Kết luận ngay:</b> giá tốt để mua, hay chưa phải giá tốt nhất.</li>
            <li><b>Biểu đồ giá</b> 90 ngày, giá thấp nhất và giá thường ngày.</li>
            <li><b>Sàn khác rẻ hơn?</b> Hiện giá cùng sản phẩm ở Shopee, Lazada, TikTok Shop.</li>
            <li><b>Giá sau mã</b> tốt nhất và nút đặt báo khi giá giảm.</li>
            <li>Chỉ đọc địa chỉ trang sản phẩm bạn đang xem, không đọc tài khoản, giỏ hàng hay mật khẩu.</li>
          </ul>
        </section>
        <section className="panel">
          <h2><Icon name="download" /> Cách cài (khoảng 1 phút)</h2>
          <ol className="tips">
            <li>Tải file <b>san-deal-extension.zip</b> ở trên và <b>giải nén</b>.</li>
            <li>Mở <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>), bật <b>Chế độ nhà phát triển</b> ở góc phải.</li>
            <li>Bấm <b>Tải tiện ích đã giải nén</b> và chọn thư mục vừa giải nén.</li>
            <li>Mở một sản phẩm trên Shopee, bảng Săn Deal hiện ở góc phải dưới màn hình.</li>
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>Sắp có trên Chrome Web Store để cài bằng một cú bấm.</p>
        </section>
      </div>
    </>
  );
}
