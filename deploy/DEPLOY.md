# Đưa Săn Deal lên VPS (sandealgiare.com)

## Vì sao không chép vào public_html?

`public_html` dùng để phục vụ file tĩnh hoặc PHP. Săn Deal là ứng dụng Node.js (Next.js): nó phải chạy liên tục như một chương trình để render trang, gọi cơ sở dữ liệu, gửi email và chạy lịch đồng bộ giá.

Vì vậy cách làm như sau:

```
Trình duyệt ──https──> nginx/Apache (cổng 80/443, đã có sẵn)
                           │  reverse proxy
                           ▼
                 Node: Săn Deal (127.0.0.1:3000, dịch vụ systemd "sandeal")
                           │
                           ▼
                 PostgreSQL (127.0.0.1:5432)      MySQL cũ vẫn chạy, không bị đụng tới
```

- Mã chạy nằm ở `/opt/sandeal`.
- `public_html` giữ nguyên nhưng tên miền sẽ không trỏ vào đó nữa.
- Cấu hình web cũ được sao lưu trước khi thay.

## Cài lần đầu

Cần: VPS Linux x86_64 (Ubuntu 20.04+, Debian 11+, AlmaLinux/Rocky 8+), quyền root/sudo, tên miền đã trỏ về IP VPS, và cổng 80, 443 đang mở.

**Bước 1.** Chép gói lên VPS. Chạy lệnh này trên máy của bạn, trong thư mục chứa file:

```bash
scp sandeal-release.tar.xz root@IP_VPS:/root/
```

(Hoặc tải lên bằng WinSCP/FileZilla qua SFTP.)

**Bước 2.** SSH vào VPS rồi chạy:

```bash
cd /root
tar -xJf sandeal-release.tar.xz
cd sandeal
sudo EMAIL=email_cua_ban@gmail.com bash install.sh
```

Script tự làm 6 bước, mất khoảng 3–5 phút:

1. Cài Node.js 22 (nếu chưa có hoặc bản cũ hơn 20).
2. Cài PostgreSQL, tạo database `sandeal` với mật khẩu ngẫu nhiên. MySQL không bị thay đổi.
3. Tạo user hệ thống `sandeal` và file cấu hình `/opt/sandeal/.env`:
   - Sinh sẵn `AUTH_SECRET` và khoá Web Push.
   - Chọn cổng trống, bắt đầu từ 3000.
4. Chép mã vào `/opt/sandeal/releases/…` và trỏ `/opt/sandeal/current` tới đó.
5. Tạo dịch vụ `sandeal`, tự chạy khi khởi động máy và tự bật lại nếu bị tắt, rồi kiểm tra app trả lời được.
6. Nhận diện nginx hay Apache đang giữ cổng 80, rồi:
   - Sao lưu và tắt cấu hình cũ của sandealgiare.com (cấu hình đang trỏ vào public_html) → lưu tại `/opt/sandeal/backup-web-*`.
   - Tạo cấu hình reverse proxy mới. Nếu kiểm tra (`nginx -t` / `apachectl configtest`) lỗi thì tự khôi phục cấu hình cũ.
   - Xin chứng chỉ SSL Let's Encrypt (tự gia hạn) và chuyển http sang https.

Nếu một file cấu hình cũ phục vụ **cả tên miền khác**, script sẽ dừng lại chứ không tự sửa, để không làm hỏng site khác. Khi đó bạn xoá block `server`/`VirtualHost` của sandealgiare.com trong file đó, rồi chạy `sudo bash install.sh --web`.

**Bước 3.** Mở https://sandealgiare.com. Đăng nhập bằng email quản trị để vào `/admin`.

## Việc cần làm ngay sau khi cài

Sửa file `/opt/sandeal/.env` (`sudo nano /opt/sandeal/.env`), sau đó chạy `sudo systemctl restart sandeal`.

| Biến | Việc cần làm |
|---|---|
| `SOURCES` | Mặc định là `mock`, tức **dữ liệu mẫu**. Trước khi quảng bá, điền khoá affiliate (Shopee/Lazada/TikTok/AccessTrade) và đổi thành vd `shopee,lazada,accesstrade` |
| `SMTP_URL` | Cần để gửi link đăng nhập, cảnh báo giá, mail cuối tuần. Gmail: `smtps://ban%40gmail.com:MAT_KHAU_UNG_DUNG@smtp.gmail.com:465` (dùng App Password) |
| `MAIL_FROM` | Địa chỉ gửi đi |
| `ADMIN_EMAILS` | Các email được vào /admin, cách nhau dấu phẩy |
| `TELEGRAM_*` | Tuỳ chọn: bot Telegram |

Khi chưa có SMTP, link đăng nhập được ghi vào log. Xem bằng `sudo journalctl -u sandeal -n 50`.

Danh sách đầy đủ các biến nằm trong `env.example`, đi kèm gói.

## Cập nhật bản mới

1. Build gói trên máy dev: `bash deploy/make-release.sh` → `dist/sandeal-release.tar.xz`.
2. Chép lên VPS, giải nén và chạy lại:

```bash
cd /root && rm -rf sandeal && tar -xJf sandeal-release.tar.xz && cd sandeal
sudo bash install.sh
```

- `.env`, database và cấu hình web được giữ nguyên. Database tự migrate khi app khởi động.
- Nếu bản mới không chạy, script tự quay về bản trước.
- Script giữ 3 bản gần nhất trong `/opt/sandeal/releases`.

Quay về bản trước bằng tay:

```bash
ls -dt /opt/sandeal/releases/*          # chọn bản cũ
sudo ln -sfn /opt/sandeal/releases/<bản-cũ> /opt/sandeal/current
sudo systemctl restart sandeal
```

## Lệnh hay dùng

```bash
sudo systemctl status sandeal        # trạng thái
sudo journalctl -u sandeal -f        # xem log trực tiếp
sudo systemctl restart sandeal       # khởi động lại (sau khi sửa .env)
sudo -u postgres psql sandeal        # vào database
```

**Sao lưu database** (nên đặt cron hằng ngày):

```bash
sudo -u postgres pg_dump -Fc sandeal > /root/sandeal-$(date +%F).dump
```

**Khôi phục:**

```bash
sudo systemctl stop sandeal
sudo -u postgres pg_restore --clean -d sandeal /root/sandeal-YYYY-MM-DD.dump
sudo systemctl start sandeal
```

## Xử lý sự cố

- **502 Bad Gateway**: app chưa chạy. Kiểm tra bằng `sudo systemctl status sandeal` và `sudo journalctl -u sandeal -n 100`.
- **Không lấy được SSL**:
  - Kiểm tra `dig +short sandealgiare.com` trả đúng IP VPS.
  - Mở cổng 80/443: `ufw allow 80,443/tcp` hoặc `firewall-cmd --add-service={http,https} --permanent && firewall-cmd --reload`.
  - Chạy lại `sudo bash install.sh --web`.
- **Web server không phải nginx/Apache** (vd Caddy, LiteSpeed): chạy `sudo bash install.sh --no-web`, rồi cấu hình reverse proxy tới `http://127.0.0.1:<PORT trong .env>` và gửi kèm header `Host` và `X-Forwarded-For`.
- **Quay lại site public_html cũ**:
  1. Chép file trong `/opt/sandeal/backup-web-*` về chỗ cũ.
  2. Xoá file `sandealgiare.com-sandeal.conf`.
  3. Reload nginx/Apache.
