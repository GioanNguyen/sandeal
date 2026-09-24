# Săn Deal

Web tổng hợp deal giảm thật, mã giảm giá và khuyến mãi từ Shopee, Lazada, TikTok Shop qua **API affiliate chính thức** (không cào trang).

## Chạy trên máy (không cần cài database)

Yêu cầu: Node.js 20+.

```bash
npm install
cp .env.example .env     # SOURCES="mock" để chạy bằng dữ liệu mẫu
npm run seed             # 30 ngày lịch sử giá + đơn hàng mẫu
npm run dev              # http://localhost:3000
```

- Database khi dev là **PGlite** (Postgres nhúng, lưu ở `.data/pglite`). Chỉ một tiến trình mở được, nên hãy **tắt `npm run dev` trước khi chạy `npm run seed` / `npm run sync`**. Khi web đang chạy, lịch đồng bộ tự chạy bên trong web; admin có nút “Đồng bộ ngay”.
- Nếu `npm run dev` tự tắt ngay sau khi khởi động và terminal báo *“Không mở được cơ sở dữ liệu PGlite”* (hoặc `RuntimeError: Aborted()`), dữ liệu dev đã hỏng: chạy `npm run db:reset` (cất thư mục cũ sang `.data/pglite-hong-*` và tạo lại dữ liệu mẫu) rồi `npm run dev`. Các lệnh seed/sync giờ tự từ chối chạy khi dev đang mở DB để tránh hỏng dữ liệu.
- Chưa cấu hình SMTP thì email (link đăng nhập, báo giá) được **in ra terminal**, bấm link ở đó để đăng nhập.
- Vào trang thống kê: đặt `ADMIN_EMAILS="email-cua-ban"` trong `.env`, đăng nhập bằng email đó rồi mở `/admin`.

Kiểm thử: `npm test` (chạy trên Postgres trong RAM) · `npm run typecheck`

## Tính năng

| Tính năng | Ghi chú |
| --- | --- |
| Deal hot, lọc/sắp xếp, danh mục `/danh-muc/[slug]` | Điểm deal so với trung vị giá 30 ngày (có trọng số thời gian), phạt nâng giá ảo |
| Mã giảm giá `/vouchers` | Chỉ mã còn hạn, bấm để chép |
| Chi tiết sản phẩm | Biểu đồ 90 ngày, kết luận nên mua, deal cùng danh mục, JSON-LD Product |
| Đăng nhập bằng link email | Không mật khẩu; link dùng 1 lần, hết hạn sau 30 phút |
| Theo dõi giá | Xác minh email trước khi gửi; `/account` sửa/xoá; link huỷ trong email |
| Chống spam | Giới hạn tần suất theo IP và email, ô bẫy bot |
| Link `/go/[id]` | Ghi lượt bấm rồi chuyển sang link affiliate |
| Thống kê `/admin` | Lượt bấm, đơn, doanh số, hoa hồng theo ngày/sàn; nút đồng bộ |
| Telegram | Tự đăng deal hot lên kênh (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |
| SEO | `sitemap.xml`, `robots.txt`, title/description/OG từng trang |

## Nguồn dữ liệu

Bật trong `SOURCES` (vd `"shopee,lazada,tiktok,accesstrade"`) và điền key tương ứng trong `.env`.

| Nguồn | Adapter | Lấy gì |
| --- | --- | --- |
| Shopee Affiliate Open API | `src/adapters/shopee.ts` | Sản phẩm (`productOfferV2`), báo cáo đơn (`conversionReport`) |
| Lazada Open Platform – Affiliate | `src/adapters/lazada.ts` | Feed sản phẩm có link affiliate |
| TikTok Shop – Affiliate Creator | `src/adapters/tiktok.ts` | Sản phẩm open collaboration |
| AccessTrade | `src/adapters/accesstrade.ts` | Mã giảm giá của cả 3 sàn |

**Lưu ý:** chữ ký request đã có test, nhưng tên endpoint/trường của Lazada và TikTok Shop cần đối chiếu lại tài liệu sau khi app được duyệt (đường dẫn chỉnh được qua `LAZADA_FEED_PATH`, `TIKTOK_SEARCH_PATH`). Thêm nguồn mới: tạo adapter theo `SourceAdapter` trong `src/adapters/types.ts` và đăng ký ở `src/adapters/index.ts`.

## Triển khai lên VPS (Docker)

1. Trỏ DNS tên miền về IP VPS, cài Docker.
2. `cp .env.example .env` rồi điền `DOMAIN`, `POSTGRES_PASSWORD`, `AUTH_SECRET` (`openssl rand -base64 32`), `SITE_URL=https://ten-mien`, `SMTP_URL`, `ADMIN_EMAILS`, key các sàn, `SOURCES`.
3. `docker compose up -d --build`

Compose chạy: `db` (Postgres 16), `migrate` (tạo bảng), `web` (Next.js), `worker` (đồng bộ theo `SYNC_CRON`), `caddy` (HTTPS tự động).

## Cấu trúc

```
src/db/schema.ts        Bảng: products, price_points, vouchers, users, sessions, login_tokens, watches, clicks, conversions, rate_limits
drizzle/                Migration SQL (tạo mới: sửa schema rồi `npm run db:generate`)
src/lib/                db, auth, mail, queries, score, ratelimit
src/adapters/           Nguồn dữ liệu
src/worker/             sync, notify (email), telegram, conversions, scheduler
src/app/                Trang & API
```

### SEO (nhóm 10)
- Đường dẫn sản phẩm dạng `/product/ten-san-pham-12`. Link cũ `/product/12` tự chuyển 301 sang link mới (middleware → `/api/p/12`).
- Trang tổng hợp tự động `/top` và `/top/<slug>` (theo loại sản phẩm, danh mục, tầm giá) – chỉ gồm món đang giảm thật, có dữ liệu có cấu trúc ItemList + FAQ, nằm trong `sitemap.xml`.
- Nhớ đặt `SITE_URL` là tên miền thật khi triển khai để thẻ canonical và sitemap đúng.
