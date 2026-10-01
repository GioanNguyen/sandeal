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
  const dir = path.join(process.cwd(), "public", "downloads");
  const hasZip = fs.existsSync(path.join(dir, "san-deal-extension.zip"));
  // Phiên bản ghi lúc đóng gói (scripts/build-extension.mjs)
  let info: { version: string; file: string; builtAt: string } | null = null;
  try {
    info = JSON.parse(fs.readFileSync(path.join(dir, "san-deal-extension.json"), "utf8"));
  } catch {}
  const built = info ? new Date(info.builtAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }) : null;
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
            <>
              <a className="btn btn-light" href={`/downloads/san-deal-extension.zip${info ? `?v=${info.version}` : ""}`} download={info?.file ?? "san-deal-extension.zip"}>
                <Icon name="download" size={16} /> Tải tiện ích{info ? ` v${info.version}` : ""} (Chrome, Edge, Cốc Cốc)
              </a>
              {info && <span className="ext-version">Phiên bản mới nhất: <b>{info.version}</b> · đóng gói {built}</span>}
            </>
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
        <section className="panel" id="gop-gia">
          <h2><Icon name="users" /> Góp giá ẩn danh (tuỳ chọn)</h2>
          <p style={{ margin: 0 }}>
            Lần đầu dùng, tiện ích hỏi bạn có muốn <b>góp giá</b> không. Nếu đồng ý, khi bạn mở trang sản phẩm, tiện ích gửi <b>tên, giá, ảnh và điểm đánh giá</b>{" "}
            mà trang công khai cho Săn Deal, để sản phẩm chưa có trên Săn Deal được bắt đầu theo dõi và lịch sử giá đầy đủ hơn cho mọi người.
            Từ bản 1.5.0, tiện ích gửi thêm <b>các đánh giá của người mua đang hiện trên trang</b> (số sao, nội dung, phân loại, ngày) để Săn Deal tóm tắt đánh giá và cảnh báo rủi ro.
          </p>
          <ul className="tips" style={{ listStyle: "disc" }}>
            <li>Không gửi tài khoản, lịch sử duyệt web, giỏ hàng hay bất kỳ thông tin nào về bạn. Không gửi tên, ảnh của người viết đánh giá; số điện thoại, email, đường link trong nội dung đánh giá bị xoá trước khi lưu.</li>
            <li>Máy chủ chỉ lưu mã băm của địa chỉ IP để đếm số người khác nhau thấy cùng mức giá (giá lệch nhiều cần 2 người xác nhận).</li>
            <li>Trang sản phẩm ghi rõ khi giá đến từ người dùng tiện ích. Tắt bất cứ lúc nào trong phần Tuỳ chọn của tiện ích.</li>
          </ul>
        </section>
        <section className="panel">
          <h2><Icon name="download" /> Cách cài (khoảng 1 phút)</h2>
          <ol className="tips">
            <li>Tải file <b>{info?.file ?? "san-deal-extension.zip"}</b> ở trên và <b>giải nén</b> (được thư mục có số phiên bản trong tên).</li>
            <li>Mở <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>), bật <b>Chế độ nhà phát triển</b> ở góc phải.</li>
            <li>Bấm <b>Tải tiện ích đã giải nén</b> và chọn thư mục vừa giải nén.</li>
            <li>Mở một sản phẩm trên Shopee, bảng Săn Deal hiện ở góc phải dưới màn hình.</li>
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>
            <b>Cập nhật bản mới:</b> xem phiên bản đang dùng ở <code>chrome://extensions</code> (hoặc bấm biểu tượng Săn Deal – tiện ích tự báo khi có bản mới).
            Nếu cũ hơn {info ? <b>{info.version}</b> : "bản trên trang này"}, tải lại file, gỡ bản cũ rồi nạp thư mục mới.
          </p>
          <p className="muted" style={{ fontSize: 13 }}>Sắp có trên Chrome Web Store để cài bằng một cú bấm.</p>
        </section>
      </div>
    </>
  );
}
