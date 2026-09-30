# Báo giá qua Zalo OA

Người dùng liên kết Zalo trong **Sở thích & thông báo** (`/account/so-thich`) và nhận tin khi món theo dõi giảm giá, có hàng lại, hoặc sale bắt đầu. Email và thông báo đẩy vẫn gửi như cũ; Zalo là kênh thêm.

## Giới hạn của Zalo (cần biết trước)

- Web gửi **tin tư vấn** qua Open API. Zalo chỉ cho gửi loại tin này tới người **đã tương tác với OA trong 7 ngày gần nhất**. Quá 7 ngày, web tự bỏ qua Zalo, người dùng vẫn nhận email.
- Phí: miễn phí 8 tin trong 48 giờ sau mỗi lần người dùng tương tác, ngoài ra tính phí theo bảng giá của Zalo (thời điểm viết: 55đ/tin). Kiểm tra lại chính sách hiện hành: https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099
- Để giữ kênh mở, tin gửi đi khi còn ≤ 3 ngày sẽ nhắc người dùng trả lời "ok". Mọi tin nhắn/tương tác của người dùng với OA đều gia hạn thêm 7 ngày.
- Muốn gửi không giới hạn thời gian thì cần **tin Giao dịch / ZBS Template** (trả phí, đăng ký mẫu với Zalo) – chưa làm.

## Cài đặt

1. **Tạo Zalo OA** tại https://oa.zalo.me (tên "Săn Deal"), chờ duyệt. Ghi lại **OA ID** (số trong link `zalo.me/<ID>`).
2. **Tạo ứng dụng** tại https://developers.zalo.me → Thêm ứng dụng. Ghi lại **App ID** và **Khóa bí mật (App Secret)**.
3. Trong ứng dụng: **Official Account → Liên kết OA** với OA ở bước 1, cấp các quyền gửi tin và quản lý tin nhắn.
4. **Xác thực tên miền**: mục *Xác thực domain* đưa một thẻ meta `zalo-platform-site-verification`. Chép phần `content` vào `ZALO_VERIFY_META`, khởi động lại web rồi bấm xác thực.
5. **Webhook**: URL `https://<tên-miền>/api/zalo/webhook`; bật các sự kiện *Người dùng gửi tin nhắn văn bản*, *Người dùng quan tâm/bỏ quan tâm OA*. Chép **OA Secret Key** vào `ZALO_WEBHOOK_SECRET`.
6. **Lấy refresh token lần đầu**: dùng công cụ *API Explorer* của Zalo (chọn ứng dụng + OA, loại "OA Access Token") hoặc luồng OAuth v4 của OA. Chép **refresh token** vào `ZALO_REFRESH_TOKEN`. Refresh token có hạn 3 tháng và chỉ dùng được 1 lần; web tự làm mới và lưu cặp token mới vào bảng `kv_store`. Nếu web ngừng gửi được (log `[zalo] Làm mới token lỗi`), lấy refresh token mới và điền lại.
7. Điền `.env` rồi `sudo systemctl restart sandeal`:
   ```env
   ZALO_APP_ID="..."
   ZALO_APP_SECRET="..."
   ZALO_OA_ID="..."
   ZALO_REFRESH_TOKEN="..."
   ZALO_WEBHOOK_SECRET="..."
   ZALO_VERIFY_META="..."
   ```
8. Thử: vào `/account/so-thich` → **Kết nối Zalo** → mở Zalo, Quan tâm OA, gửi mã 6 ký tự. OA trả lời "Đã kết nối Săn Deal ✅" là xong.
