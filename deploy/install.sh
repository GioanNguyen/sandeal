#!/usr/bin/env bash
# =============================================================================
#  Săn Deal – cài đặt / cập nhật trên VPS (Ubuntu, Debian, AlmaLinux, Rocky, CentOS 8+)
#
#  Lần đầu :  sudo bash install.sh
#  Cập nhật:  giải nén gói mới rồi chạy lại  sudo bash install.sh   (giữ nguyên .env & dữ liệu)
#
#  Tuỳ chọn:  DOMAIN=sandealgiare.com  EMAIL=ban@gmail.com  sudo -E bash install.sh
#             --no-web      bỏ qua bước cấu hình nginx/apache + SSL
#             --web         làm lại bước nginx/apache + SSL (kể cả khi đã làm)
#
#  Script KHÔNG đụng tới MySQL và KHÔNG xoá thư mục public_html.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-sandealgiare.com}"
EMAIL="${EMAIL:-}"
BASE=/opt/sandeal
SVC=sandeal
APP_USER=sandeal
DB_NAME=sandeal
DB_USER=sandeal
NODE_MAJOR=22
WEB_MODE=auto
for a in "$@"; do
  case "$a" in
    --no-web) WEB_MODE=skip ;;
    --web) WEB_MODE=force ;;
    *) echo "Tham số lạ: $a"; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_ERR=$'\e[31m'; C_B=$'\e[1m'; C_0=$'\e[0m'
