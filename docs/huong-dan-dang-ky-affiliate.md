# Hướng dẫn đăng ký tài khoản affiliate & lấy API key

Cập nhật: 23/09/2026 · Dùng cho dự án Săn Deal

Web lấy dữ liệu từ 2 nguồn chính. Nên đăng ký **cả hai song song**, vì AccessTrade thường duyệt nhanh hơn Shopee.

| Nguồn | Lấy được gì | Biến trong `.env` |
| --- | --- | --- |
| Shopee Affiliate | Sản phẩm, giá, % giảm, link affiliate, báo cáo đơn & hoa hồng Shopee | `SHOPEE_APP_ID`, `SHOPEE_SECRET` |
| AccessTrade | Mã giảm giá & khuyến mãi của Shopee, Lazada, TikTok Shop; link affiliate; báo cáo đơn | `ACCESSTRADE_TOKEN` |

---

## Phần 1 · Shopee Affiliate (Tiếp thị liên kết)

> **Đúng loại tài khoản:** đăng ký **Shopee Tiếp thị liên kết (Shopee Affiliate)**.
> **Không** dùng tài khoản Người bán hay Shopee Open Platform: hai loại đó dành cho chủ shop quản lý đơn và sản phẩm của mình, không lấy được deal toàn sàn và không có hoa hồng.

### 1.1 Chuẩn bị

- [ ] Tài khoản Shopee đã xác minh số điện thoại và email
- [ ] Ít nhất một kênh **công khai, có nội dung**: website (tên miền của Săn Deal), Facebook, TikTok hoặc YouTube. Kênh để riêng tư là lý do bị từ chối hay gặp nhất.
- [ ] CCCD, mã số thuế cá nhân, tài khoản ngân hàng chính chủ

### 1.2 Đăng ký

1. Vào https://affiliate.shopee.vn, hoặc trong app Shopee chọn **Tôi → Shopee Tiếp thị liên kết**.
2. Điền thông tin, khai báo kênh (ghi tên miền website nếu đã có), chọn ngành hàng quan tâm.
3. Chờ duyệt, thường **1–3 ngày làm việc**.
4. Sau khi được duyệt, điền **thông tin thuế và ngân hàng**. Shopee chỉ trả hoa hồng khi đã xác minh danh tính và mã số thuế.

**Cá nhân hay doanh nghiệp?** Mới bắt đầu thì đăng ký cá nhân là đủ. Khi hoa hồng đã đều và lớn, chuyển sang hộ kinh doanh hoặc công ty sẽ thuận tiện hơn cho việc xuất hoá đơn và khai thuế. Nên hỏi thêm kế toán.

### 1.3 Lấy AppID & Secret (Open API)

1. Đăng nhập https://affiliate.shopee.vn → mục **Open API**.
2. Tạo hoặc xem **AppID** và **Secret**.
3. Nếu chưa thấy mục Open API, có thể tài khoản cần được Shopee duyệt riêng. Liên hệ hỗ trợ affiliate, nói rõ: *"Tôi làm website so sánh giá / săn deal, cần Open API để lấy danh sách sản phẩm (productOfferV2), tạo link (generateShortLink) và xem báo cáo đơn (conversionReport)."*
4. Thử key trên API Explorer: https://open-api.affiliate.shopee.vn/explorer/v2

### 1.4 Cấu hình trong dự án

```env
SOURCES="shopee"            # thêm ,accesstrade khi có key AccessTrade
SHOPEE_APP_ID="..."
SHOPEE_SECRET="..."
SHOPEE_KEYWORDS="tai nghe,sữa rửa mặt,nồi chiên không dầu,balo"
```

Kiểm tra: tắt `npm run dev` rồi chạy `npm run sync`. Terminal hiện `[sync] shopee: N sản phẩm` là thành công.

### 1.5 Quy định cần tránh (dễ bị khoá tài khoản)

- Không dùng thương hiệu hoặc logo Shopee khiến người xem tưởng web là của Shopee
- Không chạy quảng cáo theo **từ khoá thương hiệu** Shopee (Google Ads "shopee", "mã giảm giá shopee"...)
- Không nhồi cookie (tự mở link affiliate ngầm, iframe ẩn...)
- Không tự mua qua link của chính mình để lấy hoa hồng

