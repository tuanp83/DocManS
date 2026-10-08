#!/usr/bin/env bash
# Khôi phục một bản sao lưu do scripts/backup.sh tạo ra.
#
#   ./scripts/restore.sh backups/20261009_013000
#
# CẢNH BÁO: GHI ĐÈ toàn bộ cơ sở dữ liệu và tệp hiện tại. Nên diễn tập khôi phục định kỳ
# trên một máy thử (yêu cầu RPO 24 giờ / RTO 1 ngày làm việc) để chắc chắn backup dùng được.
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

log "Dừng ứng dụng (giữ postgres và minio)..."
compose stop nginx web api

log "Khôi phục PostgreSQL..."
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction < "$SOURCE/postgres.dump"

log "Khôi phục MinIO..."
compose stop minio
MINIO_CONTAINER="$(compose ps -aq minio)"
docker run --rm --volumes-from "$MINIO_CONTAINER" -v "$SOURCE":/backup:ro alpine:3.20 \
  sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/minio-data.tar.gz -C /data'

log "Khởi động lại..."
compose up -d
log "Hoàn tất. Kiểm tra: đăng nhập, mở một hồ sơ, tải xuống một tệp đính kèm."
