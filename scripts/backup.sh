#!/bin/bash
set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Bắt đầu sao lưu cơ sở dữ liệu PostgreSQL..."
docker exec -t docmans-postgres-1 pg_dump -U docmansystem docmansystem_prod > "$BACKUP_DIR/db_backup_$DATE.sql"

echo "Bắt đầu sao lưu MinIO..."
# Tuỳ chọn cài đặt mc (MinIO Client) hoặc chỉ backup thư mục volume
# Cách đơn giản nhất nếu có docker volume mount:
tar -czf "$BACKUP_DIR/minio_backup_$DATE.tar.gz" -C ./minio_data . 2>/dev/null || true

echo "Sao lưu hoàn tất vào thư mục $BACKUP_DIR."
# Dọn dẹp backup cũ hơn 30 ngày
find "$BACKUP_DIR" -type f -mtime +30 -exec rm {} \;
