#!/usr/bin/env bash
# =============================================================================
#  Săn Deal – cập nhật bằng git, chạy NGAY TRÊN VPS trong thư mục repo đã clone:
#
#     cd /opt/sandeal/repo && sudo bash deploy/vps-update.sh
#
#  Việc làm: git pull  ->  npm ci (khi package-lock đổi)  ->  build  ->  install.sh
#  (install.sh lo phần còn lại: PostgreSQL, .env, systemd, nginx/Apache, SSL, quay về bản cũ nếu lỗi)
#
#  Tuỳ chọn:  FORCE=1     build lại dù không có commit mới
#             NO_PULL=1   không pull, build đúng mã đang có
#             BRANCH=main nhánh cần theo (mặc định: nhánh đang checkout)
#             Các tham số khác (--web, --no-web) được chuyển cho install.sh
# =============================================================================
set -euo pipefail
# Bọc trong main() để bash đọc hết script trước khi chạy (git pull có thể ghi đè chính file này)
main() {
cd "$(dirname "$0")/.."
REPO="$(pwd)"
SELF_COPY="$(mktemp)"; cp deploy/vps-update.sh "$SELF_COPY"
C_OK=$'\e[32m'; C_ERR=$'\e[31m'; C_B=$'\e[1m'; C_0=$'\e[0m'
step() { echo; echo "${C_B}==> $*${C_0}"; }
ok()   { echo "${C_OK}✔ $*${C_0}"; }
die()  { echo "${C_ERR}✘ $*${C_0}" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Hãy chạy bằng root: sudo bash deploy/vps-update.sh"
git rev-parse --git-dir >/dev/null 2>&1 || die "$REPO không phải repo git."
# Repo do root sở hữu nhưng có thể được clone bằng user khác
git config --global --get-all safe.directory 2>/dev/null | grep -qx "$REPO" || git config --global --add safe.directory "$REPO"

# ----------------------------------------------------------------------------
step "Lấy mã mới"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
if [ "${NO_PULL:-}" != 1 ]; then
  git diff --quiet && git diff --cached --quiet || die "Có file bị sửa trực tiếp trên VPS (git status). Hãy sửa ở máy dev rồi push; hoặc bỏ thay đổi: git checkout -- ."
  git fetch --prune origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH" || die "Không fast-forward được (lịch sử bị viết lại?). Kiểm tra: git status / git log"
  # Chính script này vừa được cập nhật -> chạy lại bằng bản mới
  if ! cmp -s "$SELF_COPY" deploy/vps-update.sh; then
    ok "vps-update.sh có bản mới – chạy lại bằng bản mới"
    exec env NO_PULL=1 bash deploy/vps-update.sh "$@"
  fi
fi
HEAD_SHA="$(git rev-parse --short HEAD)"
ok "Mã: $BRANCH @ $HEAD_SHA – $(git log -1 --format=%s | cut -c1-80)"

CURRENT_VER=""
[ -L /opt/sandeal/current ] && CURRENT_VER="$(basename "$(readlink -f /opt/sandeal/current)" | sed 's/^[0-9]*-[0-9]*-//')"
if [ "$CURRENT_VER" = "$HEAD_SHA" ] && [ "${FORCE:-}" != 1 ]; then
  ok "Đang chạy đúng bản $HEAD_SHA rồi – không cần làm gì (FORCE=1 để build lại)."
  exit 0
fi

# ----------------------------------------------------------------------------
step "Chuẩn bị môi trường build"
# Dùng Node riêng của Săn Deal (install.sh cài vào /opt/sandeal/node), không đụng Node hệ thống
if [ ! -x /opt/sandeal/node/bin/node ]; then
  echo "Chưa có Node riêng – chạy bước cài Node của install.sh trước"
  NODE_ONLY=1 bash deploy/install.sh
fi
export PATH="/opt/sandeal/node/bin:$PATH"
ok "Node $(node -v) ($(command -v node))"

# Build Next.js cần ~2 GB bộ nhớ: VPS nhỏ thì thêm swap (1 lần)
mem_mb=$(( ( $(awk '/MemTotal/{print $2}' /proc/meminfo) + $(awk '/SwapTotal/{print $2}' /proc/meminfo) ) / 1024 ))
if [ "$mem_mb" -lt 2500 ] && [ ! -f /swapfile-sandeal ]; then
  echo "RAM + swap = ${mem_mb} MB, tạo thêm 2 GB swap tại /swapfile-sandeal"
  fallocate -l 2G /swapfile-sandeal 2>/dev/null || dd if=/dev/zero of=/swapfile-sandeal bs=1M count=2048 status=none
  chmod 600 /swapfile-sandeal && mkswap /swapfile-sandeal >/dev/null && swapon /swapfile-sandeal
  grep -q swapfile-sandeal /etc/fstab || echo "/swapfile-sandeal none swap sw 0 0" >> /etc/fstab
  ok "Đã bật swap"
fi

# ----------------------------------------------------------------------------
step "Cài thư viện"
LOCK_HASH="$(sha256sum package-lock.json | cut -c1-16)"
if [ -d node_modules ] && [ "$(cat node_modules/.sandeal-lock 2>/dev/null)" = "$LOCK_HASH" ]; then
  ok "package-lock không đổi – dùng lại node_modules"
else
  npm ci --no-audit --no-fund --loglevel=error
  echo "$LOCK_HASH" > node_modules/.sandeal-lock
  ok "Đã cài thư viện"
fi

# ----------------------------------------------------------------------------
step "Build bản $HEAD_SHA"
export NEXT_TELEMETRY_DISABLED=1
NODE_OPTIONS="--max-old-space-size=1536" NO_TAR=1 bash deploy/make-release.sh

# ----------------------------------------------------------------------------
step "Triển khai"
exec bash dist/sandeal/install.sh "$@"
}
main "$@"
