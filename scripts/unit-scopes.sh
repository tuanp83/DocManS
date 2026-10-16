#!/usr/bin/env bash
# Xem, cấp, gỡ phạm vi đơn vị của một tài khoản trên bản triển khai docker-compose.prod.yml.
#
# Giao diện Quản trị hiện chỉ gán MỘT đơn vị cho mỗi tài khoản, trong khi Ban giám đốc, Trưởng phòng, Phó phòng,
# Trưởng ban và chuyên viên QLKH cần phạm vi nhiều đơn vị (thường là toàn Học viện). Script này là cách tạm thời,
# có ghi nhật ký kiểm toán, cho tới khi giao diện hỗ trợ phạm vi nhiều đơn vị.
#
#   ./scripts/unit-scopes.sh list   <tên đăng nhập>
#   ./scripts/unit-scopes.sh grant  <tên đăng nhập> all                 # mọi đơn vị đang hoạt động
#   ./scripts/unit-scopes.sh grant  <tên đăng nhập> KHQS K1 BV103       # theo mã đơn vị
#   ./scripts/unit-scopes.sh revoke <tên đăng nhập> K2 K3               # gỡ đơn vị (không gỡ đơn vị chính)
#
# Thay đổi có hiệu lực ngay ở thao tác kế tiếp của người dùng (phạm vi được đọc lại mỗi request).
# Kiểm thử với kết nối khác: PSQL_CMD="psql postgresql://..." ./scripts/unit-scopes.sh list admin
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
ACTION="${1:-}"; USERNAME="${2:-}"
[[ "$ACTION" =~ ^(list|grant|revoke)$ && -n "$USERNAME" ]] || usage
shift 2
CODES=("$@")
# ${CODES[@]+...}: mảng rỗng không lỗi "unbound variable" khi set -u trên bash cũ (macOS bash 3.2).
[[ "$ACTION" == "list" || ${#CODES[@]} -gt 0 ]] || usage
for code in ${CODES[@]+"${CODES[@]}"}; do [[ "$code" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "Mã đơn vị không hợp lệ: $code"; exit 1; }; done
[[ "$ACTION" != "revoke" || " ${CODES[*]-} " != *" all "* ]] || { echo "Không gỡ được 'all': liệt kê mã đơn vị cần gỡ."; exit 1; }

if [[ -n "${PSQL_CMD:-}" ]]; then
  # shellcheck disable=SC2206
  PSQL=($PSQL_CMD)
else
  [[ -f "$ENV_FILE" ]] || { echo "Không tìm thấy $ENV_FILE"; exit 1; }
  set -a; source "$ENV_FILE"; set +a
  PSQL=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB")
fi
CODE_LIST="$(IFS=,; echo "${CODES[*]-}")"
OPERATOR="${SUDO_USER:-${USER:-không rõ}}"

# Dữ liệu nhập truyền qua biến psql (:'username', :'codes'), không ghép vào câu SQL.
run_sql() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -X -q -v username="$USERNAME" -v codes="$CODE_LIST" -v operator="$OPERATOR" "$@"; }

if [[ "$ACTION" == "list" ]]; then
  run_sql <<'SQL'
SELECT o.code AS "Mã", o.name AS "Đơn vị", CASE WHEN s.is_primary THEN 'chính' ELSE '' END AS "Loại", o.status AS "Trạng thái"
FROM users u JOIN user_organization_scopes s ON s.user_id = u.id JOIN organization_units o ON o.id = s.organization_unit_id
WHERE u.username_key = lower(:'username') ORDER BY s.is_primary DESC, o.code;
SQL
  exit 0
fi

# Bước 1 (chỉ đọc): tài khoản phải tồn tại; mọi mã đơn vị phải có và đang hoạt động.
CHECK="$(run_sql -t -A <<'SQL'
SELECT (SELECT count(*) FROM users WHERE username_key = lower(:'username'))
  || '|' || coalesce((SELECT string_agg(c, ', ') FROM unnest(string_to_array(:'codes', ',')) AS c
                      WHERE c <> 'all' AND NOT EXISTS (SELECT 1 FROM organization_units o WHERE o.code = c AND o.status = 'active')), '');
SQL
)"
[[ "${CHECK%%|*}" == "1" ]] || { echo "Không tìm thấy tài khoản: $USERNAME"; exit 1; }
[[ -z "${CHECK#*|}" ]] || { echo "Mã đơn vị không tồn tại hoặc đã ngừng hoạt động: ${CHECK#*|}"; exit 1; }

# Bước 2: thay đổi và ghi nhật ký kiểm toán trong cùng một giao dịch.
if [[ "$ACTION" == "grant" ]]; then
  run_sql <<'SQL'
BEGIN;
SELECT id AS user_id FROM users WHERE username_key = lower(:'username') \gset
WITH targets AS (
  SELECT id FROM organization_units
  WHERE status = 'active' AND (:'codes' = 'all' OR code = ANY (string_to_array(:'codes', ',')))
), added AS (
  INSERT INTO user_organization_scopes (id, user_id, organization_unit_id, is_primary)
  SELECT gen_random_uuid()::text, :'user_id', t.id, false FROM targets t
  WHERE NOT EXISTS (SELECT 1 FROM user_organization_scopes s WHERE s.user_id = :'user_id' AND s.organization_unit_id = t.id)
  RETURNING organization_unit_id
)
SELECT count(*) AS changed FROM added \gset
INSERT INTO audit_logs (id, action, username, result, reason, target_entity, target_entity_id)
VALUES (gen_random_uuid()::text, 'grant-unit-scopes', 'ops:' || :'operator', 'success',
        'scripts/unit-scopes.sh grant ' || :'codes' || ' (thêm ' || :'changed' || ' đơn vị)', 'user', :'user_id');
COMMIT;
\echo 'Đã cấp thêm' :changed 'đơn vị cho' :username
SQL
else
  run_sql <<'SQL'
BEGIN;
SELECT id AS user_id FROM users WHERE username_key = lower(:'username') \gset
WITH removed AS (
  DELETE FROM user_organization_scopes s USING organization_units o
  WHERE s.organization_unit_id = o.id AND s.user_id = :'user_id' AND NOT s.is_primary
    AND o.code = ANY (string_to_array(:'codes', ','))
  RETURNING s.id
)
SELECT count(*) AS changed FROM removed \gset
INSERT INTO audit_logs (id, action, username, result, reason, target_entity, target_entity_id)
VALUES (gen_random_uuid()::text, 'revoke-unit-scopes', 'ops:' || :'operator', 'success',
        'scripts/unit-scopes.sh revoke ' || :'codes' || ' (gỡ ' || :'changed' || ' đơn vị; đơn vị chính được giữ)', 'user', :'user_id');
COMMIT;
\echo 'Đã gỡ' :changed 'đơn vị khỏi' :username '(đơn vị chính được giữ)'
SQL
fi
"$0" list "$USERNAME"