step() { echo; echo "${C_B}==> $*${C_0}"; }
ok()   { echo "${C_OK}✔ $*${C_0}"; }
warn() { echo "${C_WARN}! $*${C_0}"; }
die()  { echo "${C_ERR}✘ $*${C_0}" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Hãy chạy bằng root: sudo bash install.sh"
[ "${NODE_ONLY:-}" = 1 ] || [ -f "$HERE/app/server.js" ] || die "Không thấy app/server.js cạnh install.sh – hãy chạy trong thư mục đã giải nén (sandeal/)."
[ "$(uname -m)" = x86_64 ] || die "Gói này build cho Linux x86_64, VPS đang là $(uname -m)."
VERSION="$(cat "$HERE/VERSION" 2>/dev/null || echo manual)"

if command -v apt-get >/dev/null; then PM=apt
elif command -v dnf >/dev/null; then PM=dnf
elif command -v yum >/dev/null; then PM=yum
else die "Không nhận ra hệ điều hành (cần apt hoặc dnf/yum)."; fi
pkg_install() {
  if [ "$PM" = apt ]; then DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@"
  else $PM install -y -q "$@"; fi
}
[ "$PM" = apt ] && { apt-get update -q >/dev/null || warn "apt-get update báo lỗi, vẫn tiếp tục"; }
command -v curl >/dev/null || pkg_install curl
command -v openssl >/dev/null || pkg_install openssl
command -v ss >/dev/null || pkg_install iproute2 2>/dev/null || pkg_install iproute || true

rand() { local s; s=$(openssl rand -base64 96 | tr -dc 'A-Za-z0-9'); echo "${s:0:${1:-32}}"; }
port_busy() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

# -----------------------------------------------------------------------------
step "1/6 Node.js (bản riêng trong $BASE/node – không đụng Node hệ thống)"
NODE_DIR="$BASE/node"
NODE_MIRROR="${NODE_MIRROR:-https://nodejs.org/dist}"
if [ -x "$NODE_DIR/bin/node" ] && [ "$("$NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  ok "Đã có Node $("$NODE_DIR/bin/node" -v) tại $NODE_DIR"
else
  command -v xz >/dev/null || pkg_install xz-utils 2>/dev/null || pkg_install xz
  tmp=$(mktemp -d)
  curl -fsSL "$NODE_MIRROR/latest-v$NODE_MAJOR.x/SHASUMS256.txt" -o "$tmp/SUMS" || die "Không tải được danh sách Node từ $NODE_MIRROR"
  file=$(grep -oE "node-v[0-9.]+-linux-x64\.tar\.xz" "$tmp/SUMS" | head -1)
  [ -n "$file" ] || die "Không tìm thấy bản Node $NODE_MAJOR cho linux-x64"
  curl -fsSL "$NODE_MIRROR/latest-v$NODE_MAJOR.x/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SUMS | sha256sum -c --quiet -) || die "Checksum Node không khớp"
  mkdir -p "$BASE"; rm -rf "$NODE_DIR.new"; mkdir "$NODE_DIR.new"
  tar -xJf "$tmp/$file" -C "$NODE_DIR.new" --strip-components=1
  rm -rf "$NODE_DIR"; mv "$NODE_DIR.new" "$NODE_DIR"; rm -rf "$tmp"
  ok "Đã cài Node $("$NODE_DIR/bin/node" -v) tại $NODE_DIR"
fi
NODE_BIN="$NODE_DIR/bin/node"
[ "${NODE_ONLY:-}" = 1 ] && { ok "Chỉ cài Node – xong"; exit 0; }

# -----------------------------------------------------------------------------
step "2/6 PostgreSQL (chạy song song MySQL, cổng 5432)"
pg_server_installed() { compgen -G "/usr/lib/postgresql/*/bin/postgres" >/dev/null || [ -x /usr/bin/postgres ] || compgen -G "/usr/pgsql-*/bin/postgres" >/dev/null; }
if ! command -v psql >/dev/null || ! pg_server_installed; then
  if [ "$PM" = apt ]; then
    pkg_install postgresql postgresql-contrib
  else
    pkg_install postgresql-server postgresql-contrib
    [ -f /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb
  fi
fi
PG_UNIT=$(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -E '^postgresql(-[0-9]+)?\.service$' | head -1)
PG_UNIT=${PG_UNIT:-postgresql.service}
systemctl enable --now "$PG_UNIT" >/dev/null 2>&1 || systemctl start "$PG_UNIT"
for _ in $(seq 1 20); do su - postgres -c "psql -qtAc 'select 1'" >/dev/null 2>&1 && break; sleep 1; done
su - postgres -c "psql -qtAc 'select 1'" >/dev/null 2>&1 || die "PostgreSQL không chạy được (xem: journalctl -u $PG_UNIT)"

# Cho phép đúng user/database của Săn Deal đăng nhập bằng mật khẩu qua 127.0.0.1.
# Chỉ THÊM 2 dòng riêng cho 'sandeal' lên đầu pg_hba.conf – không sửa dòng nào của site khác.
HBA=$(su - postgres -c "psql -qtAc 'show hba_file'")
if ! grep -q "^host  *$DB_NAME  *$DB_USER  *127.0.0.1/32" "$HBA"; then
  cp -a "$HBA" "$HBA.bak-sandeal"
  { echo "# Săn Deal (install.sh)"
    echo "host  $DB_NAME  $DB_USER  127.0.0.1/32  md5"
    echo "host  $DB_NAME  $DB_USER  ::1/128       md5"
    cat "$HBA.bak-sandeal"; } > "$HBA"
  su - postgres -c "psql -qtAc 'select pg_reload_conf()'" >/dev/null
  ok "Đã thêm quyền đăng nhập cho '$DB_USER' vào $HBA (bản cũ: $HBA.bak-sandeal)"
fi
ok "PostgreSQL $(su - postgres -c "psql -qtAc 'show server_version'" | cut -d' ' -f1) đang chạy"

# -----------------------------------------------------------------------------
step "3/6 Người dùng, thư mục, cấu hình .env"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$BASE/releases"
ENV_FILE="$BASE/.env"

if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(rand 32)"
  su - postgres -c "psql -v ON_ERROR_STOP=1 -qtA" <<SQL >/dev/null
DO \$\$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN ALTER ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  ELSE CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS'; END IF;
END \$\$;
SQL
  su - postgres -c "psql -qtAc \"select 1 from pg_database where datname='$DB_NAME'\"" | grep -q 1 \
    || su - postgres -c "createdb -O $DB_USER -E UTF8 -T template0 $DB_NAME"

  PORT=3000
  while port_busy $PORT; do PORT=$((PORT + 1)); done

  # Khoá Web Push (VAPID) tạo sẵn để bật thông báo trình duyệt
  read -r VAPID_PUB VAPID_PRIV < <("$NODE_BIN" -e '
    const e=require("crypto").createECDH("prime256v1");e.generateKeys();
    const p=Buffer.alloc(32);const k=e.getPrivateKey();k.copy(p,32-k.length);
    console.log(e.getPublicKey().toString("base64url"),p.toString("base64url"))')

  ADMIN="${EMAIL}"
  if [ -z "$ADMIN" ] && [ -t 0 ]; then read -rp "Email quản trị (được vào /admin, nhận thông báo SSL): " ADMIN; fi

  umask 077
  cat > "$ENV_FILE" <<ENV
# ===== Săn Deal – cấu hình production (tạo lúc $(date '+%F %T')) =====
# Sửa xong chạy:  sudo systemctl restart $SVC
NODE_ENV=production
TZ=Asia/Ho_Chi_Minh
HOSTNAME=127.0.0.1
PORT=$PORT
SITE_URL=https://$DOMAIN
AUTH_SECRET=$(rand 48)
ADMIN_EMAILS=$ADMIN
DATABASE_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME

# Web và lịch đồng bộ chạy chung 1 tiến trình
RUN_WORKER_IN_WEB=1
SYNC_ON_START=1
SYNC_CRON="0 */2 * * *"

# Nguồn dữ liệu. "mock" = dữ liệu mẫu để chạy thử.
# TRƯỚC KHI QUẢNG BÁ: điền khoá affiliate bên dưới và đổi thành vd "shopee,lazada,accesstrade"
SOURCES=mock
SHOPEE_APP_ID=
SHOPEE_SECRET=
LAZADA_APP_KEY=
LAZADA_APP_SECRET=
LAZADA_ACCESS_TOKEN=
TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
TIKTOK_ACCESS_TOKEN=
ACCESSTRADE_TOKEN=

# Email (link đăng nhập, cảnh báo giá, mail tuần). Trống = chỉ ghi ra log.
# Vd Gmail: smtps://ban%40gmail.com:MAT_KHAU_UNG_DUNG@smtp.gmail.com:465
SMTP_URL=
MAIL_FROM="Săn Deal <no-reply@$DOMAIN>"

# Thông báo đẩy trình duyệt
VAPID_PUBLIC_KEY=$VAPID_PUB
VAPID_PRIVATE_KEY=$VAPID_PRIV
VAPID_SUBJECT=mailto:${ADMIN:-admin@$DOMAIN}

# Telegram (tuỳ chọn)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_CHAT_ID=
ENV
  umask 022
  ok "Đã tạo $ENV_FILE (cơ sở dữ liệu '$DB_NAME', cổng app $PORT)"
  echo "   Các biến khác có thể thêm: xem $HERE/env.example"
else
  ok "Giữ nguyên cấu hình cũ: $ENV_FILE"
fi
chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
PORT=$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)
ADMIN=$(grep -E '^ADMIN_EMAILS=' "$ENV_FILE" | cut -d= -f2 | cut -d, -f1)
EMAIL="${EMAIL:-$ADMIN}"

# -----------------------------------------------------------------------------
step "4/6 Chép mã nguồn bản $VERSION"
REL="$BASE/releases/$(date +%Y%m%d-%H%M%S)-$VERSION"
cp -a "$HERE/app" "$REL"
rm -f "$REL/.env" "$REL/.env."*
chown -R "$APP_USER:$APP_USER" "$REL"
PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
ln -sfn "$REL" "$BASE/current"
ok "$BASE/current -> $REL"

# -----------------------------------------------------------------------------
step "5/6 Dịch vụ systemd '$SVC'"
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=San Deal (Next.js)
After=network-online.target $PG_UNIT
Wants=network-online.target
Requires=$PG_UNIT

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$BASE/current
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable $SVC >/dev/null 2>&1
systemctl restart $SVC

healthy=0
for _ in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$code" = 200 ] && { healthy=1; break; }
  sleep 2
done
if [ $healthy = 1 ]; then
  ok "App chạy tốt tại 127.0.0.1:$PORT"
else
  journalctl -u $SVC -n 40 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$BASE/current"; systemctl restart $SVC; rm -rf "$REL"
    die "Bản mới không khởi động được – đã quay về bản trước ($PREV). Log ở trên."
  fi
  die "App không khởi động được. Xem log ở trên hoặc: journalctl -u $SVC -f"
fi
# Giữ lại 3 bản gần nhất
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf

# -----------------------------------------------------------------------------
step "6/6 Web server & HTTPS cho $DOMAIN"
MARK="$BASE/.web-done"
if [ "$WEB_MODE" = skip ] || { [ "$WEB_MODE" = auto ] && [ -f "$MARK" ]; }; then
  ok "Bỏ qua (đã cấu hình trước đó; chạy lại với --web nếu muốn làm lại)"
else
  listener=$(ss -ltnpH '( sport = :80 )' 2>/dev/null | grep -oE 'users:\(\("[^"]+' | head -1 | sed 's/.*"//' || true)
  if [ -z "$listener" ]; then
    if systemctl is-enabled nginx >/dev/null 2>&1; then listener=nginx
    elif systemctl is-enabled apache2 >/dev/null 2>&1 || systemctl is-enabled httpd >/dev/null 2>&1; then listener=apache2
    else
      warn "Chưa có web server nào – cài nginx"
      pkg_install nginx; systemctl enable --now nginx; listener=nginx
    fi
  fi
  case "$listener" in
    nginx*) WS=nginx ;;
    apache2*|httpd*) WS=apache ;;
    *) WS=other ;;
  esac

  WWW=""
  getent ahosts "www.$DOMAIN" >/dev/null 2>&1 && WWW="www.$DOMAIN"
  NAMES="$DOMAIN${WWW:+ $WWW}"
  BK="$BASE/backup-web-$(date +%Y%m%d-%H%M%S)"
  DISABLED=()

  # Tìm cấu hình cũ đang phục vụ tên miền (vd trỏ vào public_html) -> sao lưu + tắt
  disable_old() {  # $1 = file của mình (bỏ qua), còn lại = các thư mục cấu hình đang được nạp
    local mine="$1" f others dirs=(); shift
    for f in "$@"; do [ -d "$f" ] && dirs+=("$f"); done
    [ ${#dirs[@]} = 0 ] && return 0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      [ "$(readlink -f "$f")" = "$(readlink -f "$mine")" ] && continue
      case "$f" in *.bak*|*.disabled*|*~) continue ;; esac
      others=$(grep -hoiE '(server_name|ServerName|ServerAlias)\s+[^;#{}]*' "$f" \
        | sed -E 's/^(server_name|ServerName|ServerAlias)\s+//I' | tr ' \t' '\n\n' \
        | grep -viE "^(|_|localhost|$DOMAIN|www\.$DOMAIN)(:[0-9]+)?$" || true)
      if [ -n "$others" ]; then
        die "File $f còn phục vụ tên miền khác ($(echo $others)). Script không tự sửa để tránh làm hỏng site khác – hãy xoá block của $DOMAIN trong file đó rồi chạy lại với --web."
      fi
      mkdir -p "$BK"; cp -a --parents "$f" "$BK/"
      if [ -L "$f" ]; then rm -f "$f"; DISABLED+=("link:$f")
      else mv "$f" "$f.disabled-by-sandeal"; DISABLED+=("file:$f"); fi
      warn "Đã tắt cấu hình cũ: $f (sao lưu tại $BK)"
    done < <(grep -RlisE "(server_name|ServerName|ServerAlias)\s[^#;]*\b${DOMAIN//./\\.}\b" "${dirs[@]}" 2>/dev/null | sort -u)
  }
  restore_old() {
    local d
    for d in "${DISABLED[@]}"; do
      case "$d" in
        link:*) cp -a "$BK${d#link:}" "${d#link:}" ;;
        file:*) mv "${d#file:}.disabled-by-sandeal" "${d#file:}" ;;
      esac
    done
  }

  if [ "$WS" = nginx ]; then
    if [ -d /etc/nginx/sites-available ]; then CONF=/etc/nginx/sites-available/$DOMAIN-sandeal.conf; LINK=/etc/nginx/sites-enabled/$DOMAIN-sandeal.conf
    else CONF=/etc/nginx/conf.d/$DOMAIN-sandeal.conf; LINK=""; fi
    disable_old "$CONF" /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/vhosts.d
    cat > "$CONF" <<NGX
