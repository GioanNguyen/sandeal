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

## Script thay đổi gì trên VPS

**Không đụng tới:**
- MySQL và database của nó.
- Thư mục `public_html`.
- Cấu hình nginx/Apache của các tên miền khác.
- Node.js cài sẵn trên máy, nếu có. Săn Deal dùng Node riêng tại `/opt/sandeal/node`.
- Quyền đăng nhập PostgreSQL của các app khác.

**Có thêm hoặc thay đổi:**

| Thành phần | Nội dung |
|---|---|
| `/opt/sandeal/` | Mã chạy, Node riêng, `.env`, các bản đã cài |
| Dịch vụ `sandeal` | Node chạy ở `127.0.0.1:3000`. Nếu cổng 3000 đã có app khác dùng thì chọn cổng trống kế tiếp |
| PostgreSQL | Cài mới nếu chưa có (cổng 5432). Thêm user và database `sandeal`, và 2 dòng chỉ cho `sandeal` ở đầu `pg_hba.conf` (có bản sao lưu `.bak-sandeal`) |
| nginx/Apache | Thêm 1 file `sandealgiare.com-sandeal.conf`. Tắt file cũ chỉ phục vụ sandealgiare.com (có sao lưu). Nếu file cũ còn chứa tên miền khác thì dừng lại, không sửa. Kiểm tra cấu hình trước khi reload |
| Gói hệ thống | `curl`, `openssl`, `xz`, PostgreSQL, certbot. Trên Debian/Ubuntu với Apache: bật module `proxy`, `proxy_http`, `headers`, `ssl` |
| Swap | Chỉ khi cập nhật bằng git và máy có dưới 2,5 GB bộ nhớ: thêm file `/swapfile-sandeal` 2 GB |

nginx/Apache chỉ **reload**, không restart, nên các site khác không bị gián đoạn.

Nếu `sandealgiare.com` trước đây là site mặc định (`default_server`), những request gõ thẳng IP của VPS sẽ chuyển sang site mặc định kế tiếp.

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

1. Tải Node.js 22 vào `/opt/sandeal/node` (không thay Node hệ thống).
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

## Cập nhật bằng git (khuyên dùng)

VPS giữ một bản clone của repo tại `/opt/sandeal/repo`. Mỗi lần cập nhật, VPS tự pull code mới, build rồi chạy `install.sh`. Nếu bản mới lỗi, script tự quay về bản trước.

### Chuẩn bị 1 lần

**1. Đẩy code lên GitHub** (repo private). Chạy trên máy dev:

```bash
cd ~/Workspace/sandeal
git remote add origin git@github.com:<tai-khoan>/san-deal.git
git push -u origin main
```

**2. Cho VPS quyền đọc repo bằng deploy key.** Chạy trên VPS:

```bash
sudo apt-get install -y git          # hoặc: sudo dnf install -y git
sudo ssh-keygen -t ed25519 -N "" -f /root/.ssh/sandeal_deploy -C "vps-sandeal"
sudo cat /root/.ssh/sandeal_deploy.pub
```

Chép dòng vừa hiện vào GitHub: repo → **Settings → Deploy keys → Add deploy key**. Không cần tick "Allow write access".

**3. Clone repo và cài lần đầu.** Chạy trên VPS:

```bash
sudo tee -a /root/.ssh/config >/dev/null <<'CFG'
Host github.com
  IdentityFile /root/.ssh/sandeal_deploy
  IdentitiesOnly yes
CFG
sudo ssh-keyscan github.com | sudo tee -a /root/.ssh/known_hosts >/dev/null
sudo git clone git@github.com:<tai-khoan>/san-deal.git /opt/sandeal/repo
cd /opt/sandeal/repo && sudo EMAIL=email_cua_ban@gmail.com bash deploy/vps-update.sh
```

Nếu VPS đã cài bằng gói `.tar.xz`, bước này dùng lại `.env`, database và cấu hình web đang có.

### Mỗi lần cập nhật

**1. Đẩy code lên GitHub** từ máy dev:

```bash
git push
```

**2. Cập nhật VPS:**

```bash
cd /opt/sandeal/repo && sudo bash deploy/vps-update.sh
```

Script làm lần lượt:

1. `git pull`
2. `npm ci`, chỉ khi `package-lock.json` đổi
3. Build
4. Chuyển sang bản mới và kiểm tra app chạy được
5. Nếu lỗi, tự quay về bản cũ

- Nếu không có commit mới, script dừng ngay.
- VPS có dưới 2,5 GB (RAM + swap) thì script tự tạo thêm 2 GB swap để build.
- Không sửa code trực tiếp trên VPS. Script sẽ từ chối pull khi thấy file bị sửa.

### Tự động cập nhật khi push (tuỳ chọn)

File `deploy/github-actions-deploy.yml` (chép thành `.github/workflows/deploy.yml` để bật) sẽ SSH vào VPS và chạy lệnh cập nhật mỗi khi bạn push lên `main`.

Để bật, tạo một cặp khoá SSH riêng cho GitHub Actions, rồi thêm public key vào `~/.ssh/authorized_keys` của user trên VPS.

Sau đó thêm 3 secret trong repo (**Settings → Secrets and variables → Actions**):

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP của VPS |
| `VPS_USER` | `root`, hoặc user có sudo không cần mật khẩu |
| `VPS_SSH_KEY` | Nội dung private key |

Chưa có secret thì workflow tự bỏ qua, không báo lỗi.

## Cập nhật bằng gói .tar.xz (khi không dùng git)

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

## Tiện ích trình duyệt (extension)

File `san-deal-extension.zip` ở trang `/tien-ich` được đóng gói lúc build. Địa chỉ `SITE_URL` được ghi sẵn vào file này, nên sau khi đổi tên miền hoặc sửa `SITE_URL` trong `.env`, bạn cần chạy lại lệnh cập nhật để đóng gói lại:

- Cập nhật bằng git: `sudo FORCE=1 bash deploy/vps-update.sh`
- Cập nhật bằng gói: dùng lệnh `SITE_URL=https://ten-mien-moi bash deploy/make-release.sh` để build gói mới

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
