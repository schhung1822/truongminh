#!/usr/bin/env bash
# Cập nhật web lên bản mới nhất (cách chạy PM2, không Docker). Chạy trên VPS, trong thư mục dự án:  bash deploy/update-pm2.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Sao lưu trước khi cập nhật"
bash deploy/backup-pm2.sh

echo "==> Lấy mã mới"
git pull --ff-only

echo "==> Cài thư viện (gồm thư viện build) và tạo Prisma client"
npm ci --include=dev

echo "==> Cập nhật cấu trúc CSDL"
npx prisma migrate deploy

echo "==> Build"
npm run build

echo "==> Khởi động lại (một tiến trình duy nhất)"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "Xong. Xem trạng thái:  pm2 status   |   nhật ký:  pm2 logs truongminh"
