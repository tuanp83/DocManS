#!/bin/sh
# Khởi tạo MinIO cho DocManS: bucket, chính sách giới hạn trong bucket và tài khoản riêng cho API.
# Chạy trong service `minio-init` của docker-compose.prod.yml (image MinIO, có sẵn `mc`) mỗi lần khởi
# động stack. Idempotent: chạy lại không tạo trùng, chỉ cập nhật chính sách và mật khẩu theo .env.
#
# API dùng MINIO_APP_ACCESS_KEY thay cho tài khoản root: nếu API bị chiếm quyền, kẻ tấn công chỉ đọc/ghi
# được bucket của hệ thống, không quản trị được MinIO. Image không có grep nên chỉ dùng lệnh shell thuần.
set -eu

: "${MINIO_ROOT_USER:?thiếu MINIO_ROOT_USER}"
: "${MINIO_ROOT_PASSWORD:?thiếu MINIO_ROOT_PASSWORD}"
: "${MINIO_BUCKET_NAME:?thiếu MINIO_BUCKET_NAME}"
: "${MINIO_APP_ACCESS_KEY:?thiếu MINIO_APP_ACCESS_KEY}"
: "${MINIO_APP_SECRET_KEY:?thiếu MINIO_APP_SECRET_KEY}"
MINIO_URL="${MINIO_URL:-http://minio:9000}"
POLICY="docmans-app"

if [ "$MINIO_APP_ACCESS_KEY" = "$MINIO_ROOT_USER" ]; then
  echo "MINIO_APP_ACCESS_KEY phải khác MINIO_ROOT_USER." >&2
  exit 1
fi

mc alias set docmans "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "docmans/$MINIO_BUCKET_NAME"

# Chỉ bucket của hệ thống: liệt kê/định vị bucket và đọc/ghi/xoá object trong bucket đó.
cat > /tmp/docmans-app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetBucketLocation", "s3:ListBucket"], "Resource": ["arn:aws:s3:::${MINIO_BUCKET_NAME}"] },
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": ["arn:aws:s3:::${MINIO_BUCKET_NAME}/*"] }
  ]
}
EOF
mc admin policy create docmans "$POLICY" /tmp/docmans-app-policy.json
mc admin user add docmans "$MINIO_APP_ACCESS_KEY" "$MINIO_APP_SECRET_KEY"

# Chỉ xét trường policyName (accessKey có thể trùng tên chính sách).
USER_INFO="$(mc admin user info docmans "$MINIO_APP_ACCESS_KEY" --json)"
case "$USER_INFO" in
  *'"policyName":"'*"$POLICY"*) echo "Chính sách $POLICY đã gắn với tài khoản ứng dụng." ;;
  *) mc admin policy attach docmans "$POLICY" --user "$MINIO_APP_ACCESS_KEY" ;;
esac

echo "MinIO sẵn sàng: bucket $MINIO_BUCKET_NAME, tài khoản ứng dụng có quyền giới hạn."
