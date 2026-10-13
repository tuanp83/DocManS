#!/usr/bin/env bash
# Cảnh báo chứng chỉ TLS sắp hết hạn (dùng được cho cả Let's Encrypt lẫn chứng chỉ CA nội bộ chép tay).
#
#   ./scripts/check-cert-expiry.sh                       # mặc định nginx/ssl/fullchain.pem, cảnh báo khi < 21 ngày
#   CERT_WARN_DAYS=30 ./scripts/check-cert-expiry.sh /đường/dẫn/fullchain.pem
#
# Đặt lịch (cron, 08:00 hằng ngày); mã thoát khác 0 để cron/giám sát gửi cảnh báo:
#   0 8 * * * cd /opt/docmans && ./scripts/check-cert-expiry.sh >> /var/log/docmans-cert.log 2>&1
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT="${1:-$SCRIPT_DIR/../nginx/ssl/fullchain.pem}"
WARN_DAYS="${CERT_WARN_DAYS:-21}"

log() { echo "[$(date '+%F %T')] $*"; }

[[ -s "$CERT" ]] || { log "LỖI: không tìm thấy chứng chỉ $CERT"; exit 2; }
END_DATE="$(openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)"
SUBJECT="$(openssl x509 -subject -noout -in "$CERT")"

if openssl x509 -checkend $((WARN_DAYS * 86400)) -noout -in "$CERT" >/dev/null; then
  log "OK: $SUBJECT còn hạn tới $END_DATE"
else
  log "CẢNH BÁO: $SUBJECT hết hạn trong dưới $WARN_DAYS ngày ($END_DATE). Gia hạn rồi chờ nginx reload (≤ 6 giờ) hoặc chạy: docker compose -f docker-compose.prod.yml --env-file .env.production exec nginx nginx -s reload"
  exit 1
fi
