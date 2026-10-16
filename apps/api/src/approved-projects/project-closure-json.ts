import type { AcceptanceMemberInput } from "../proposal-evaluations/acceptance-council.js";

/**
 * Cấu trúc các cột JSON của nghiệm thu đề tài. Dữ liệu được ghi qua các hàm đọc đầu vào của
 * ProjectClosureService (readDossier, readChecklist, resolveCouncilMembers...), nên đọc lại có đúng cấu trúc này;
 * các hàm read* bên dưới chỉ phòng dữ liệu cũ hoặc rỗng.
 */

/** Hồ sơ nghiệm thu chủ nhiệm nộp (ProjectAcceptance.dossier). */
export type AcceptanceDossier = {
  finalReportSummary: string;
  products: string;
  selfAssessment: string;
  evidenceFileIds: string[];
  submittedAt?: string;
};

/** Một lần nộp bản hoàn thiện trước đó, giữ lại khi nộp lần mới. */
export type RevisionDossierEntry = { finalReportSummary?: string; evidenceFileIds: string[]; submittedAt: string | null; returnNote: string | null };

/** Bản hoàn thiện sau nghiệm thu (ProjectAcceptance.revisionDossier): lần mới nhất + các lần trước + mọi tệp đã khoá. */
export type RevisionDossier = AcceptanceDossier & { previous?: RevisionDossierEntry[]; allEvidenceFileIds?: string[] };

/** Thành viên hội đồng nghiệm thu (ProjectAcceptance.councilMembers), lấy từ hồ sơ nhà khoa học. */
export type AcceptanceCouncilMember = { profileId: string; fullName: string; academicTitle?: string; unit?: string; userId?: string; role: AcceptanceMemberInput["role"] };

/** Một mục hồ sơ đề nghị cấp trên nghiệm thu (ProjectSuperiorAcceptance.checklist). */
export type SuperiorChecklistItem = { id: string; title: string; done: boolean; fileIds: string[]; note: string | null };

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function readRevisionDossier(value: unknown): RevisionDossier | null {
  return isObject(value) ? (value as RevisionDossier) : null;
}

export function readCouncilMembers(value: unknown): AcceptanceCouncilMember[] {
  return Array.isArray(value) ? (value as AcceptanceCouncilMember[]) : [];
}

export function readChecklist(value: unknown): SuperiorChecklistItem[] {
  return Array.isArray(value) ? (value as SuperiorChecklistItem[]) : [];
}

/** Danh sách mã tệp lưu dạng JSON; giá trị không phải mảng coi như rỗng. */
export function readStoredFileIds(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}
