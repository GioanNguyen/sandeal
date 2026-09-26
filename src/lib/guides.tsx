import Link from "next/link";
import type { ReactNode } from "react";

/** Bài hướng dẫn mua sắm (nội dung tĩnh, mỗi bài gắn deal thật ở cuối trang) */
export interface Guide {
  slug: string;
  title: string;
  description: string;
  published: string; // YYYY-MM-DD
  updated: string;
  /** Loại deal gắn cuối bài */
  related: "deep" | "vouchers" | "sales";
  body: ReactNode;
}

export const GUIDES: Guide[] = [
  {
    slug: "cach-nhan-biet-giam-gia-ao",
    title: "Cách nhận biết giảm giá ảo khi mua hàng online",
    description: "5 dấu hiệu một món “giảm 50%” thật ra không rẻ hơn ngày thường, và cách kiểm tra lịch sử giá trước khi bấm mua trên Shopee, Lazada, TikTok Shop.",
    published: "2026-09-26",
    updated: "2026-09-26",
    related: "deep",
    body: (
      <>
        <p>
          Con số “−50%” trên trang sản phẩm là so với <b>giá gốc do shop tự đặt</b>. Shop có thể đặt giá gốc cao hơn nhiều so với giá bán thật, hoặc tăng giá vài
          ngày trước đợt sale rồi “giảm” về đúng mức cũ. Vì vậy mức giảm hiển thị không cho biết món đó có rẻ hơn bình thường hay không.
        </p>
        <h2>1. So với giá của chính món đó trong 30 ngày, không so với giá gạch</h2>
        <p>
          Cách đáng tin nhất là xem món đó đã bán giá bao nhiêu trong vài tuần gần đây. Nếu giá hôm nay thấp hơn giá phổ biến 30 ngày qua thì mới là giảm thật.
          Săn Deal gọi mức này là <b>“giảm thật”</b> và dùng nó thay cho phần trăm giảm của shop.
        </p>
        <h2>2. Cẩn thận món tăng giá ngay trước ngày sale</h2>
        <p>
          Dấu hiệu dễ thấy trên biểu đồ giá: đường giá đi ngang nhiều tuần, vọt lên 1–2 tuần trước ngày đôi (9.9, 10.10, 11.11…), rồi rơi xuống đúng ngày sale.
          Giá “sale” khi đó thường chỉ bằng giá cũ.
        </p>
        <div className="tip">Mẹo: trước mỗi đợt sale, trang đợt sale trên Săn Deal liệt kê những món đang tăng giá so với 10–40 ngày trước để bạn so lại.</div>
        <h2>3. Giá gạch cao bất thường so với sản phẩm cùng loại</h2>
        <p>
          Nếu nhiều shop bán cùng món ở mức 300–350K mà một shop ghi giá gốc 900K “giảm còn 349K”, thì mức giảm 60% gần như vô nghĩa. Hãy so giá giữa các shop và
          các sàn – trang “Giá hôm nay” của từng loại sản phẩm gom sẵn giá rẻ nhất trên 3 sàn.
        </p>
        <h2>4. Tính giá cuối cùng, không nhìn giá niêm yết</h2>
        <p>
          Giá bạn trả = giá sản phẩm − mã của shop − mã của sàn + phí vận chuyển. Một món rẻ hơn 10K nhưng mất 30K phí ship vẫn đắt hơn. Dùng{" "}
          <Link href="/tinh-gia">Máy tính giá cuối cùng</Link> để cộng trừ đủ các khoản.
        </p>
        <h2>5. Đồng hồ đếm ngược và “chỉ còn vài sản phẩm”</h2>
        <p>
          Những dòng này tạo cảm giác phải mua ngay. Chúng không nói gì về việc giá có tốt hay không. Nếu lịch sử giá cho thấy món đó thường xuyên ở mức này, bạn
          không mất gì khi chờ thêm.
        </p>
        <h2>Kiểm tra nhanh trong 10 giây</h2>
        <ol>
          <li>Copy link sản phẩm trên Shopee, Lazada hoặc TikTok Shop.</li>
          <li>Dán vào <Link href="/kiem-tra-gia">Kiểm tra giá</Link> trên Săn Deal.</li>
          <li>Xem biểu đồ giá, mức “giảm thật” và mục “Nên mua ngay hay chờ?”.</li>
        </ol>
        <p>
          Nếu Săn Deal chưa có dữ liệu của món đó, hệ thống sẽ bắt đầu theo dõi – bạn có thể đặt báo khi giá giảm để không phải kiểm tra lại mỗi ngày.
        </p>
      </>
    ),
  },
  {
    slug: "cach-dung-ma-giam-gia-shopee-lazada-tiktok",
    title: "Cách dùng mã giảm giá Shopee, Lazada, TikTok Shop để được giá thấp nhất",
    description: "Phân biệt mã của shop, mã của sàn và mã freeship; thứ tự áp mã, điều kiện đơn tối thiểu và cách tính xem mã nào thật sự có lợi.",
    published: "2026-09-26",
    updated: "2026-09-26",
    related: "vouchers",
    body: (
      <>
        <p>
          Mỗi sàn có nhiều loại mã, và thường có thể dùng <b>nhiều loại cùng lúc</b> trên một đơn. Hiểu từng loại giúp bạn không bỏ sót khoản giảm nào, cũng không
          mua thêm đồ không cần chỉ để đủ điều kiện mã.
        </p>
        <h2>Các loại mã thường gặp</h2>
        <ul>
          <li><b>Mã của shop:</b> do từng shop phát, chỉ áp cho sản phẩm của shop đó.</li>
          <li><b>Mã của sàn:</b> áp cho nhiều shop, thường có điều kiện đơn tối thiểu và giảm tối đa.</li>
          <li><b>Mã miễn phí / giảm phí vận chuyển:</b> trừ vào phí ship, hay được dùng cùng hai loại trên.</li>
        </ul>
        <p>Điều kiện cụ thể (loại nào dùng chung được với loại nào, ngành hàng áp dụng) do từng sàn quy định và có thể thay đổi – hãy đọc điều kiện trong chi tiết mã.</p>
        <h2>Đọc đúng 3 con số của một mã</h2>
        <ol>
          <li><b>Mức giảm:</b> số tiền cố định (ví dụ 30K) hoặc phần trăm (ví dụ 10%).</li>
          <li><b>Giảm tối đa:</b> với mã phần trăm, đây mới là số tiền bạn thật sự được giảm khi đơn lớn.</li>
          <li><b>Đơn tối thiểu:</b> tổng tiền hàng cần đạt để dùng được mã.</li>
        </ol>
        <div className="tip">Ví dụ: mã “giảm 10% tối đa 50K, đơn từ 200K”. Đơn 300K được giảm 30K; đơn 800K cũng chỉ được giảm 50K.</div>
        <h2>Có nên mua thêm cho đủ đơn tối thiểu?</h2>
        <p>
          Chỉ khi món mua thêm là thứ bạn vẫn định mua. Nếu cần thêm 60K để được giảm 30K, bạn đang trả thêm 30K cho một món có thể không cần. Máy tính giá
          cuối cùng giúp so hai phương án nhanh.
        </p>
        <h2>Mã hết lượt nhanh vào ngày sale</h2>
        <p>
          Mã lớn trong ngày đôi thường hết lượt sau vài phút mở. Nên lưu mã từ trước, để sẵn món trong giỏ và kiểm tra giá thật của món đó trước ngày sale.
        </p>
        <h2>Săn Deal giúp gì</h2>
        <ul>
          <li><Link href="/vouchers">Trang mã giảm giá</Link> gom mã còn hạn của 3 sàn, sắp theo giờ hết hạn.</li>
          <li>Trên mỗi sản phẩm, Săn Deal tính sẵn “giá sau mã giảm tốt nhất” từ các mã đang có.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "khi-nao-nen-mua-hang-online",
    title: "Khi nào nên mua hàng online: chờ sale hay mua ngay?",
    description: "Lịch sale ngày đôi, giữa tháng, ngày lương và cách dựa vào lịch sử giá để quyết định nên chờ đợt sale tới hay mua ngay hôm nay.",
    published: "2026-09-26",
    updated: "2026-09-26",
    related: "sales",
    body: (
      <>
        <p>
          Không phải món nào cũng rẻ hơn vào ngày sale, và không phải lúc nào chờ cũng đáng. Câu trả lời nằm ở <b>lịch sử giá của chính món bạn định mua</b>.
        </p>
        <h2>Các mốc sale định kỳ</h2>
        <ul>
          <li><b>Ngày đôi</b> (1.1, 2.2 … 12.12): đợt lớn nhất mỗi tháng, đặc biệt 9.9, 10.10, 11.11 và 12.12.</li>
          <li><b>Giữa tháng</b> (ngày 15) và <b>ngày lương</b> (ngày 25): thường có mã giảm nhưng quy mô nhỏ hơn ngày đôi.</li>
          <li><b>Black Friday</b> (thứ Sáu cuối tháng 11): nhiều ưu đãi đồ điện tử, thời trang.</li>
        </ul>
        <p>Xem ngày cụ thể và đếm ngược trong <Link href="/lich-sale">Lịch sale</Link>.</p>
        <h2>Nên mua ngay khi…</h2>
        <ul>
          <li>Giá hiện tại đang bằng hoặc gần mức thấp nhất từng ghi nhận.</li>
          <li>Món đó đang “giảm thật” so với giá 30 ngày và bạn cần dùng sớm.</li>
          <li>Đợt sale lớn tiếp theo còn xa (hơn 2–3 tuần).</li>
        </ul>
        <h2>Nên chờ khi…</h2>
        <ul>
          <li>Lịch sử giá cho thấy món đó từng rẻ hơn rõ rệt vào các đợt sale trước.</li>
          <li>Giá đang cao hơn mức phổ biến của vài tuần trước.</li>
          <li>Đợt sale lớn chỉ còn vài ngày và bạn không gấp.</li>
        </ul>
        <div className="tip">
          Mỗi trang sản phẩm trên Săn Deal có mục “Nên mua ngay hay chờ?” – kết luận dựa trên lịch sử giá của chính món đó, kèm các mốc sale trước đã được đánh dấu
          trên biểu đồ.
        </div>
        <h2>Không muốn canh giá mỗi ngày?</h2>
        <p>
          Đặt <b>báo khi giá giảm</b> trên trang sản phẩm (qua email, thông báo trình duyệt hoặc Telegram), hoặc bấm “Nhắc tôi khi sale bắt đầu” để nhận tin
          đúng lúc đợt sale mở.
        </p>
      </>
    ),
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
