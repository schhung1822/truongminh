#!/usr/bin/env bash
# Sao lưu CSDL MySQL + thư mục ảnh vào thư mục backups/ (giữ 14 bản gần nhất).
# Chạy tay:  bash deploy/backup.sh      Đặt lịch hằng đêm: xem README, mục "Sao lưu".
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/$STAMP"
mkdir -p "$OUT"

# Đọc mật khẩu root từ .env (không in ra màn hình).
ROOT_PW="$(grep -E '^DB_ROOT_PASSWORD=' .env | head -n1 | cut -d= -f2- | tr -d '"')"

echo "==> Sao lưu CSDL"
docker compose exec -T -e MYSQL_PWD="$ROOT_PW" db \
  mysqldump -uroot --single-transaction --routines --default-character-set=utf8mb4 truongminh \
  | gzip > "$OUT/db.sql.gz"

echo "==> Sao lưu thư mục ảnh"
tar -czf "$OUT/storage.tar.gz" -C data storage

# Giữ 14 bản mới nhất.
ls -1d backups/*/ 2>/dev/null | sort | head -n -14 | xargs -r rm -rf

echo "Xong: $OUT  (nhớ tải về máy khác định kỳ, đừng chỉ để trên VPS)"
