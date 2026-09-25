#!/usr/bin/env bash
# Đóng gói bản chạy production (Next.js standalone) thành 1 file để chép lên VPS.
#   bash deploy/make-release.sh        -> dist/sandeal-release.tar.xz
# Cần build trên Linux x64 (cùng kiến trúc với VPS) vì node_modules có file nhị phân.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
if [ "${SKIP_BUILD:-}" != 1 ]; then
  rm -rf .next
  NEXT_OUTPUT=standalone npm run build
fi
[ -f .next/standalone/server.js ] || { echo "Chưa có .next/standalone – bỏ SKIP_BUILD để build"; exit 1; }

OUT=dist/sandeal
mkdir -p "$OUT"
cp -a .next/standalone "$OUT/app"
rm -rf "$OUT/app/.next/static"
cp -a .next/static "$OUT/app/.next/static"
cp -a public/. "$OUT/app/public/"
# Không mang file bí mật / dữ liệu máy dev lên server
rm -f "$OUT/app/.env" "$OUT/app/.env."*
rm -rf "$OUT/app/.data"
# Bỏ gói không dùng khi chạy (ảnh để unoptimized nên không cần sharp; config đã được nhúng sẵn nên không cần typescript)
rm -rf "$OUT/app/node_modules/@img" "$OUT/app/node_modules/sharp" "$OUT/app/node_modules/typescript"

cp deploy/install.sh deploy/DEPLOY.md "$OUT/"
cp .env.example "$OUT/env.example"
git rev-parse --short HEAD > "$OUT/VERSION" 2>/dev/null || date +%Y%m%d%H%M > "$OUT/VERSION"

if [ "${NO_TAR:-}" = 1 ]; then echo "Xong: dist/sandeal (bản $(cat "$OUT/VERSION"))"; exit 0; fi
tar -C dist -cf - sandeal | xz -T0 -9 > dist/sandeal-release.tar.xz
echo "Xong: dist/sandeal-release.tar.xz ($(du -h dist/sandeal-release.tar.xz | cut -f1), bản $(cat "$OUT/VERSION"))"