# Săn Deal – reverse proxy tới Node (sinh bởi install.sh)
server {
    listen 80;
$( [ -f /proc/net/if_inet6 ] && echo '    listen [::]:80;' )
    server_name $NAMES;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
NGX
    [ -n "$LINK" ] && ln -sfn "$CONF" "$LINK"
    if ! nginx -t; then
      rm -f "$CONF" ${LINK:+"$LINK"}; restore_old
      die "nginx -t báo lỗi – đã khôi phục cấu hình cũ."
    fi
    nginx -t 2>&1 | grep -q "conflicting server name" && warn "nginx báo trùng server_name $DOMAIN ở file khác (có thể trong nginx.conf) – hãy xoá block cũ."
    systemctl reload nginx
    CERTBOT_PLUGIN=nginx
    [ "$PM" = apt ] || pkg_install epel-release >/dev/null 2>&1 || true
    command -v certbot >/dev/null && certbot plugins 2>/dev/null | grep nginx >/dev/null || pkg_install certbot python3-certbot-nginx

  elif [ "$WS" = apache ]; then
    if [ -d /etc/apache2 ]; then
      a2enmod -q proxy proxy_http headers ssl >/dev/null
      CONF=/etc/apache2/sites-available/$DOMAIN-sandeal.conf; ADIR=/etc/apache2; ACTL=apache2ctl; AUNIT=apache2
    else
      CONF=/etc/httpd/conf.d/$DOMAIN-sandeal.conf; ADIR=/etc/httpd; ACTL=apachectl; AUNIT=httpd
      pkg_install mod_ssl >/dev/null 2>&1 || true
    fi
    disable_old "$CONF" "$ADIR/sites-enabled" "$ADIR/conf.d" "$ADIR/vhosts.d"
    cat > "$CONF" <<APC
# Săn Deal – reverse proxy tới Node (sinh bởi install.sh)
<VirtualHost *:80>
    ServerName $DOMAIN
    ${WWW:+ServerAlias $WWW}
    ProxyPreserveHost On
    ProxyRequests Off
    RequestHeader unset X-Forwarded-For early
    RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}
    ProxyPass / http://127.0.0.1:$PORT/
    ProxyPassReverse / http://127.0.0.1:$PORT/
