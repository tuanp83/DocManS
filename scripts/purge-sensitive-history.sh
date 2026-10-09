#!/usr/bin/env bash
# Xoá vĩnh viễn dữ liệu nhạy cảm khỏi TOÀN BỘ lịch sử git rồi force-push lên GitHub.
#
# Việc `git rm` ở commit mới chỉ gỡ file khỏi phiên bản hiện tại; ai cũng vẫn tải được bản cũ
# từ lịch sử. Script này viết lại lịch sử để các file đó biến mất ở mọi commit.
#
# CẢNH BÁO — đọc kỹ trước khi chạy:
#   * Mọi mã commit (SHA) sẽ thay đổi. Mọi người đang có bản clone phải clone lại
#     (hoặc `git fetch && git reset --hard origin/DocManS`), nếu không sẽ đẩy dữ liệu cũ lên lại.
#   * Pull request đang mở sẽ hỏng; nên merge/đóng hết trước khi chạy.
#   * Repo gốc thanhdotien278/DocManS và các fork khác CŨNG chứa các file này;
#     chủ repo đó phải tự chạy lại quy trình tương tự.
#   * GitHub có thể vẫn giữ bản cache và các ref refs/pull/*; sau khi chạy, liên hệ
#     GitHub Support (mục "Removing sensitive data") để xoá hẳn.
#
# Yêu cầu: git-filter-repo (macOS: `brew install git-filter-repo`; Linux: `pip install git-filter-repo`).
#
# Cách dùng:
#   ./scripts/purge-sensitive-history.sh https://github.com/tuanp83/DocManS.git
set -euo pipefail

REPO_URL="${1:?Cách dùng: $0 <URL repo GitHub>}"
WORK_DIR="$(mktemp -d)/docmans-purge.git"

command -v git-filter-repo >/dev/null 2>&1 || {
  echo "Thiếu git-filter-repo. Cài: brew install git-filter-repo  (hoặc pip install git-filter-repo)"; exit 1;
}

echo "1/5 Clone dạng mirror (toàn bộ nhánh, tag) vào $WORK_DIR ..."
git clone --mirror "$REPO_URL" "$WORK_DIR"
cd "$WORK_DIR"

echo "2/5 Xoá các thư mục nội bộ khỏi mọi commit ..."
git filter-repo --force \
  --invert-paths \
  --path reports/ \
  --path output/ \
  --path tmp/ \
  --path backups/

echo "3/5 Thay các số định danh mẫu giống CCCD trong mọi phiên bản file ..."
REPLACEMENTS="$(mktemp)"
cat > "$REPLACEMENTS" <<'EOF'
DEMO-ID-0001==>DEMO-ID-0001
DEMO-ID-0002==>DEMO-ID-0002
EOF
git filter-repo --force --replace-text "$REPLACEMENTS"

echo "4/5 Kiểm tra lại: không còn file nào trong các thư mục đã xoá ..."
if git log --all --name-only --format= | grep -E '^(reports|output|tmp|backups)/' | head -1 | grep -q .; then
  echo "Vẫn còn file trong lịch sử — dừng lại, không push."; exit 1
fi
echo "   Sạch."

echo
echo "Kích thước sau khi làm sạch: $(du -sh . | cut -f1)"
read -r -p "5/5 Force-push lịch sử mới lên $REPO_URL? Gõ 'DAY LEN' để tiếp tục: " answer
[[ "$answer" == "DAY LEN" ]] || { echo "Đã huỷ. Bản đã làm sạch vẫn nằm ở $WORK_DIR."; exit 1; }

# filter-repo gỡ remote để tránh push nhầm; thêm lại rồi đẩy mọi nhánh và tag.
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git push --force --mirror origin

cat <<'EOF'

Đã đẩy lịch sử mới. Việc còn lại:
  1. Trên mọi máy đang có repo: clone lại (cách an toàn nhất), hoặc
       git fetch origin && git reset --hard origin/DocManS
     và xoá file patch/zip cũ có chứa dữ liệu.
  2. Báo chủ repo thanhdotien278/DocManS và các fork làm sạch tương tự.
  3. Liên hệ GitHub Support để xoá cache và refs/pull/* còn giữ dữ liệu cũ.
  4. Nếu thuyết minh đề tài là của người khác, thông báo cho họ biết tài liệu đã từng công khai.
EOF
