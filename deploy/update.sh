#!/usr/bin/env bash
# Cập nhật web lên bản mới nhất. Chạy trên VPS, trong thư mục dự án:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Sao lưu trước khi cập nhật"
bash deploy/backup.sh

echo "==> Lấy mã mới"
git pull --ff-only

echo "==> Build lại và khởi động lại (cấu trúc CSDL tự cập nhật khi web khởi động)"
docker compose up -d --build

echo "==> Dọn ảnh Docker cũ"
docker image prune -f >/dev/null

echo "Xong. Xem trạng thái:  docker compose ps"
