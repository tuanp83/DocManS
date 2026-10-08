#!/usr/bin/env bash
# Sao lưu PostgreSQL và MinIO của bản triển khai docker-compose.prod.yml.
#
#   ./scripts/backup.sh                       # dùng .env.production, lưu vào ./backups
#   ENV_FILE=/etc/docmans.env BACKUP_DIR=/mnt/backup ./scripts/backup.sh
#
# Đặt lịch (cron, 01:30 hằng ngày):
#   30 1 * * * cd /opt/docmans && ./scripts/backup.sh >> /var/log/docmans-backup.log 2>&1
#
# Mọi lỗi đều làm script dừng với mã khác 0 để cron/giám sát phát hiện được.
# Nên chép thư mục backup sang máy hoặc ổ khác (rsync/rclone): backup nằm cùng máy với dữ liệu
# không bảo vệ được khi hỏng ổ đĩa hoặc mất máy chủ.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET="$BACKUP_DIR/$STAMP"

log() { echo "[$(date '+%F %T')] $*"; }
trap 'log "LỖI: sao lưu thất bại ở dòng $LINENO"; rm -rf "$TARGET"' ERR

[[ -f "$ENV_FILE" ]] || { log "Không tìm thấy $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_USER:?thiếu POSTGRES_USER trong $ENV_FILE}"
: "${POSTGRES_DB:?thiếu POSTGRES_DB trong $ENV_FILE}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

mkdir -p "$TARGET"
chmod 700 "$BACKUP_DIR" "$TARGET"

# 1. PostgreSQL: định dạng custom (-Fc) đã nén, khôi phục bằng pg_restore.
#    Dùng `exec -T` (KHÔNG cấp TTY) để dữ liệu nhị phân không bị biến đổi.
log "Sao lưu PostgreSQL ($POSTGRES_DB)..."
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner > "$TARGET/postgres.dump"
compose exec -T postgres pg_restore --list < "$TARGET/postgres.dump" > /dev/null   # kiểm tra file dump đọc được

# 2. MinIO: đọc trực tiếp volume của container minio (named volume, không phải thư mục ./minio_data).
MINIO_CONTAINER="$(compose ps -q minio)"
[[ -n "$MINIO_CONTAINER" ]] || { log "Container minio không chạy"; exit 1; }
log "Sao lưu MinIO..."
docker run --rm --volumes-from "$MINIO_CONTAINER":ro -v "$TARGET":/backup alpine:3.20 \
  tar -czf /backup/minio-data.tar.gz -C /data .
tar -tzf "$TARGET/minio-data.tar.gz" > /dev/null                                   # kiểm tra file nén đọc được

# 3. Checksum để phát hiện file hỏng trước khi khôi phục.
( cd "$TARGET" && sha256sum postgres.dump minio-data.tar.gz > SHA256SUMS )

log "Hoàn tất: $TARGET ($(du -sh "$TARGET" | cut -f1))"

# 4. Xoá các bản sao lưu cũ hơn RETENTION_DAYS ngày (chỉ thư mục dạng YYYYMMDD_HHMMSS).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_[0-9]*' -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} +
