#!/usr/bin/env bash
# Cấp chứng chỉ Let's Encrypt lần đầu cho SERVER_NAME rồi bật gia hạn tự động (service certbot).
# Chỉ dùng khi tên miền trỏ về máy chủ và cổng 80 truy cập được từ Internet. Tên miền nội bộ không ra
# Internet: dùng chứng chỉ CA nội bộ chép vào nginx/ssl (nginx tự nhận khi reload 6 giờ một lần) và đặt
# lịch scripts/check-cert-expiry.sh.
#
#   ./scripts/letsencrypt-init.sh            # dùng .env.production (cần SERVER_NAME, LETSENCRYPT_EMAIL)
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
SSL_DIR="$PROJECT_DIR/nginx/ssl"

log() { echo "[$(date '+%F %T')] $*"; }
trap 'log "LỖI: dừng ở dòng $LINENO"' ERR

[[ -f "$ENV_FILE" ]] || { log "Không tìm thấy $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${SERVER_NAME:?thiếu SERVER_NAME trong $ENV_FILE}"
: "${LETSENCRYPT_EMAIL:?thiếu LETSENCRYPT_EMAIL trong $ENV_FILE}"
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

mkdir -p "$SSL_DIR" "$PROJECT_DIR/certbot/www" "$PROJECT_DIR/certbot/conf"

# nginx cần sẵn một cặp chứng chỉ để khởi động; lần đầu dùng chứng chỉ tự ký 1 ngày, được thay ngay sau đó.
if [[ ! -s "$SSL_DIR/fullchain.pem" || ! -s "$SSL_DIR/privkey.pem" ]]; then
  log "Tạo chứng chỉ tạm (tự ký, 1 ngày) để nginx khởi động..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=$SERVER_NAME" \
    -keyout "$SSL_DIR/privkey.pem" -out "$SSL_DIR/fullchain.pem" >/dev/null 2>&1
  chmod 600 "$SSL_DIR/privkey.pem"
fi

log "Khởi động nginx (và các service nó phụ thuộc)..."
compose up -d nginx

log "Xin chứng chỉ Let's Encrypt cho $SERVER_NAME (xác thực qua http://$SERVER_NAME/.well-known/acme-challenge/)..."
compose --profile letsencrypt run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot -d "$SERVER_NAME" \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive \
  --deploy-hook 'cp -L "$RENEWED_LINEAGE/fullchain.pem" "$RENEWED_LINEAGE/privkey.pem" /ssl/'

log "Nạp chứng chỉ mới vào nginx..."
compose exec nginx nginx -s reload

log "Bật gia hạn tự động..."
compose --profile letsencrypt up -d certbot
"$SCRIPT_DIR/check-cert-expiry.sh"
log "Hoàn tất."
