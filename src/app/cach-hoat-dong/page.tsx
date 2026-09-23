import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = {
  title: "Săn Deal hoạt động thế nào – cách tính giảm giá thật",
  description: "Cách Săn Deal lấy giá, tính mức giảm thật so với 30 ngày, xếp hạng deal và kiếm tiền từ link tiếp thị liên kết.",
  alternates: { canonical: "/cach-hoat-dong" },
};

export default function HowItWorks() {
  return (
    <article className="howto">
      <h1 className="page-title">Săn Deal hoạt động thế nào?</h1>
      <p className="page-sub">Chúng tôi muốn bạn biết chính xác con số trên web đến từ đâu.</p>

      <section className="panel">
        <h2><Icon name="refresh" /> Giá lấy từ đâu, bao lâu cập nhật</h2>
        <p>Giá, ảnh và thông tin shop lấy qua API tiếp thị liên kết chính thức của Shopee, Lazada, TikTok Shop và mạng AccessTrade, không cào trang. Mỗi thẻ deal ghi rõ lần cập nhật gần nhất; giá cũ hơn 24 giờ sẽ được đánh dấu vì có thể đã đổi. Giá cuối cùng luôn là giá bạn thấy trên sàn khi thanh toán.</p>
      </section>

      <section className="panel">
        <h2><Icon name="shield" /> “Giảm thật” nghĩa là gì</h2>
        <p>Nhiều shop tăng giá gốc rồi ghi “-50%”. Săn Deal không dựa vào giá gốc shop tự khai mà so giá hiện tại với <b>giá thường ngày</b>: mức giá sản phẩm giữ lâu nhất trong 30 ngày qua (trung vị có trọng số thời gian). “Rẻ hơn thường ngày 100.000 ₫” là chênh lệch so với mức đó. Sản phẩm theo dõi chưa đủ 7 ngày sẽ ghi “Mới theo dõi giá” thay vì đưa ra con số.</p>
        <p>Nếu giá bị đẩy lên hơn 15% trong 14 ngày rồi “giảm” về mức cũ, deal bị trừ điểm vì đó là giảm giá ảo.</p>
      </section>

      <section className="panel">
        <h2><Icon name="flame" /> Deal được xếp hạng thế nào</h2>
        <p>Điểm deal (0–100) gồm: mức giảm thật (50%), mức giảm sàn hiển thị (20%), đánh giá sản phẩm (15%) và lượt bán (15%). <b>Hoa hồng không nằm trong công thức</b>: một deal không được xếp cao hơn vì chúng tôi nhận nhiều tiền hơn.</p>
        <p>Nhãn trên thẻ: “Thấp nhất 30 ngày”, “Rẻ nhất 3 sàn” (cùng sản phẩm được ghép tự động theo tên), “Cộng đồng chọn” (nhiều người bình chọn hot), “Deal tốt” (điểm từ 70).</p>
      </section>

      <section className="panel">
        <h2><Icon name="users" /> Cộng đồng, lượt bấm và đếm ngược</h2>
        <p>Nhận xét và bình chọn là của người dùng thật đã đăng nhập; bài vi phạm sẽ bị ẩn. “N lượt bấm mua · 24h” là số lượt bấm thật qua link của Săn Deal. Đồng hồ đếm ngược chỉ dùng hạn thật của mã giảm giá và đợt sale, không có số lượng tồn kho giả.</p>
      </section>

      <section className="panel">
        <h2><Icon name="ticket" /> Săn Deal kiếm tiền thế nào</h2>
        <p>Khi bạn mua qua link trên web, sàn trả cho Săn Deal một khoản hoa hồng nhỏ. <b>Giá bạn trả không đổi.</b> Đó là cách chúng tôi duy trì web miễn phí và không bán dữ liệu của bạn.</p>
      </section>

      <p><Link className="btn btn-primary" href="/">Xem deal hot</Link></p>
    </article>
  );
}
