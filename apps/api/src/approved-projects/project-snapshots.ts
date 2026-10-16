/**
 * Ảnh chụp phạm vi đề tài lúc phê duyệt (cột JSON `ApprovedProject.scopeSnapshot`), chép từ hồ sơ đề xuất
 * và được ghép thêm khi đề nghị điều chỉnh phạm vi được duyệt. Dữ liệu cũ có thể thiếu trường, nên mọi trường là tuỳ chọn.
 */
export type ScopeSnapshot = {
  title?: unknown;
  objectives?: unknown;
  summary?: unknown;
  researchFieldCode?: unknown;
  /** Cấp đề tài (cấp Học viện, cấp Bộ...): quyết định có nghiệm thu cấp trên hay không. */
  proposalTypeCode?: unknown;
  budgetMetadata?: unknown;
  /** Không ghi khi tạo đề tài; dashboard đọc thử rồi lấy từ hồ sơ đề xuất gốc nếu thiếu. */
  militaryScope?: unknown;
};

/** Đọc ảnh chụp phạm vi; giá trị không phải object coi như rỗng. */
export function readScopeSnapshot(value: unknown): ScopeSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ScopeSnapshot) : {};
}
