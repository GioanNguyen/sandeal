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
2. Trong Graph API Explorer, chọn ứng dụng và Trang của bạn, cấp quyền `pages_manage_posts`, `pages_read_engagement`, lấy **Page Access Token**.
3. Đổi sang token dài hạn (Access Token Debugger → Extend Access Token), điền `FB_PAGE_TOKEN`; ID của Trang điền `FB_PAGE_ID`.
4. Bài đăng gồm nội dung + link sản phẩm; Facebook tự lấy ảnh xem trước từ link.

> Quy trình cấp quyền của Meta có thể thay đổi và ứng dụng có thể cần xét duyệt trước khi dùng thật. Kiểm tra lại tài liệu Meta khi thiết lập.

### Zalo, TikTok, nhóm Facebook (đăng tay)
Các kênh này không có API đăng bài phù hợp cho web nhỏ (Zalo OA cần tài khoản doanh nghiệp đã xác thực; TikTok chỉ nhận video). Vào **/admin/dang-bai**:
- Mỗi deal gợi ý có sẵn ảnh chia sẻ (bấm **Tải ảnh**) và nội dung (bấm **Chép nội dung**, sửa được trước khi chép).
- Đăng xong bấm **Đã đăng Zalo / TikTok / nhóm FB** để ghi lịch sử và tránh đăng lặp.
- Link trong nội dung có `utm_source` theo kênh để đo hiệu quả trên trang Thống kê.

## 3. Nội dung bài đăng
Tạo tự động từ số liệu thật (mức giảm so với giá thường ngày, giá, sàn), luôn kèm câu "Giá có thể thay đổi, kiểm tra lại trên sàn trước khi thanh toán" và hashtag. Mẫu câu mở đầu xoay vòng để các bài không giống hệt nhau. Sửa mẫu trong `src/lib/social.ts`.
