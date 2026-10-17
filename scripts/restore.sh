#!/usr/bin/env bash
# Khôi phục một bản sao lưu do scripts/backup.sh tạo ra.
#
#   ./scripts/restore.sh backups/20261009_013000
#   SKIP_SAFETY_BACKUP=1 ./scripts/restore.sh <thư mục>   # máy mới / dữ liệu hiện tại đã hỏng, không cần giữ
#
# CẢNH BÁO: GHI ĐÈ toàn bộ cơ sở dữ liệu và tệp hiện tại. Nên diễn tập khôi phục định kỳ
# trên một máy thử (yêu cầu RPO 24 giờ / RTO 1 ngày làm việc) để chắc chắn backup dùng được.
#
# An toàn khi quay lại phiên bản cũ: schema được xoá và dựng lại đúng như trong bản sao lưu (kể cả bảng
# _prisma_migrations), nên bảng của phiên bản mới hơn không còn sót để làm hỏng lần cập nhật sau.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
SOURCE="${1:?Cách dùng: $0 <thư mục backup>}"
SOURCE="$(cd "$SOURCE" && pwd)"

log() { echo "[$(date '+%F %T')] $*"; }

[[ -f "$ENV_FILE" ]] || { log "Không tìm thấy $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log "Kiểm tra checksum..."
( cd "$SOURCE" && sha256sum -c SHA256SUMS )

read -r -p "Ghi đè dữ liệu hiện tại bằng bản $SOURCE? Gõ 'KHOI PHUC' để tiếp tục: " answer
[[ "$answer" == "KHOI PHUC" ]] || { log "Đã huỷ."; exit 1; }

# 1. Sao lưu dữ liệu đang có trước khi ghi đè, để còn đường lui nếu chọn nhầm bản. Không xoá bản cũ
#    trong lần chạy này (bản đang khôi phục có thể cũ hơn RETENTION_DAYS).
if [[ "${SKIP_SAFETY_BACKUP:-}" != "1" ]]; then
  log "Sao lưu dữ liệu hiện tại trước khi ghi đè..."
  ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" RETENTION_DAYS=36500 "$SCRIPT_DIR/backup.sh" || {
    log "Không sao lưu được dữ liệu hiện tại. Kiểm tra stack đang chạy, hoặc chạy lại với SKIP_SAFETY_BACKUP=1 nếu chắc chắn không cần giữ."
    exit 1
  }
fi

log "Dừng ứng dụng (giữ postgres và minio)..."
compose stop nginx web api

# 2. Xoá schema và nạp lại bản sao lưu trong CÙNG một giao dịch: lỗi giữa chừng thì cơ sở dữ liệu giữ nguyên.
log "Khôi phục PostgreSQL..."
#    Chuyển dump thành SQL ra file tạm trước, để dump hỏng không bao giờ làm psql chạy nửa chừng.
compose exec -T postgres sh -c 'set -e
  trap "rm -f /tmp/restore.sql" EXIT
  pg_restore --no-owner --no-acl -f /tmp/restore.sql
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -q \
    -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" -f /tmp/restore.sql' < "$SOURCE/postgres.dump"

# 3. Giải nén ra thư mục tạm trong volume trước; chỉ khi giải nén xong mới thay dữ liệu cũ.
log "Khôi phục MinIO..."
compose stop minio
MINIO_CONTAINER="$(compose ps -aq minio)"
docker run --rm --volumes-from "$MINIO_CONTAINER" -v "$SOURCE":/backup:ro alpine:3.20 sh -c 'set -e
  rm -rf /data/.restore && mkdir /data/.restore
  tar -xzf /backup/minio-data.tar.gz -C /data/.restore
  find /data -mindepth 1 -maxdepth 1 ! -name .restore -exec rm -rf {} +
  find /data/.restore -mindepth 1 -maxdepth 1 -exec mv {} /data/ \;
  rmdir /data/.restore'

log "Khởi động lại..."
compose up -d
log "Hoàn tất. Kiểm tra: đăng nhập, mở một hồ sơ, tải xuống một tệp đính kèm."