</VirtualHost>
APC
    [ -d /etc/apache2 ] && a2ensite -q "$(basename "$CONF")" >/dev/null
    if ! $ACTL configtest; then
      [ -d /etc/apache2 ] && a2dissite -q "$(basename "$CONF")" >/dev/null
      rm -f "$CONF"; restore_old
      die "apachectl configtest báo lỗi – đã khôi phục cấu hình cũ."
    fi
    systemctl reload $AUNIT
    CERTBOT_PLUGIN=apache
    [ "$PM" = apt ] || pkg_install epel-release >/dev/null 2>&1 || true
    command -v certbot >/dev/null && certbot plugins 2>/dev/null | grep apache >/dev/null || pkg_install certbot python3-certbot-apache

  else
    warn "Cổng 80 đang do '$listener' giữ – script không tự cấu hình được."
    warn "Hãy cho web server đó chuyển (reverse proxy) $DOMAIN tới http://127.0.0.1:$PORT (xem DEPLOY.md)."
    CERTBOT_PLUGIN=""
  fi

  if [ -n "$CERTBOT_PLUGIN" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/ || true)
    [ "$code" = 200 ] && ok "$WS đã chuyển $DOMAIN tới app" || warn "Thử http://127.0.0.1/ với Host $DOMAIN trả về $code"
    CB_ARGS=(--"$CERTBOT_PLUGIN" --non-interactive --agree-tos --redirect --keep-until-expiring -d "$DOMAIN")
    [ -n "$WWW" ] && CB_ARGS+=(-d "$WWW")
    if [ -n "$EMAIL" ]; then CB_ARGS+=(-m "$EMAIL"); else CB_ARGS+=(--register-unsafely-without-email); fi
    if certbot "${CB_ARGS[@]}"; then
      ok "HTTPS đã bật (tự gia hạn)"
    else
      warn "Chưa lấy được chứng chỉ SSL. Kiểm tra tên miền đã trỏ đúng IP và cổng 80/443 đã mở, rồi chạy:"
      warn "  sudo certbot ${CB_ARGS[*]}"
    fi
    touch "$MARK"
  fi
fi

echo
echo "${C_OK}${C_B}Hoàn tất!${C_0}  https://$DOMAIN   (bản $VERSION)"
echo "  Cấu hình : $ENV_FILE   -> sửa xong: sudo systemctl restart $SVC"
echo "  Xem log  : sudo journalctl -u $SVC -f"
echo "  Trạng thái: sudo systemctl status $SVC"
grep -q '^SOURCES=mock' "$ENV_FILE" && warn "Đang dùng dữ liệu MẪU (SOURCES=mock). Điền khoá affiliate trong $ENV_FILE trước khi quảng bá site."
grep -q '^SMTP_URL=$' "$ENV_FILE" && warn "Chưa cấu hình SMTP_URL: link đăng nhập chỉ hiện trong log (journalctl -u $SVC)."
exit 0