Chi tiết: [Điều khoản chương trình tiếp thị liên kết Shopee](https://banhang.shopee.vn/edu/article/18561)

---

## Phần 2 · AccessTrade (mạng affiliate)

AccessTrade là mạng affiliate lớn ở Việt Nam, gom nhiều chiến dịch (Shopee, Lazada, TikTok Shop, Tiki...) vào một tài khoản. Web dùng AccessTrade để lấy **mã giảm giá và khuyến mãi của cả 3 sàn**.

### 2.1 Đăng ký tài khoản Publisher

1. Đăng ký tại https://workspace.accesstrade.vn/authentication/register (chọn vai trò **Publisher**).
2. Mở email **"Register Confirmation"** và bấm link để kích hoạt tài khoản.
3. Chọn nền tảng **Pub2** (đa ngành, gồm thương mại điện tử), không chọn D2C Workspace hay KOC.asia.
4. Hoàn thiện hồ sơ: khai báo **website / kênh quảng bá** (tên miền Săn Deal), thông tin cá nhân, **tài khoản ngân hàng và mã số thuế** để nhận tiền.

Hướng dẫn gốc: [Các bước gia nhập AccessTrade](https://help.accesstrade.vn/faq/cac-buoc-gia-nhap-he-thong-accesstrade-nguoi-moi-nen-bat-dau-tu-dau/) · [Câu hỏi thường gặp cho publisher](https://help.accesstrade.vn/faq-publisher/)

### 2.2 Đăng ký chiến dịch

Trong trang quản lý, vào danh sách **Chiến dịch** và bấm đăng ký tham gia:

- [ ] Shopee
- [ ] Lazada
- [ ] TikTok Shop

Mỗi chiến dịch có thể phải chờ duyệt riêng. Chỉ chiến dịch đã được duyệt mới có link affiliate và tính hoa hồng. Khai báo kênh giống lúc đăng ký (website Săn Deal).

### 2.3 Lấy API Access Key

1. Đăng nhập trang publisher → menu **Hỗ trợ (Help) → APIs**.
2. Sao chép **API Access Key**. Mỗi tài khoản có một key riêng, **không chia sẻ công khai**.
3. Mọi request gửi kèm header: `Authorization: Token <API_ACCESS_KEY>`

Tài liệu: [Hướng dẫn sử dụng API AccessTrade](https://help.accesstrade.vn/knowledgebase/huong-dan-su-dung-api-cua-accesstrade-viet-nam/) · [API cho Publisher (tiếng Việt)](https://developers.accesstrade.vn/api-publisher-vietnamese)

### 2.4 Các API hữu ích

| API | Dùng để | Trạng thái trong dự án |
| --- | --- | --- |
| `GET /v1/offers_informations/coupon` | Mã giảm giá, khuyến mãi theo sàn (`merchant=shopee`...) | **Đã tích hợp** (`src/adapters/accesstrade.ts`) |
| `GET /v1/offers_informations/coupon_hot` | Khuyến mãi nổi bật tuần/tháng | Chưa dùng |
| `GET /v1/transactions` | Đơn hàng & hoa hồng (`since`, `until` dạng ISO; giới hạn **10 request/phút**) | Chưa tích hợp: đưa vào trang Thống kê khi cần |
| Tạo tracking link, datafeeds, top sản phẩm | Link affiliate cho URL bất kỳ, feed sản phẩm | Chưa dùng |

Base URL: `https://api.accesstrade.vn`

### 2.5 Cấu hình trong dự án

```env
SOURCES="shopee,accesstrade"
ACCESSTRADE_TOKEN="..."                          # API Access Key
ACCESSTRADE_MERCHANTS="shopee,lazada,tiktokshop" # tên merchant theo AccessTrade
```

Kiểm tra: tắt `npm run dev` rồi chạy `npm run sync`. Terminal hiện `[sync] accesstrade: 0 sản phẩm, N voucher` là thành công. Nếu một merchant trả về 0 mã, xem tên merchant chính xác bằng API `GET /v1/offers_informations/merchant_list` rồi sửa `ACCESSTRADE_MERCHANTS`.

Nếu nhận được hoa hồng Shopee qua **cả** Shopee Affiliate và AccessTrade, hãy dùng một đường link thống nhất cho mỗi sản phẩm để không bị tính trùng hoặc mất hoa hồng. Hiện tại: sản phẩm dùng link Shopee Affiliate, mã giảm giá dùng link AccessTrade.

---

## Phần 3 · Checklist trước khi chạy thật

- [ ] Shopee Affiliate được duyệt, đã khai thuế và ngân hàng
- [ ] Có AppID và Secret của Shopee Open API, đã thử trên API Explorer
- [ ] AccessTrade: tài khoản kích hoạt, chiến dịch Shopee, Lazada, TikTok Shop đã được duyệt
- [ ] Có API Access Key của AccessTrade
- [ ] Đã điền `.env` và đổi `SOURCES` (bỏ `mock`)
- [ ] `npm run sync` chạy không lỗi
- [ ] Web có trang/dòng công bố "có sử dụng link tiếp thị liên kết" (đã có ở chân trang)
- [ ] Khi đưa lên VPS: điền cùng các biến này vào `.env` trên server (xem `README.md`, phần Triển khai)

## Phụ lục · Lazada & TikTok Shop (làm sau)

- **Lazada:** đăng ký Lazada Affiliate, tạo app trên https://open.lazada.com rồi điền `LAZADA_APP_KEY`, `LAZADA_APP_SECRET`, `LAZADA_USER_TOKEN`. Cần đối chiếu lại endpoint feed sản phẩm (`LAZADA_FEED_PATH`) theo tài liệu sau khi được duyệt.
- **TikTok Shop:** cần tài khoản creator hoặc TikTok Shop Partner được cấp quyền Affiliate API tại https://partner.tiktokshop.com, sau đó điền `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_ACCESS_TOKEN`. Cần kiểm tra API có hỗ trợ thị trường Việt Nam.
- Trong lúc chờ: mã giảm giá Lazada và TikTok Shop đã có qua AccessTrade.
