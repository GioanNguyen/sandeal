# Hướng dẫn: ảnh chia sẻ & tự đăng deal lên mạng xã hội

Cập nhật: 23/09/2026

## 1. Ảnh xem trước khi chia sẻ link (tự động)

Mỗi trang sản phẩm, bộ sưu tập và trang chủ đều có ảnh xem trước 1200×630 được tạo tự động (ảnh sản phẩm, giá, giá niêm yết, "Rẻ hơn giá thường ngày", biểu đồ giá). Khi dán link lên Facebook, Zalo, Messenger, Telegram, ứng dụng sẽ tự hiện ảnh này.

- Xem thử ảnh: mở `https://ten-mien/product/123/opengraph-image`.
- Ảnh chỉ hiện khi web đã chạy trên tên miền công khai và `SITE_URL` trong `.env` là tên miền đó (không phải localhost).
- Facebook lưu đệm ảnh cũ: dùng [Công cụ gỡ lỗi chia sẻ](https://developers.facebook.com/tools/debug/) → dán link → "Scrape Again".
- Font dùng trong ảnh: Be Vietnam Pro (giấy phép OFL, file trong `src/assets/fonts/`).

Trên trang sản phẩm có nút **Gửi cho bạn bè** (điện thoại: mở menu chia sẻ của máy, có Zalo/Messenger), **Facebook** và **Chép link**. Link chia sẻ gắn `utm_source=share` để đo lượt vào.

## 2. Tự đăng vào giờ vàng

Worker đăng deal tốt nhất lúc **11h và 20h** (giờ VN) lên các kênh đã kết nối. Mỗi lượt mỗi kênh đăng `SOCIAL_PER_RUN` bài (mặc định 3), mỗi danh mục 1 bài, không đăng lại cùng sản phẩm trong 7 ngày. Điều kiện chọn: điểm deal ≥ `SOCIAL_MIN_SCORE` (mặc định 50), giảm thật ≥ 10%, giá cập nhật trong 24 giờ.

```env
SOCIAL_HOURS="11,20"
SOCIAL_PER_RUN="3"
SOCIAL_MIN_SCORE="50"
```

### Telegram (kênh)
1. Tạo bot bằng @BotFather, lấy token → `TELEGRAM_BOT_TOKEN`.
2. Tạo kênh công khai, thêm bot làm quản trị viên → `TELEGRAM_CHAT_ID="@ten_kenh"`.

### Trang Facebook
Cần một **Trang** (Page), không đăng được lên trang cá nhân hay nhóm qua API.
1. Vào [Meta for Developers](https://developers.facebook.com/) → tạo ứng dụng (loại Business).
2. Trong Graph API Explorer, chọn ứng dụng và Trang của bạn, cấp quyền `pages_manage_posts`, `pages_read_engagement`, **`pages_manage_engagement`** (để web tự đăng bình luận đầu chứa link), lấy **Page Access Token**.
3. Đổi sang token dài hạn (Access Token Debugger → Extend Access Token), điền `FB_PAGE_TOKEN`; ID của Trang điền `FB_PAGE_ID`.
4. Mặc định mỗi lượt đăng **1 bài ảnh tổng hợp** `SOCIAL_PER_RUN` deal: ảnh giá do Săn Deal tạo + thân bài **không có link** (đánh số từng món), rồi web **tự đăng bình luận đầu** chứa link đánh số tương ứng. Muốn mỗi deal 1 bài riêng: `FB_POST_STYLE="single"` (mỗi bài dùng 1 trong 10 mẫu, xem mục 3).
5. Muốn quay lại kiểu cũ (link nằm trong bài, Facebook tạo khung xem trước link): `FB_LINK_IN_COMMENT="0"`. Nếu token thiếu quyền `pages_manage_engagement`, bài vẫn được đăng nhưng lịch sử báo lỗi "không đăng được bình luận đầu" – khi đó bình luận tay.

> Quy trình cấp quyền của Meta có thể thay đổi và ứng dụng có thể cần xét duyệt trước khi dùng thật. Kiểm tra lại tài liệu Meta khi thiết lập.

### Zalo, TikTok, nhóm Facebook (đăng tay)
Các kênh này không có API đăng bài phù hợp cho web nhỏ (Zalo OA cần tài khoản doanh nghiệp đã xác thực; TikTok chỉ nhận video). Vào **/admin/dang-bai**:
- Mỗi bài có sẵn ảnh (bấm **Tải ảnh**), **thân bài** và **bình luận đầu** tách riêng, mỗi phần có nút chép. Đăng thân bài + ảnh trước, rồi dán bình luận đầu ngay dưới bài.
- Đăng xong bấm **Đã đăng Zalo / TikTok / nhóm FB** để ghi lịch sử và tránh đăng lặp.
- Link trong nội dung có `utm_source` theo kênh để đo hiệu quả trên trang Thống kê.

## 3. Nội dung bài đăng: 10 mẫu
Bài Facebook = **thân bài không link** + **bình luận đầu** (link trang Săn Deal có utm, mã giảm nếu có, giờ lấy giá, dòng "Link tiếp thị liên kết, giá bạn trả không đổi"). Mẫu chỉ hiện khi món có đủ số liệu thật, không bịa số. Sửa mẫu trong `src/lib/fbposts.ts`.

| Mẫu | Khi nào có | Móc câu |
| --- | --- | --- |
| 1. Giảm thật hay ảo? | Có giá gạch ≥10% và ≥7 ngày lịch sử | "Shop ghi −49%, Săn Deal kiểm tra: …" |
| 2. Mua ngay hay chờ sale? | Có dự kiến giá đợt sale ≤21 ngày tới | "Có nên chờ 11.11? Dự kiến rẻ thêm ~30K" |
| 3. Giá theo đơn vị | Đọc được số lượng trong tên | "82K cho 10 đôi = 8.200đ/đôi", so món cùng loại |
| 4. Đoán giá | ≥7 ngày lịch sử, từng rẻ hơn hiện tại | Câu đố A/B/C, đáp án ở bình luận đầu |
| 5. Giá thấp kỷ lục | Thấp nhất từ khi theo dõi (≥14 ngày) | "GIÁ THẤP NHẤT 30 NGÀY" |
| 6. So giá các sàn | Cùng món có ở ≥2 sàn | "Shopee rẻ hơn Lazada 17K" |
| 7. Giá sau mã | Có mã toàn sàn áp được | Mã để ở bình luận đầu |
| 8. Vừa giảm hôm nay | Giảm ≥5% trong 24 giờ | "VỪA GIẢM 18K lúc 10:07" |
| 9. Tổng hợp theo ngân sách | ≥3 món đang giảm dưới 100K / 200K | Danh sách đánh số, link đánh số ở bình luận |
| 10. Ai nâng giá trước sale? | Trang /nang-gia đủ ≥10 món | "35% món tăng giá trước 11.11" |

Gợi ý: xoay vòng các dạng (không đăng 1 dạng liên tục), 2–4 bài/ngày quanh khung giờ flash sale; mẫu 4 (đoán giá) và 10 (nâng giá) thường có nhiều bình luận/chia sẻ nhất.
