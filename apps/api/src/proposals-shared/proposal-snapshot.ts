/** Thành viên trong ảnh chụp hồ sơ (dạng trả về của ResearchProposalsService.toMemberResponse). */
export type ProposalSnapshotMember = {
  id?: string;
  name?: string;
  role?: string;
  organization?: string | null;
  userId?: string;
  participationRole?: string;
  status?: string;
};

/**
 * Ảnh chụp hồ sơ đề xuất tại một lần nộp (cột JSON `ProposalSubmissionEvent.snapshot`), đã JSON hoá nên ngày là chuỗi ISO.
 * Bản ghi "kiểm tra đầy đủ" dùng cùng cột nhưng có `kind` và không phải ảnh chụp hồ sơ.
 */
export type ProposalSubmissionSnapshot = {
  kind?: string;
  id: string;
  ownerId: string;
  title: string;
  hostOrganizationUnitId?: string;
  researchFieldCode?: string | null;
  proposalTypeCode?: string | null;
  objectives?: string | null;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budgetMetadata?: unknown;
  members: ProposalSnapshotMember[];
  attachments?: unknown[];
  requiredPackage?: unknown;
  deliverables?: unknown[];
};

/** Đọc ảnh chụp từ cột JSON; giá trị không phải object trả về null. */
export function readProposalSnapshot(value: unknown): ProposalSubmissionSnapshot | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ProposalSubmissionSnapshot) : null;
}
