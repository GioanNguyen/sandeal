import Link from "next/link";
// Nội dung bài là JSX chạy ngay lúc nạp file: cần React trong phạm vi khi chạy ngoài Next (kiểm thử bằng tsx)
import React from "react";
import type { Guide } from "./guides";

/**
 * Lịch bài hướng dẫn: mỗi bài tự hiện trên site (và tự đăng lên Trang Facebook nếu đã cấu hình) vào 8h sáng
 * ngày `published` (giờ Việt Nam). Thêm bài mới: thêm 1 mục vào cuối danh sách với ngày đăng kế tiếp.
 * Trang /admin/huong-dan báo khi lịch sắp hết bài.
 */
export const SCHEDULED_GUIDES: Guide[] = [
  {
    slug: "kinh-nghiem-san-sale-ngay-doi",
    title: "Kinh nghiệm săn sale ngày đôi 10.10, 11.11, 12.12: chuẩn bị gì, mua lúc nào",
    description: "Lên danh sách trước, kiểm tra giá trước ngày sale, lưu mã đúng giờ và biết khi nào nên bỏ qua – để ngày đôi thật sự rẻ hơn ngày thường.",
    published: "2026-10-02",
    updated: "2026-10-02",
    related: "sales",
    body: (
      <>
        <p>
          Ngày đôi (ngày và tháng trùng số như 10.10, 11.11, 12.12) là dịp các sàn tung nhiều mã nhất trong tháng. Nhưng cũng là lúc nhiều món bị tăng giá trước rồi
          “giảm” về mức cũ. Muốn ngày đôi rẻ thật, phần lớn việc cần làm nằm ở <b>một đến hai tuần trước</b> ngày sale.
        </p>
        <h2>1. Hai tuần trước: lên danh sách và ghi lại giá</h2>
        <p>
          Viết ra những món bạn thật sự định mua, kèm mức giá chấp nhận được. Thêm từng món vào Săn Deal (bấm ♡ hoặc đặt báo giá) để có lịch sử giá trước ngày sale.
          Khi ngày sale tới, bạn so được giá sale với giá của chính món đó vài tuần trước, không phải với giá gạch ngang do shop tự ghi.
        </p>
        <div className="tip">Mẹo: trên trang sản phẩm, nút “Nhắc tôi khi sale bắt đầu” gửi thông báo đúng lúc đợt sale mở, kèm giá mới của món đó.</div>
        <h2>2. Một tuần trước: xem món nào đang bị đẩy giá</h2>
        <p>
          Trang <Link href="/nang-gia">Ai đang nâng giá trước sale?</Link> liệt kê các món đang đắt hơn giá thường ngày của chính chúng (giá phổ biến 14–30 ngày
          trước). Nếu món bạn định mua nằm trong danh sách, mức “giảm” vào ngày sale rất có thể chỉ đưa giá về như cũ.
        </p>
        <h2>3. Ngày sale: canh giờ mở mã, không canh giờ mua</h2>
        <p>
          Mã giảm giá của sàn thường mở theo khung giờ và hết lượt nhanh. Lưu mã ngay khi mở, sau đó mới thong thả kiểm tra giá. Xem các mã đang có ở trang{" "}
          <Link href="/vouchers">Mã giảm giá</Link> và cộng trừ đủ các khoản bằng <Link href="/tinh-gia">Máy tính giá cuối cùng</Link>.
        </p>
        <h2>4. Khi nào nên bỏ qua đợt sale</h2>
        <ul>
          <li>Giá sale không thấp hơn giá thường ngày của chính món đó.</li>
          <li>Phải mua thêm đồ không cần chỉ để đủ đơn tối thiểu của mã.</li>
          <li>Món đã từng rẻ hơn mức này vào một ngày bình thường – biểu đồ giá 90 ngày cho bạn biết điều đó.</li>
        </ul>
        <p>
          Bỏ qua một đợt sale không có nghĩa là mất cơ hội: đặt báo giá ở mức mong muốn, Săn Deal sẽ gửi email khi giá về mức đó, dù là ngày đôi hay ngày thường.
        </p>
        <p>
          Xem ngày giờ cụ thể các đợt sale sắp tới ở <Link href="/lich-sale">Lịch sale</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "cach-xem-lich-su-gia-san-pham",
    title: "Cách xem lịch sử giá sản phẩm trên Shopee, Lazada, TikTok Shop",
    description: "Hai cách xem giá của một món trong 90 ngày qua: dán link hoặc tìm theo tên, bằng ảnh – và cách đọc biểu đồ giá cho đúng.",
    published: "2026-10-06",
    updated: "2026-10-06",
    related: "deep",
    body: (
      <>
        <p>
          Các sàn chỉ cho bạn thấy giá hôm nay và một mức giá gạch ngang. Để biết hôm nay có thật sự rẻ, bạn cần xem giá của món đó trong vài tuần đến vài tháng
          qua. Dưới đây là hai cách làm với Săn Deal.
        </p>
        <h2>Cách 1: Dán link sản phẩm</h2>
        <ol>
          <li>Trên app hoặc web của sàn, bấm Chia sẻ → Sao chép liên kết.</li>
          <li>Mở <Link href="/kiem-tra-gia">Kiểm tra giá</Link>, dán link và bấm kiểm tra.</li>
          <li>Xem biểu đồ giá, mức “giảm thật” và kết luận “Nên mua ngay hay chờ?”.</li>
        </ol>
        <p>Nếu món chưa có trong dữ liệu, Săn Deal bắt đầu theo dõi từ lúc đó; vài ngày sau biểu đồ sẽ đủ để so sánh.</p>
        <h2>Cách 2: Tìm theo tên hoặc bằng ảnh</h2>
        <p>
          Gõ tên sản phẩm vào ô tìm kiếm ở đầu trang. Thấy món ưng trên mạng xã hội mà không biết tên? Dùng <Link href="/tim-bang-anh">Tìm bằng ảnh</Link> để tìm
          món giống nhất kèm giá.
        </p>
        <h2>Đọc biểu đồ giá thế nào cho đúng</h2>
        <ul>
          <li><b>Đường kẻ “giá thường ngày”</b> là mức giá món đó được bán lâu nhất – so giá hôm nay với đường này, không so với giá gạch.</li>
          <li><b>Đáy thấp nhất</b> cho biết giá tốt nhất từng có. Hôm nay gần đáy là dấu hiệu tốt.</li>
          <li><b>Vạch đánh dấu đợt sale</b> cho thấy dịp sale trước món này có rẻ hơn không. Nếu không, chẳng cần chờ sale.</li>
          <li><b>Giá vọt lên rồi rơi xuống</b> ngay trước ngày sale là kiểu “tăng trước, giảm sau” quen thuộc.</li>
        </ul>
      </>
    ),
  },
  {
    slug: "shopee-lazada-tiktok-shop-san-nao-re-hon",
    title: "Shopee, Lazada hay TikTok Shop: mua ở đâu rẻ hơn?",
    description: "Không sàn nào rẻ nhất cho mọi món. Cách so cùng một sản phẩm giữa ba sàn, tính đủ mã và phí ship, và những điểm cần kiểm tra trước khi chọn.",
    published: "2026-10-13",
    updated: "2026-10-13",
    related: "deep",
    body: (
      <>
        <p>
          Câu trả lời ngắn: <b>tuỳ từng món và từng thời điểm</b>. Cùng một sản phẩm có thể rẻ nhất ở Shopee tuần này, sang tuần sau lại rẻ hơn ở TikTok Shop vì
          một shop ở đó chạy khuyến mãi. Vì vậy cách đáng tin là so từng món, ngay lúc bạn định mua.
        </p>
        <h2>So cùng một sản phẩm, không so cùng một tên</h2>
        <p>
          Hai sản phẩm trùng tên vẫn có thể khác dung tích, phiên bản hay phụ kiện đi kèm. Trang <Link href="/so-sanh">So sánh giá</Link> ghép tự động các món giống
          nhau giữa ba sàn và xếp theo mức chênh lệch. Trên trang từng sản phẩm, mục “So sánh giá giữa các sàn” cho biết sàn nào đang rẻ nhất.
        </p>
        <div className="tip">Ghép tự động dựa trên tên sản phẩm, nên trước khi mua hãy mở cả hai trang và đối chiếu phân loại, quy cách.</div>
        <h2>Tính giá cuối cùng, không phải giá niêm yết</h2>
        <p>
          Giá bạn thật sự trả còn phụ thuộc mã giảm của shop, mã của sàn và phí vận chuyển. Một món rẻ hơn 15K ở sàn A nhưng không có mã freeship có thể đắt hơn sàn
          B. Dùng <Link href="/tinh-gia">Máy tính giá cuối cùng</Link> để cộng trừ đủ các khoản cho từng sàn.
        </p>
        <h2>Những điểm khác ngoài giá</h2>
        <ul>
          <li><b>Shop:</b> shop chính hãng (Mall) và shop thường cùng bán một món thường chênh giá; xem điểm đánh giá của shop.</li>
          <li><b>Thời gian giao:</b> hàng gửi từ kho gần thường tới sớm hơn.</li>
          <li><b>Đổi trả:</b> chính sách khác nhau theo sàn và theo shop – đọc kỹ ở trang sản phẩm trước khi đặt.</li>
        </ul>
        <h2>Khi nhận email báo giá</h2>
        <p>
          Khi một món bạn theo dõi giảm giá, trước khi mua hãy mở trang sản phẩm trên Săn Deal và xem lại mục so sánh giữa các sàn: có lúc sàn khác cũng vừa giảm
          và còn rẻ hơn.
        </p>
      </>
    ),
  },
  {
    slug: "cach-kiem-tra-shop-uy-tin",
    title: "Cách kiểm tra shop uy tín trước khi đặt hàng online",
    description: "Năm điều cần xem ở một shop trước khi bấm mua: điểm và số lượt đánh giá, tỉ lệ đánh giá thấp, giá rẻ bất thường, thời gian hoạt động và cách shop trả lời.",
    published: "2026-10-20",
    updated: "2026-10-20",
    related: "deep",
    body: (
      <>
        <p>
          Phần lớn các lần mua hàng không như ý không đến từ việc trả đắt vài chục nghìn, mà từ việc chọn nhầm shop. Dành một phút kiểm tra những điểm dưới đây
          trước khi đặt hàng.
        </p>
        <h2>1. Điểm shop và số lượt đánh giá đi cùng nhau</h2>
        <p>
          Điểm 4,9 trên 20 lượt đánh giá chưa nói lên nhiều. Điểm 4,8 trên vài nghìn lượt đáng tin hơn. Trên các sàn lớn, phần lớn shop bán tốt có điểm từ khoảng
          4,7 trở lên; shop thấp hơn rõ rệt thì nên đọc kỹ đánh giá.
        </p>
        <h2>2. Tỉ lệ đánh giá 1–2 sao</h2>
        <p>
          Một vài đánh giá xấu là bình thường. Nhưng nếu hơn khoảng một phần mười số đánh giá là 1–2 sao, có điều gì đó lặp lại. Mục “Đánh giá người mua &amp; rủi ro”
          trên trang sản phẩm của Săn Deal tự tính tỉ lệ này và báo khi nó cao bất thường.
        </p>
        <h2>3. Giá rẻ bất thường so với shop chính hãng</h2>
        <p>
          Cùng một sản phẩm mà rẻ hơn gần một nửa so với shop chính hãng là dấu hiệu cần cảnh giác: hàng cũ, hàng nhái hoặc khác phiên bản. Săn Deal gắn cảnh báo
          “Rẻ bất thường so với shop chính hãng” khi gặp trường hợp này.
        </p>
        <h2>4. Đọc 1–2 sao trước, 5 sao sau</h2>
        <p>
          Đánh giá xấu cho biết rủi ro thật sự là gì: giao sai màu, thiếu phụ kiện, hay chỉ là giao chậm. Nếu phản ánh xoay quanh hàng giả hoặc lỗi giống nhau, hãy
          chọn shop khác.
        </p>
        <h2>5. Cách shop trả lời</h2>
        <p>
          Shop trả lời đánh giá xấu một cách cụ thể (đổi hàng, hoàn tiền) thường xử lý sự cố tốt hơn shop im lặng hoặc trả lời bằng câu mẫu.
        </p>
        <div className="tip">
          Trang <Link href="/shop">Shop</Link> cho biết mỗi shop có bao nhiêu món đang giảm thật và bao nhiêu món ghi % giảm cao hơn thực tế.
        </div>
      </>
    ),
  },
  {
    slug: "cach-doc-danh-gia-san-pham",
    title: "Đọc đánh giá sản phẩm thế nào để không bị đánh giá ảo đánh lừa",
    description: "Dấu hiệu đánh giá được “bơm”, cách đọc theo từng khía cạnh (chất lượng, đóng gói, kích cỡ) và vì sao số sao trung bình thôi là chưa đủ.",
    published: "2026-10-27",
    updated: "2026-10-27",
    related: "deep",
    body: (
      <>
        <p>
          Số sao trung bình là con số dễ bị làm đẹp nhất trên trang sản phẩm. Để biết món hàng thật sự thế nào, cần đọc nội dung đánh giá – nhưng đọc có chọn lọc.
        </p>
        <h2>Dấu hiệu đánh giá được “bơm”</h2>
        <ul>
          <li>Rất nhiều đánh giá 5 sao ngắn, giống nhau, đăng dồn trong vài ngày.</li>
          <li>Điểm gần tuyệt đối nhưng số người mua còn ít.</li>
          <li>Nội dung khen chung chung (“shop nhiệt tình”, “giao nhanh”) mà không nói gì về món hàng.</li>
          <li>Ảnh đánh giá giống ảnh quảng cáo của shop.</li>
        </ul>
        <h2>Đọc theo khía cạnh</h2>
        <p>
          Thay vì hỏi “món này tốt không”, hãy hỏi cụ thể: chất lượng có đúng mô tả? Kích cỡ có chuẩn? Đóng gói có cẩn thận? Pin, âm thanh, mùi hương có như quảng
          cáo? Mục đánh giá trên Săn Deal gom các nhận xét theo từng khía cạnh như vậy, kèm số lượt khen và chê, để bạn thấy ngay điểm yếu thường gặp.
        </p>
        <h2>Đánh giá có ảnh, có thời gian dùng</h2>
        <p>
          Đánh giá kèm ảnh thật, hoặc được viết sau vài tuần sử dụng (“dùng được một tháng thì…”), đáng tin hơn đánh giá viết ngay lúc nhận hàng.
        </p>
        <h2>Đánh giá nói về phân loại nào?</h2>
        <p>
          Với quần áo, giày dép, mỹ phẩm, cùng một trang sản phẩm có thể có nhiều phân loại khác nhau. Một lời chê “size nhỏ” chỉ có ích khi bạn biết người đó mua
          size gì. Ưu tiên đánh giá có ghi rõ phân loại.
        </p>
        <div className="tip">
          Phần tóm tắt đánh giá trên Săn Deal được viết từ các đánh giá công khai trên trang sản phẩm của sàn. Khi có ghi “Tóm tắt bằng AI”, nội dung do AI
          viết và có thể chưa chính xác hoàn toàn – hãy đọc thêm vài đánh giá gốc.
        </div>
      </>
    ),
  },
  {
    slug: "mua-size-lon-combo-co-re-hon",
    title: "Mua size lớn, combo, mua nhiều có thật rẻ hơn? Cách tính giá theo đơn vị",
    description: "So giá theo ml, gam, viên hay chiếc thay vì giá mỗi sản phẩm – cách tính nhanh và những trường hợp mua combo lại đắt hơn mua lẻ.",
    published: "2026-11-03",
    updated: "2026-11-03",
    related: "deep",
    body: (
      <>
        <p>
          Chai 1 lít thường được hiểu là rẻ hơn hai chai 500 ml, combo 3 thường được hiểu là rẻ hơn mua 3 lần. Nhưng không phải lúc nào cũng vậy, nhất là khi
          bản nhỏ đang có khuyến mãi còn bản lớn thì không.
        </p>
        <h2>Cách tính</h2>
        <p>Chia giá cho số lượng, theo cùng một đơn vị:</p>
        <ul>
          <li>Nước giặt 3,8 kg giá 190.000 ₫ → 50.000 ₫/kg.</li>
          <li>Túi 2 kg giá 89.000 ₫ → 44.500 ₫/kg: túi nhỏ rẻ hơn.</li>
        </ul>
        <p>
          Săn Deal tự tính giá theo đơn vị (ml, gam, viên, miếng…) khi tên sản phẩm có ghi quy cách, và hiện ngay dưới giá. Nhờ vậy bạn so được hai món khác
          dung tích mà không cần bấm máy tính.
        </p>
        <h2>Khi nào combo đắt hơn mua lẻ</h2>
        <ul>
          <li>Bản lẻ đang được giảm giá hoặc có mã riêng, combo thì không.</li>
          <li>Combo kèm món bạn không dùng tới – phần đó là tiền bỏ đi.</li>
          <li>Hàng có hạn dùng ngắn (sữa, thực phẩm, mỹ phẩm đã mở nắp) mà bạn dùng không kịp.</li>
        </ul>
        <h2>Cẩn thận với quy cách ghi trong tên</h2>
        <p>
          Tên sản phẩm đôi khi ghi “combo 2” nhưng giá hiển thị chỉ là của 1 món, hoặc giá thấp nhất là của phân loại nhỏ nhất. Hãy chọn đúng phân loại trên trang
          sàn và xem lại giá trước khi so.
        </p>
        <div className="tip">
          Mua để dành trong đợt sale chỉ có lợi khi giá theo đơn vị thấp hơn mức bạn thường mua. Đặt báo giá ở mức đó để không phải canh.
        </div>
      </>
    ),
  },
  {
    slug: "flash-sale-co-that-re-khong",
    title: "Flash sale có thật rẻ không? Cách nhận biết flash sale đáng mua",
    description: "Flash sale tạo cảm giác phải mua ngay. Cách kiểm tra trong vài giây xem giá flash sale có thấp hơn ngày thường không, và vì sao không cần vội.",
    published: "2026-11-10",
    updated: "2026-11-10",
    related: "deep",
    body: (
      <>
        <p>
          Flash sale là khung giờ ngắn, số lượng giới hạn, kèm đồng hồ đếm ngược. Đồng hồ và thanh “sắp hết” tạo áp lực phải quyết ngay, nhưng chúng không cho
          biết giá đó có tốt hay không.
        </p>
        <h2>Ba câu hỏi trước khi bấm mua</h2>
        <ol>
          <li><b>Giá flash sale có thấp hơn giá thường ngày không?</b> So với giá món đó thường bán trong vài tuần qua, không phải giá gạch.</li>
          <li><b>Món này đã từng rẻ hơn chưa?</b> Nếu biểu đồ giá có đáy thấp hơn, bạn chẳng mất gì khi chờ.</li>
          <li><b>Có áp được mã không?</b> Một số khung giờ flash sale không cho dùng chung với mã giảm khác, giá cuối có khi cao hơn giá thường cộng mã.</li>
        </ol>
        <h2>Flash sale đáng mua trông thế nào</h2>
        <ul>
          <li>Giá thấp hơn giá thường ngày từ khoảng 10% trở lên.</li>
          <li>Bằng hoặc gần mức thấp nhất từng ghi nhận.</li>
          <li>Là món bạn đã định mua từ trước, không phải món vừa thấy.</li>
        </ul>
        <h2>Không kịp kiểm tra?</h2>
        <p>
          Chép link sản phẩm và dán vào <Link href="/kiem-tra-gia">Kiểm tra giá</Link> – mất khoảng mười giây, trên điện thoại hay máy tính đều được.
        </p>
        <div className="tip">
          Nếu lỡ khung giờ: đặt báo giá ở mức của flash sale. Nhiều món quay lại mức đó trong các đợt sau, và bạn sẽ nhận email khi điều đó xảy ra.
        </div>
      </>
    ),
  },
  {
    slug: "shop-mall-va-shop-thuong",
    title: "Shop Mall chính hãng và shop thường: khi nào đáng trả thêm tiền?",
    description: "Shop chính hãng thường đắt hơn một chút. Với món nào nên ưu tiên Mall, món nào mua shop thường vẫn ổn, và mức chênh bao nhiêu là hợp lý.",
    published: "2026-11-17",
    updated: "2026-11-17",
    related: "deep",
    body: (
      <>
        <p>
          Cùng một sản phẩm, shop chính hãng (Shopee Mall, LazMall, cửa hàng chính hãng trên TikTok Shop) thường bán cao hơn shop thường. Phần chênh đó là tiền bạn
          trả cho sự yên tâm về nguồn gốc và bảo hành. Câu hỏi là khi nào sự yên tâm đó đáng tiền.
        </p>
        <h2>Nên ưu tiên shop chính hãng</h2>
        <ul>
          <li><b>Mỹ phẩm, chăm sóc da, thực phẩm chức năng, đồ cho trẻ nhỏ</b> – hàng giả khó nhận ra và ảnh hưởng trực tiếp tới sức khoẻ.</li>
          <li><b>Đồ điện tử có bảo hành</b> – cần hoá đơn, tem bảo hành chính hãng.</li>
          <li><b>Món giá cao</b> – chênh vài phần trăm nhưng giảm đáng kể rủi ro mất trắng.</li>
        </ul>
        <h2>Shop thường vẫn ổn</h2>
        <ul>
          <li>Đồ gia dụng đơn giản, phụ kiện, văn phòng phẩm, quần áo không thương hiệu.</li>
          <li>Shop có điểm cao, nhiều lượt đánh giá, tỉ lệ 1–2 sao thấp.</li>
        </ul>
        <h2>Mức chênh bao nhiêu là bất thường</h2>
        <p>
          Shop thường rẻ hơn Mall khoảng 5–20% là phổ biến. Rẻ hơn gần một nửa thì cần cảnh giác. Săn Deal so giá với cùng sản phẩm ở shop chính hãng và hiện cảnh báo
          khi một shop thường rẻ bất thường.
        </p>
        <h2>Mall cũng có lúc rẻ hơn</h2>
        <p>
          Vào ngày đôi, shop chính hãng thường được sàn tài trợ thêm mã, nên có khi rẻ hơn cả shop thường. Mục “So sánh giá giữa các sàn” trên trang sản phẩm và bộ
          lọc shop Mall giúp bạn kiểm tra nhanh.
        </p>
      </>
    ),
  },
  {
    slug: "black-friday-co-re-hon-11-11",
    title: "Black Friday trên Shopee, Lazada, TikTok Shop có rẻ hơn 11.11 không?",
    description: "Black Friday đến chỉ hơn hai tuần sau 11.11. Cách so giá hai đợt cho đúng món bạn cần, và lúc nào nên mua ngay thay vì chờ.",
    published: "2026-11-24",
    updated: "2026-11-24",
    related: "sales",
    body: (
      <>
        <p>
          Ở Việt Nam, Black Friday (thứ Sáu cuối cùng của tháng 11) nằm giữa 11.11 và 12.12, ba đợt sale lớn trong khoảng một tháng. Không có quy luật chung kiểu
          “đợt sau luôn rẻ hơn”; mỗi món, mỗi shop chạy khuyến mãi khác nhau.
        </p>
        <h2>So bằng giá của chính món đó ở 11.11</h2>
        <p>
          Biểu đồ giá trên Săn Deal đánh dấu các đợt sale đã qua và giá thấp nhất ghi nhận trong từng đợt. Mở món bạn định mua và xem vạch 11.11: nếu giá hôm nay đã
          bằng hoặc thấp hơn, không có lý do để chờ thêm.
        </p>
        <h2>Ước tính giá đợt sale tới</h2>
        <p>
          Khi đợt sale lớn còn dưới ba tuần, trang sản phẩm hiện ước tính giá dịp đó, dựa trên mức giảm của chính món này ở các đợt trước, hoặc của các món cùng danh
          mục nếu món này chưa đủ dữ liệu. Đây là ước tính để tham khảo, không phải giá chắc chắn.
        </p>
        <h2>Lúc nào nên mua ngay</h2>
        <ul>
          <li>Giá đang ở mức thấp nhất từng ghi nhận.</li>
          <li>Bạn cần dùng ngay và mức chênh dự kiến chỉ vài phần trăm.</li>
          <li>Món hay hết hàng vào đợt sale (size phổ biến, màu hot).</li>
        </ul>
        <div className="tip">
          Không muốn canh cả ba đợt? Đặt báo giá ở mức mong muốn – Săn Deal kiểm tra giá nhiều lần mỗi ngày và chỉ gửi email khi giá về mức đó.
        </div>
      </>
    ),
  },
  {
    slug: "mua-qua-cuoi-nam-online",
    title: "Mua quà cuối năm và đồ Tết online: lên danh sách, theo dõi giá từ sớm",
    description: "Cuối năm nhiều thứ cần mua và giá dễ tăng sát Tết. Cách chia danh sách theo thời điểm, theo dõi giá từ tháng 12 và tránh cảnh hết hàng, giao trễ.",
    published: "2026-12-01",
    updated: "2026-12-01",
    related: "sales",
    body: (
      <>
        <p>
          Từ 12.12 tới Tết là giai đoạn mua sắm dày nhất năm: quà tặng, đồ trang trí, quần áo mới, đồ ăn Tết. Bắt đầu sớm giúp bạn có đủ thời gian so giá và tránh
          cảnh giao hàng chậm khi sát Tết.
        </p>
        <h2>Chia danh sách theo thời điểm</h2>
        <ul>
          <li><b>Mua sớm (dịp 12.12):</b> đồ điện tử, gia dụng, quà tặng giá trị – món không hỏng, có thời gian đổi trả.</li>
          <li><b>Mua giữa (đầu tháng 1):</b> quần áo, giày dép – còn kịp đổi size.</li>
          <li><b>Mua sát Tết:</b> đồ ăn, bánh kẹo có hạn dùng ngắn, hoa.</li>
        </ul>
        <h2>Theo dõi giá cả danh sách</h2>
        <p>
          Bấm ♡ để lưu từng món vào <Link href="/da-luu">Đã lưu</Link>, hoặc đặt báo giá ở mức bạn chấp nhận. Mỗi tuần nhìn lại danh sách một lần: món nào đã về
          giá tốt thì mua, món nào đang bị đẩy giá thì để sau.
        </p>
        <h2>Gửi quà cho người thân ở xa</h2>
        <p>
          Đặt hàng trực tiếp tới địa chỉ người nhận, nhớ kiểm tra thời gian giao dự kiến. Sát Tết, đơn vị vận chuyển thường quá tải nên nên đặt sớm vài ngày so với
          bình thường.
        </p>
        <h2>Chia sẻ danh sách quà</h2>
        <p>
          Muốn cả nhà cùng chọn? Trong trang Đã lưu, bấm “Tạo link chia sẻ” rồi gửi link cho mọi người – ai cũng xem được giá hiện tại của từng món. Gợi ý quà
          theo chủ đề có ở{" "}
          <Link href="/bo-suu-tap">Bộ sưu tập</Link>.
        </p>
      </>
    ),
  },
];
