import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LEGAL_UPDATED, contactEmail } from "@/lib/legal";
import { siteUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description: "Săn Deal thu thập dữ liệu gì, dùng để làm gì, chia sẻ với ai và cách yêu cầu xoá dữ liệu của bạn.",
  alternates: { canonical: "/chinh-sach-bao-mat" },
};

export default function PrivacyPage() {
  const email = contactEmail();
  const host = new URL(siteUrl()).host;
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : <>trang Facebook Săn Deal</>;
  return (
    <>
      <Breadcrumbs items={[{ name: "Chính sách bảo mật" }]} />
      <article className="guide legal">
        <h1 className="page-title">Chính sách bảo mật</h1>
        <p className="muted">Cập nhật ngày {LEGAL_UPDATED}</p>
        <p>
          Săn Deal ({host}) là trang theo dõi lịch sử giá và tổng hợp mã giảm giá trên Shopee, Lazada và TikTok Shop. Chúng tôi chỉ thu thập những dữ liệu cần để
          trang hoạt động, <b>không bán dữ liệu cá nhân</b> và không dùng dữ liệu của bạn để quảng cáo theo hành vi.
        </p>

        <h2>1. Dữ liệu chúng tôi thu thập</h2>
        <h3>Khi bạn chỉ xem trang (không đăng nhập)</h3>
        <ul>
          <li><b>Mã khách ẩn danh</b> (cookie <code>sd_vid</code>): một chuỗi ngẫu nhiên để đếm lượt xem sản phẩm và gợi ý “Người xem món này cũng xem”. Không gắn với tên, email hay địa chỉ IP.</li>
          <li><b>Món đã lưu (♡)</b>: lưu ngay trên trình duyệt của bạn (localStorage), không gửi về máy chủ nếu bạn chưa đăng nhập.</li>
          <li><b>Lượt bấm sang sàn</b>: khi bạn bấm “Mua”/“Dùng ngay”, chúng tôi ghi lại món hoặc mã được bấm, sàn và trang trước đó – không kèm thông tin cá nhân.</li>
          <li><b>Tốc độ tải trang</b>: số đo thời gian tải (LCP, INP, CLS…), đường dẫn trang, loại thiết bị (điện thoại/máy tính) và loại mạng nếu trình duyệt cho biết. Không lưu IP, tự xoá sau 60 ngày.</li>
          <li><b>Từ khoá tìm kiếm</b>: để gợi ý “đang được tìm nhiều”, không lưu ai đã tìm.</li>
          <li><b>Ảnh khi dùng Tìm bằng ảnh</b>: chỉ dùng để tìm món giống nhất rồi bỏ, không lưu lại.</li>
          <li><b>Địa chỉ IP</b>: chỉ dùng tạm thời để chống gửi yêu cầu tràn lan (giới hạn tần suất) và ghi nhật ký lỗi máy chủ.</li>
        </ul>
        <h3>Khi bạn đăng nhập hoặc đặt báo giá</h3>
        <ul>
          <li><b>Email</b>: để đăng nhập bằng link gửi qua email và gửi báo giá, bản tin bạn đã chọn. Chúng tôi không dùng mật khẩu.</li>
          <li><b>Tên hiển thị</b> (nếu bạn đặt) khi đăng deal hoặc bình chọn trong mục Cộng đồng – tên và deal bạn đăng hiển thị công khai.</li>
          <li><b>Món theo dõi, mức giá mong muốn, món đã lưu, cài đặt thông báo</b> (từ khoá, danh mục, sàn, loại bản tin).</li>
          <li><b>Telegram, Zalo</b>: mã người dùng của ứng dụng đó, chỉ khi bạn tự liên kết để nhận báo giá qua đó.</li>
          <li><b>Thông báo đẩy</b>: địa chỉ nhận thông báo do trình duyệt cấp và loại trình duyệt, chỉ khi bạn bật thông báo.</li>
          <li><b>Cookie đăng nhập</b> (<code>sd_session</code>): giữ bạn đăng nhập; trên máy chủ chỉ lưu bản mã hoá (hash) của cookie này.</li>
        </ul>
        <h3>Khi bạn dùng tiện ích Chrome Săn Deal</h3>
        <ul>
          <li>Tiện ích đọc <b>trang sản phẩm bạn đang xem</b> trên Shopee, Lazada, TikTok Shop để hiện lịch sử giá.</li>
          <li>Nếu bạn bật “Góp giá”: tiện ích gửi đường dẫn sản phẩm, giá, phân loại đang chọn và các đánh giá công khai đang hiện trên trang. Người góp được nhận diện bằng một mã băm một chiều từ IP (không lưu IP gốc) để chống dữ liệu sai.</li>
          <li>Tiện ích không đọc tài khoản sàn, giỏ hàng, đơn hàng, địa chỉ hay thông tin thanh toán của bạn.</li>
        </ul>

        <h2>2. Chúng tôi dùng dữ liệu để làm gì</h2>
        <ul>
          <li>Hiện giá, lịch sử giá, mã giảm giá và gợi ý món tương tự.</li>
          <li>Gửi báo giá, nhắc sale, bản tin – đúng những loại bạn đã bật; email báo giá và bản tin đều có link huỷ nhận.</li>
          <li>Thống kê tổng hợp (lượt xem, lượt bấm, tốc độ trang) để cải thiện site. Không lập hồ sơ quảng cáo cá nhân.</li>
          <li>Chống gian lận và lạm dụng (giới hạn tần suất, phát hiện giá góp sai).</li>
        </ul>

        <h2>3. Chia sẻ với bên thứ ba</h2>
        <p>Chúng tôi không bán hay cho thuê dữ liệu cá nhân. Một số dịch vụ bên ngoài tham gia vận hành site:</p>
        <ul>
          <li><b>Sàn thương mại điện tử và mạng tiếp thị liên kết</b> (Shopee, Lazada, TikTok Shop, AccessTrade…): khi bạn bấm sang sàn, bạn rời Săn Deal và chính sách của sàn được áp dụng. Link mua là link tiếp thị liên kết; báo cáo hoa hồng chúng tôi nhận chỉ gồm thông tin đơn hàng tổng hợp, không có tên hay địa chỉ người mua.</li>
          <li><b>Dịch vụ gửi email</b>: nhận địa chỉ email để gửi link đăng nhập và báo giá.</li>
          <li><b>Telegram, Zalo, dịch vụ thông báo đẩy của trình duyệt</b>: chỉ khi bạn bật các kênh này.</li>
          <li><b>Claude (Anthropic)</b>: dùng để tóm tắt các đánh giá công khai của người mua và soạn nháp bài hướng dẫn từ số liệu giá. Chỉ gửi nội dung đánh giá và số liệu sản phẩm, không gửi dữ liệu tài khoản của bạn.</li>
          <li><b>Facebook</b>: Trang Săn Deal đăng bài deal và bài hướng dẫn qua ứng dụng của chúng tôi. Ứng dụng này chỉ đăng lên Trang của Săn Deal, không đọc dữ liệu tài khoản Facebook của bạn. Site không có đăng nhập bằng Facebook.</li>
          <li><b>Cơ quan nhà nước</b> khi có yêu cầu hợp pháp theo quy định của pháp luật Việt Nam.</li>
        </ul>

        <h2>4. Lưu trữ và bảo vệ</h2>
        <ul>
          <li>Dữ liệu lưu trên máy chủ của Săn Deal, truy cập qua kết nối mã hoá (https).</li>
          <li>Không lưu mật khẩu; link đăng nhập và cookie đăng nhập chỉ lưu dạng mã hoá một chiều, link đăng nhập hết hạn sau thời gian ngắn.</li>
          <li>Số đo tốc độ giữ 60 ngày; nhật ký báo công cụ tìm kiếm giữ 90 ngày; dữ liệu tài khoản giữ đến khi bạn yêu cầu xoá.</li>
        </ul>

        <h2>5. Quyền của bạn</h2>
        <ul>
          <li>Xem và sửa thông tin, món theo dõi, cài đặt thông báo trong trang <Link href="/account">Tài khoản</Link>.</li>
          <li>Huỷ nhận email bất cứ lúc nào bằng link cuối email hoặc trong trang Tài khoản.</li>
          <li>Xoá món đã lưu trên trình duyệt bằng cách bỏ ♡ hoặc xoá dữ liệu trang trong cài đặt trình duyệt.</li>
          <li>Yêu cầu xoá toàn bộ dữ liệu theo <Link href="/xoa-du-lieu">hướng dẫn xoá dữ liệu</Link>.</li>
        </ul>

        <h2>6. Yêu cầu xoá dữ liệu</h2>
        <p>
          Bạn có thể yêu cầu xoá tài khoản và toàn bộ dữ liệu gắn với tài khoản bất cứ lúc nào: gửi email tới {contact} với tiêu đề <b>“Xoá dữ liệu Săn Deal”</b> từ
          chính email đăng nhập, chúng tôi xử lý trong vòng 7 ngày. Xem đầy đủ những gì sẽ bị xoá ở trang <Link href="/xoa-du-lieu">Hướng dẫn xoá dữ liệu</Link>.
        </p>

        <h2>7. Trẻ em</h2>
        <p>Săn Deal không dành cho trẻ em dưới 16 tuổi và không cố ý thu thập dữ liệu của trẻ em. Nếu phát hiện, vui lòng liên hệ để chúng tôi xoá.</p>

        <h2>8. Thay đổi chính sách</h2>
        <p>Khi chính sách thay đổi, chúng tôi cập nhật trang này và ngày cập nhật ở đầu trang. Với thay đổi quan trọng, chúng tôi có thể thông báo thêm qua email cho người có tài khoản.</p>

        <h2>9. Liên hệ</h2>
        <p>Mọi câu hỏi về dữ liệu cá nhân: {contact}. Xem thêm <Link href="/dieu-khoan">Điều khoản sử dụng</Link>.</p>
      </article>
    </>
  );
}
