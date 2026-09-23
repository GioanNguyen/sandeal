# Săn Deal – MVP

Web tổng hợp deal tốt, mã giảm giá và khuyến mãi từ Shopee, Lazada, TikTok Shop qua **API affiliate chính thức** (không cào trang).

## Chạy thử (dữ liệu mẫu, không cần API key)

Yêu cầu: Node.js 20+.

```bash
npm install
cp .env.example .env        # đã để SOURCES="mock"
npx prisma db push          # tạo database SQLite
npm run seed                # 30 ngày lịch sử giá giả
npm run dev                 # mở http://localhost:3000
```

Chạy test điểm deal: `npm test`

## Cấu trúc

```
prisma/schema.prisma        Product, PricePoint, Voucher, Campaign, Watch
src/adapters/               Mỗi nguồn dữ liệu một adapter
  mock.ts                   Dữ liệu mẫu
  shopee.ts                 Shopee Affiliate Open API (GraphQL, ký SHA256)
  accesstrade.ts            Mã giảm giá Shopee/Lazada/TikTok qua AccessTrade
src/lib/score.ts            Công thức điểm deal (giảm thật so với trung vị 30 ngày, phạt nâng giá ảo)
src/worker/                 sync.ts (đồng bộ 1 lần), index.ts (chạy theo lịch), notify.ts (email cảnh báo)
src/app/                    Trang deal, /vouchers, /product/[id], API /api/watch
```

## Dùng dữ liệu thật

1. Đăng ký [Shopee Affiliate](https://affiliate.shopee.vn/), xin quyền Open API → điền `SHOPEE_APP_ID`, `SHOPEE_SECRET`, `SHOPEE_KEYWORDS`.
   Kiểm tra lại tên tham số/trường trong [API Explorer](https://open-api.affiliate.shopee.vn/explorer/v2) (ví dụ giá trị `sortType`).
2. Đăng ký publisher [AccessTrade](https://developers.accesstrade.vn/api-publisher-vietnamese) → điền `ACCESSTRADE_TOKEN`.
3. Đổi `SOURCES="shopee,accesstrade"`, chạy `npm run sync` để thử, rồi `npm run worker` để chạy theo lịch `SYNC_CRON`.

Thêm sàn mới (Lazada, TikTok Shop): tạo file trong `src/adapters/` theo interface `SourceAdapter` và đăng ký trong `src/adapters/index.ts`.

## Triển khai production

- Đổi `provider` trong `prisma/schema.prisma` sang `postgresql`, `DATABASE_URL` sang chuỗi kết nối Postgres.
- Chạy 2 tiến trình: `npm run build && npm start` (web) và `npm run worker` (đồng bộ + gửi email).
- Điền `SMTP_URL` (ví dụ `smtps://user:pass@smtp.example.com:465`) để gửi email cảnh báo giá.

## Việc tiếp theo

- Đăng nhập (Auth.js) để quản lý danh sách theo dõi; hiện theo dõi bằng email, chưa xác minh email.
- Adapter Lazada, TikTok Shop; thông báo Telegram/Zalo OA; trang danh mục cho SEO.
