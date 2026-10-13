#!/usr/bin/env bash
# Quản lý image MinIO của DocManS. MinIO đã ngừng phát hành image công khai: không kéo được từ quay.io hay
# Docker Hub nữa. Hệ thống dùng một bản đã kiểm thử, lưu dưới tên cố định docmans.local/minio:<phiên bản>
# (tiền tố docmans.local không bao giờ trỏ ra Docker Hub, tránh kéo nhầm image trùng tên của người khác).
#
#   ./scripts/minio-image.sh export [thư mục]     # máy đang có image: đóng gói .tar.gz + .sha256 (mặc định ./artifacts)
#   ./scripts/minio-image.sh load <file.tar.gz>    # máy chủ: kiểm tra checksum + dấu vân tay rồi nạp
#   ./scripts/minio-image.sh push <registry>       # đẩy lên registry nội bộ, in dòng MINIO_IMAGE cho .env.production
#   ./scripts/minio-image.sh verify                # kiểm tra image hiện có đúng bản đã kiểm thử
#
# Dấu vân tay cố định bên dưới (sha256 của danh sách digest các lớp, RootFS.Layers) xác định bản đã kiểm
# thử: load/verify từ chối mọi image khác. Không dùng image ID vì ID khác nhau giữa kho containerd (Docker
# Desktop) và kho cổ điển (máy chủ Linux) dù cùng một image.
set -Eeuo pipefail

VERSION="RELEASE.2025-09-07T16-13-09Z"
EXPECTED_LAYERS="e49b4a61091b2676a2af27af655e12c4e5eec165d605c5efb68424c8d157f487"
EXPECTED_ARCH="amd64"
IMAGE="docmans.local/minio:$VERSION"
# Tên gốc mà các máy đã từng kéo trước khi MinIO ngừng phát hành (chỉ dùng để tìm image cho lệnh export).
UPSTREAM_CANDIDATES=("$IMAGE" "quay.io/minio/minio:$VERSION" "quay.io/minio/minio:latest" "minio/minio:$VERSION" "minio/minio:latest")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE_NAME="minio-$VERSION-$EXPECTED_ARCH.tar.gz"

log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "LỖI: $*"; exit 1; }

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

layers_fingerprint() {
  docker image inspect "$1" --format '{{json .RootFS.Layers}}' 2>/dev/null | sha256 | cut -d' ' -f1 || true
}

is_expected() {
  docker image inspect "$1" >/dev/null 2>&1 && [[ "$(layers_fingerprint "$1")" == "$EXPECTED_LAYERS" ]]
}

assert_expected() {
  local ref="$1" fingerprint arch version
  docker image inspect "$ref" >/dev/null 2>&1 || fail "Không có image $ref trên máy này."
  fingerprint="$(layers_fingerprint "$ref")"
  [[ "$fingerprint" == "$EXPECTED_LAYERS" ]] || fail "$ref có dấu vân tay $fingerprint, khác bản đã kiểm thử $EXPECTED_LAYERS."
  arch="$(docker image inspect "$ref" --format '{{.Architecture}}')"
  [[ "$arch" == "$EXPECTED_ARCH" ]] || fail "$ref là $arch, cần $EXPECTED_ARCH."
  version="$(docker image inspect "$ref" --format '{{index .Config.Labels "version"}}')"
  [[ "$version" == "$VERSION" ]] || fail "$ref có nhãn phiên bản $version, cần $VERSION."
}

case "${1:-}" in
  export)
    OUT_DIR="${2:-$PROJECT_DIR/artifacts}"
    source_ref=""
    for candidate in "${UPSTREAM_CANDIDATES[@]}"; do
      if is_expected "$candidate"; then source_ref="$candidate"; break; fi
    done
    [[ -n "$source_ref" ]] || fail "Máy này không có image MinIO $VERSION (dấu vân tay $EXPECTED_LAYERS)."
    docker tag "$source_ref" "$IMAGE"
    assert_expected "$IMAGE"
    mkdir -p "$OUT_DIR"
    log "Đóng gói $IMAGE (từ $source_ref) vào $OUT_DIR/$ARCHIVE_NAME ..."
    docker save "$IMAGE" | gzip -6 > "$OUT_DIR/$ARCHIVE_NAME"
    ( cd "$OUT_DIR" && sha256 "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256" )
    log "Hoàn tất: $(du -h "$OUT_DIR/$ARCHIVE_NAME" | cut -f1). Chép CẢ HAI file .tar.gz và .sha256 lên máy chủ, rồi chạy: $0 load $ARCHIVE_NAME"
    ;;
  load)
    ARCHIVE="${2:?Cách dùng: $0 load <file.tar.gz>}"
    [[ -f "$ARCHIVE" && -f "$ARCHIVE.sha256" ]] || fail "Cần cả $ARCHIVE và $ARCHIVE.sha256."
    log "Kiểm tra checksum..."
    ( cd "$(dirname "$ARCHIVE")" && sha256 -c "$(basename "$ARCHIVE").sha256" )
    log "Nạp image..."
    gunzip -c "$ARCHIVE" | docker load
    assert_expected "$IMAGE"
    log "Đã nạp $IMAGE (đúng bản đã kiểm thử)."
    ;;
  push)
    REGISTRY="${2:?Cách dùng: $0 push <registry, vd. registry.hvqy.edu.vn>}"
    assert_expected "$IMAGE"
    TARGET="$REGISTRY/docmans/minio:$VERSION"
    docker tag "$IMAGE" "$TARGET"
    docker push "$TARGET"
    log "Đã đẩy. Thêm vào .env.production: MINIO_IMAGE=$TARGET"
    ;;
  verify)
    assert_expected "$IMAGE"
    log "OK: $IMAGE đúng bản đã kiểm thử ($VERSION, $EXPECTED_ARCH, dấu vân tay $EXPECTED_LAYERS)."
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
