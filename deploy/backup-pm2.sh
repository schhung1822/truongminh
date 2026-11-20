#!/usr/bin/env bash
# Sao lưu CSDL MySQL + thư mục ảnh (cách chạy PM2, không Docker) vào thư mục backups/ (giữ 14 bản gần nhất).
# Chạy tay:  bash deploy/backup-pm2.sh      Đặt lịch hằng đêm: xem README, mục "Triển khai bằng PM2".
# Cần lệnh mysqldump (gói mysql) trên máy. Mật khẩu lấy từ DATABASE_URL trong .env, không in ra màn hình.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/$STAMP"
mkdir -p "$OUT"

# Tách DATABASE_URL (không in giá trị ra).
DB_HOST="$(node deploy/db-url.cjs host)"
DB_PORT="$(node deploy/db-url.cjs port)"
DB_USER="$(node deploy/db-url.cjs user)"
DB_PASS="$(node deploy/db-url.cjs pass)"
DB_NAME="$(node deploy/db-url.cjs name)"

echo "==> Sao lưu CSDL"
MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --no-tablespaces --default-character-set=utf8mb4 "$DB_NAME" \
  | gzip > "$OUT/db.sql.gz"

echo "==> Sao lưu thư mục ảnh"
STORAGE="${STORAGE_DIR:-storage}"
tar -czf "$OUT/storage.tar.gz" "$STORAGE"

# Giữ 14 bản mới nhất.
ls -1d backups/*/ 2>/dev/null | sort | head -n -14 | xargs -r rm -rf

echo "Xong: $OUT  (nhớ tải về máy khác định kỳ, đừng chỉ để trên VPS)"
