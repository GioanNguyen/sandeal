import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LEGAL_UPDATED, contactEmail } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Hướng dẫn xoá dữ liệu",
  description: "Cách yêu cầu Săn Deal xoá tài khoản và toàn bộ dữ liệu cá nhân của bạn, những gì sẽ bị xoá và thời gian xử lý.",
  alternates: { canonical: "/xoa-du-lieu" },
};

export default function DataDeletionPage() {
  const email = contactEmail();
  const contact = email ? <a href={`mailto:${email}?subject=${encodeURIComponent("Xoá dữ liệu Săn Deal")}`}>{email}</a> : <>trang Facebook Săn Deal</>;
  return (
    <>
      <Breadcrumbs items={[{ name: "Chính sách bảo mật", href: "/chinh-sach-bao-mat" }, { name: "Hướng dẫn xoá dữ liệu" }]} />
      <article className="guide legal">
        <h1 className="page-title">Hướng dẫn xoá dữ liệu</h1>
        <p className="muted">Cập nhật ngày {LEGAL_UPDATED}</p>
        <p>
          Bạn có thể yêu cầu Săn Deal xoá tài khoản và toàn bộ dữ liệu gắn với tài khoản bất cứ lúc nào, không cần nêu lý do. Dữ liệu Săn Deal thu thập được mô tả
          trong <Link href="/chinh-sach-bao-mat">Chính sách bảo mật</Link>.
        </p>

        <h2>Cách gửi yêu cầu</h2>
        <ol>
          <li>Gửi email tới {contact} với tiêu đề <b>“Xoá dữ liệu Săn Deal”</b>.</li>
          <li>Gửi từ <b>chính email bạn dùng để đăng nhập</b> Săn Deal, để chúng tôi xác nhận đúng chủ tài khoản. Không cần gửi kèm mật khẩu hay giấy tờ gì.</li>
          <li>Chúng tôi xử lý trong vòng <b>7 ngày</b> và trả lời email để xác nhận đã xoá xong.</li>
        </ol>
        <div className="tip">
          Chỉ muốn ngừng nhận email? Không cần xoá tài khoản: bấm link huỷ nhận ở cuối email, hoặc tắt từng loại thông báo trong trang{" "}
          <Link href="/account">Tài khoản</Link>.
        </div>

        <h2>Những gì sẽ bị xoá</h2>
        <ul>
          <li>Email và tên hiển thị.</li>
          <li>Món theo dõi giá, mức giá mong muốn, món đã lưu.</li>
          <li>Cài đặt bản tin, nhắc sale và các thông báo khác.</li>
          <li>Liên kết Telegram, Zalo và đăng ký thông báo đẩy trên các thiết bị.</li>
          <li>Phiên đăng nhập trên mọi thiết bị.</li>
          <li>Deal và ghi chú bạn đã đăng trong mục Cộng đồng, cùng các bình chọn của bạn.</li>
        </ul>

        <h2>Dữ liệu không gắn với bạn</h2>
        <p>
          Một số dữ liệu Săn Deal ghi nhận không gắn với tài khoản hay danh tính nên không xác định được là của bạn: lượt xem sản phẩm theo mã ngẫu nhiên, số đo tốc độ
          tải trang (không lưu IP), giá và đánh giá công khai góp từ tiện ích trình duyệt. Các dữ liệu này tự hết hạn hoặc chỉ còn ở dạng thống kê tổng hợp.
        </p>
        <ul>
          <li>Xoá mã xem ẩn danh: xoá cookie <code>sd_vid</code> của Săn Deal trong cài đặt trình duyệt.</li>
          <li>Xoá món ♡ lưu trên trình duyệt (khi chưa đăng nhập): bỏ ♡ từng món, hoặc xoá dữ liệu trang Săn Deal trong cài đặt trình duyệt.</li>
          <li>Ngừng góp giá từ tiện ích: tắt “Góp giá ẩn danh” trong phần cài đặt của tiện ích, hoặc gỡ tiện ích.</li>
        </ul>

        <h2>Dữ liệu Facebook</h2>
        <p>
          Săn Deal không có đăng nhập bằng Facebook và không đọc dữ liệu tài khoản Facebook của bạn; ứng dụng Facebook của Săn Deal chỉ dùng để đăng bài lên Trang
          Săn Deal. Vì vậy Săn Deal không lưu dữ liệu Facebook nào của bạn. Nếu bạn đã gỡ ứng dụng Săn Deal trong phần cài đặt Facebook và vẫn muốn chắc chắn, hãy gửi
          yêu cầu như trên – chúng tôi sẽ kiểm tra và trả lời.
        </p>

        <h2>Liên hệ</h2>
        <p>Câu hỏi về việc xoá dữ liệu: {contact}.</p>
      </article>
    </>
  );
}
