const WHOLE: Record<string, string> = {
  "project.created": "Lập đề tài",
  "project.close": "Đóng đề tài"
};

const SUBJECTS: Record<string, string> = {
  report: "Báo cáo tiến độ",
  adjustment: "Đề nghị điều chỉnh",
  extension: "Đề nghị gia hạn",
  setup: "Thiết lập đề tài",
  officer: "Chuyên viên phụ trách",
  evidence: "Minh chứng",
  acceptance: "Nghiệm thu",
  liquidation: "Thanh lý",
  product: "Sản phẩm",
  superior: "Nghiệm thu cấp trên",
  finance: "Kinh phí",
  health: "Mức sức khoẻ",
  progress: "Tiến độ mốc",
  member: "Thành viên",
  milestone: "Mốc tiến độ"
};

const VERBS: Record<string, string> = {
  create: "tạo",
  draft: "lưu nháp",
  "edit-draft": "sửa bản nháp",
  submit: "nộp",
  review: "bắt đầu xem xét",
  accept: "chấp nhận",
  approve: "phê duyệt",
  reject: "từ chối",
  "request-supplement": "yêu cầu bổ sung",
  validate: "kiểm tra hành chính",
  prepare: "trình lãnh đạo",
  configure: "cấu hình",
  confirm: "xác nhận",
  assign: "phân công",
  revoke: "thu hồi",
  contribute: "đóng góp",
  upload: "tải lên",
  metadata: "sửa mô tả",
  delete: "xoá",
  update: "cập nhật",
  assess: "đánh giá",
  return: "trả lại",
  manage: "cập nhật",
  backfill: "chuyển dữ liệu cũ"
};

/** Nhãn tiếng Việt cho mã hành động trong lịch sử đề tài (vd. "project.report.submit" → "Báo cáo tiến độ: nộp"). */
export function projectHistoryLabel(action: string) {
  if (WHOLE[action]) return WHOLE[action];
  const [, subject, ...rest] = action.split(".");
  const verb = rest.at(-1);
  const subjectLabel = subject ? SUBJECTS[subject] : undefined;
  const verbLabel = verb ? VERBS[verb] : undefined;
  if (!subjectLabel) return action;
  return verbLabel ? `${subjectLabel}: ${verbLabel}` : subjectLabel;
}
