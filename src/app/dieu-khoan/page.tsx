import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LEGAL_UPDATED, contactEmail } from "@/lib/legal";
import { siteUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: "Điều khoản khi sử dụng Săn Deal: giá và mã giảm giá lấy từ sàn, link tiếp thị liên kết, nội dung cộng đồng, tiện ích trình duyệt.",
  alternates: { canonical: "/dieu-khoan" },
};

export default function TermsPage() {
  const email = contactEmail();
  const host = new URL(siteUrl()).host;
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : <>trang Facebook Săn Deal</>;
  return (
    <>
      <Breadcrumbs items={[{ name: "Điều khoản sử dụng" }]} />
      <article className="guide legal">
        <h1 className="page-title">Điều khoản sử dụng</h1>
        <p className="muted">Cập nhật ngày {LEGAL_UPDATED}</p>
        <p>
          Khi dùng Săn Deal ({host}), tiện ích trình duyệt Săn Deal hoặc nhận thông báo từ Săn Deal, bạn đồng ý với các điều khoản dưới đây. Vui lòng đọc cùng{" "}
          <Link href="/chinh-sach-bao-mat">Chính sách bảo mật</Link>.
        </p>

        <h2>1. Săn Deal là gì</h2>
        <p>
          Săn Deal là trang <b>theo dõi lịch sử giá và tổng hợp thông tin khuyến mãi</b> trên Shopee, Lazada và TikTok Shop. Săn Deal <b>không bán hàng</b>, không nhận
          đặt hàng hay thanh toán. Mọi giao dịch diễn ra trên sàn, giữa bạn với người bán, theo điều khoản của sàn đó.
        </p>

        <h2>2. Giá, mã giảm giá và thông tin sản phẩm</h2>
        <ul>
          <li>Giá, tình trạng hàng và mã giảm giá được lấy từ sàn, mạng tiếp thị liên kết và người dùng tiện ích góp lại. Giá trên sàn có thể đổi bất cứ lúc nào, vì vậy giá trên Săn Deal có thể chênh so với lúc bạn mở sàn. <b>Giá cuối cùng là giá hiển thị trên sàn khi bạn thanh toán.</b></li>
          <li>Mã giảm giá có điều kiện, số lượt và thời hạn do sàn hoặc người bán quy định; Săn Deal không bảo đảm mã còn dùng được.</li>
          <li>“Giảm thật”, “Nên mua ngay hay chờ?”, dự báo giá đợt sale và cảnh báo rủi ro là phân tích tự động từ lịch sử giá Săn Deal ghi nhận, chỉ để tham khảo, không phải cam kết về giá hay chất lượng hàng.</li>
          <li>Tóm tắt đánh giá (có ghi “Tóm tắt bằng AI”) và một số bài hướng dẫn được soạn với sự hỗ trợ của AI, có thể chưa chính xác hoàn toàn.</li>
          <li>Ghép sản phẩm giữa các sàn được thực hiện tự động theo tên; hãy kiểm tra lại phân loại, phiên bản trước khi mua.</li>
        </ul>

        <h2>3. Link tiếp thị liên kết</h2>
        <p>
          Nhiều link “Mua”, “Dùng ngay” trên Săn Deal là link tiếp thị liên kết: khi bạn mua qua link, Săn Deal có thể nhận hoa hồng từ sàn hoặc mạng tiếp thị liên kết.
          <b> Giá bạn trả không đổi</b>. Hoa hồng không ảnh hưởng tới cách Săn Deal tính “giảm thật” hay xếp hạng deal.
        </p>

        <h2>4. Tài khoản</h2>
        <ul>
          <li>Bạn đăng nhập bằng link gửi qua email; hãy giữ email của mình an toàn vì ai mở được hộp thư đó có thể đăng nhập.</li>
          <li>Bạn chịu trách nhiệm về hoạt động trong tài khoản của mình. Chúng tôi có thể khoá tài khoản dùng để phá hoại, gửi tràn lan hoặc vi phạm pháp luật.</li>
          <li>Bạn có thể yêu cầu xoá tài khoản bất cứ lúc nào theo <Link href="/xoa-du-lieu">hướng dẫn xoá dữ liệu</Link>.</li>
        </ul>

        <h2>5. Nội dung bạn đăng</h2>
        <p>Khi đăng deal, ghi chú hoặc bình chọn trong mục Cộng đồng, bạn đồng ý:</p>
        <ul>
          <li>Không đăng nội dung sai sự thật, lừa đảo, hàng cấm, hàng giả, nội dung xúc phạm hoặc vi phạm pháp luật Việt Nam; không đăng thông tin cá nhân của người khác.</li>
          <li>Không dùng Săn Deal để quảng cáo trá hình hay đẩy link của mình một cách tràn lan.</li>
          <li>Cho phép Săn Deal hiển thị công khai nội dung đó trên site và trên các kênh của Săn Deal (Trang Facebook, Telegram…), kèm tên hiển thị của bạn.</li>
          <li>Săn Deal có quyền ẩn hoặc gỡ nội dung vi phạm mà không cần báo trước.</li>
        </ul>

        <h2>6. Tiện ích trình duyệt</h2>
        <ul>
          <li>Tiện ích Săn Deal chỉ chạy trên Shopee, Lazada, TikTok Shop và hiện lịch sử giá ở trang sản phẩm; tính năng “Góp giá” có thể tắt bất cứ lúc nào trong phần cài đặt của tiện ích.</li>
          <li>Không sao chép, sửa đổi hay phát tán lại tiện ích dưới tên khác.</li>
        </ul>

        <h2>7. Sử dụng hợp lý</h2>
        <ul>
          <li>Không dùng công cụ tự động để tải hàng loạt dữ liệu của Săn Deal, không gửi yêu cầu nhằm làm quá tải máy chủ, không cố truy cập trái phép.</li>
          <li>Số liệu, biểu đồ và bài viết trên Săn Deal được trích dẫn khi ghi rõ nguồn và dẫn link về trang gốc.</li>
          <li>Tên, logo, hình ảnh sản phẩm và nhãn hiệu thuộc về sàn, người bán hoặc chủ sở hữu tương ứng; Săn Deal chỉ dùng để nhận diện sản phẩm.</li>
        </ul>

        <h2>8. Giới hạn trách nhiệm</h2>
        <p>
          Săn Deal được cung cấp “như hiện có”. Chúng tôi cố gắng để thông tin chính xác và site hoạt động liên tục nhưng không bảo đảm điều đó. Săn Deal không chịu
          trách nhiệm về sản phẩm, chất lượng, giao hàng, đổi trả hay tranh chấp giữa bạn với người bán hoặc sàn, cũng như thiệt hại phát sinh từ việc dựa vào giá,
          mã hay phân tích trên Săn Deal để mua hàng.
        </p>

        <h2>9. Thay đổi điều khoản</h2>
        <p>Chúng tôi có thể cập nhật điều khoản; ngày cập nhật ghi ở đầu trang. Tiếp tục dùng Săn Deal sau khi cập nhật nghĩa là bạn đồng ý với điều khoản mới.</p>

        <h2>10. Luật áp dụng và liên hệ</h2>
        <p>
          Điều khoản này tuân theo pháp luật Việt Nam. Mọi câu hỏi hoặc phản ánh, vui lòng liên hệ {contact}.
        </p>
      </article>
    </>
  );
}
