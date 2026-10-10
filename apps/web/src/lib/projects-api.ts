import { getApiBaseUrl } from "@/lib/session";
import { isViewerAuthorizationV1, type PermissionActionV1, type ViewerAuthorizationV1 } from "@rtms/permissions";

export type ProjectRecord = {
  id: string; code?: string | null; proposalId: string; title: string; status: string; startDate: string | null; endDate: string | null;
  scope: Record<string, unknown>; plan: Record<string, unknown> | null;
  hostOrganizationUnit?: { name: string }; officer?: { officerUserId: string; officerName?: string | null } | null;
  members: Array<{ id: string; name: string; participationRole: string; status: string; userId?: string }>;
  milestones: Array<{ id: string; title: string; dueDate: string; isImportant: boolean; status: string; responsibleMemberId?: string | null; weightPercent?: number | null; progressPercent?: number; plannedStartDate?: string | null; completedAt?: string | null }>;
  checkpoints: Array<{ id: string; title: string; dueDate: string; status: string }>;
  reports: Array<{ id: string; revision: number; status: string; checkpointId?: string; reportingPeriodStart?: string; reportingPeriodEnd?: string; progressResults?: string; issuesRecommendations?: string; reviewReason?: string; responseDeadline?: string; evidence?: Array<{ id: string; fileRecordId: string; file?: { originalFileName: string } }> }>;
  requests: Array<{ id: string; requestType: "adjustment" | "extension"; status: string; revision?: number; reason?: string; proposedValues?: Record<string, unknown>; decisionNote?: string; responseDeadline?: string; evidence?: Array<{ id: string; fileRecordId: string; file?: { originalFileName: string } }> }>;
  history: Array<{ id: string; action: string; reason?: string; createdAt: string }>;
  overdue: boolean; approaching: boolean; nearestDeadline: string | null; viewerAuthorization: ViewerAuthorizationV1;
  progressSummary?: ProjectProgressSummary;
  closedAt?: string | null;
  closureNote?: string | null;
  acceptances?: ProjectAcceptance[];
  finance?: { totalBudget: number; totalDisbursed: number; totalSettled: number; settlementStatus: string; version: number; updatedAt: string | null } | null;
  liquidation?: ProjectLiquidation | null;
};

export type AcceptanceMemberRole = "CHAIRMAN" | "SECRETARY" | "REVIEWER_1" | "REVIEWER_2" | "MEMBER";
export type AcceptanceCouncilMember = { profileId: string; fullName: string; academicTitle?: string; unit?: string; userId?: string; role: AcceptanceMemberRole };
export type AcceptanceEvaluationResult = {
  reportScore: number; scientificProductsScore: number; trainingProductsScore: number; militaryMedicalPracticalScore: number;
  totalScore: number; classification: "EXCELLENT" | "PASSED" | "FAILED"; assessmentComments: string;
};
export type AcceptanceDossier = { finalReportSummary?: string; products?: string; selfAssessment?: string; evidenceFileIds?: string[]; submittedAt?: string; legacy?: boolean };
export type ProjectAcceptance = {
  id: string; round: number; status: string; statusLabel: string; dossier: AcceptanceDossier; revisionDossier: AcceptanceDossier | null; returnReason: string | null;
  councilType: "FACILITY" | "OFFICIAL" | null; councilMembers: AcceptanceCouncilMember[]; meetingDate: string | null; meetingLocation: string | null; tentativeAgenda: string | null;
  decisionNumber: string | null; decisionDate: string | null; evaluationResult: AcceptanceEvaluationResult | null; resolution: "approved" | "revise" | "rejected" | null;
  minutesNotes: string | null; revisionNote: string | null; legacy: boolean; submittedBy: string | null; establishedBy: string | null; minutesRecordedBy: string | null;
  submittedAt: string | null; councilProposedAt: string | null; establishedAt: string | null; evaluatedAt: string | null; completedAt: string | null;
};
export type ProjectLiquidation = {
  status: "DRAFT" | "APPROVED"; outcome: "accepted" | "failed"; liquidationNumber: string | null; liquidationDate: string | null;
  approvedBudget: number; totalDisbursed: number; totalSettled: number; recoveredAmount: number; outstanding: number;
  productsHandedOver: string | null; notes: string | null; evidenceFileIds: string[]; preparedBy: string | null; preparedAt: string | null; approvedBy: string | null; approvedAt: string | null;
};
export type CouncilCandidate = { profileId: string; fullName: string; academicTitle: string; unit: string; userId: string | null; isConflicted: boolean; conflictReason: string | null };

// Kinh phí, giải ngân theo đợt (gắn với đề tài) --------------------------------------------------
export type MilestoneAttachment = { id: string; fileName: string; fileSize?: number; uploadedAt: string; uploadedByName?: string };
export type DisbursementMilestone = {
  id: string; name: string; percentage: number; expectedAmount: number; disbursedAmount: number; status: "PENDING" | "DISBURSED" | "SETTLED";
  disbursedDate?: string; settledDate?: string; evidenceNotes?: string; attachments?: MilestoneAttachment[]; projectMilestoneId?: string;
};
export type DisbursementCostItem = { code: string; name: string; allocatedAmount: number; spentAmount: number; settledAmount: number };
export type DisbursementMetadata = {
  totalBudget: number; totalDisbursed: number; totalSettled: number; settlementStatus: "PENDING" | "PARTIALLY_SETTLED" | "COMPLETED";
  milestones: DisbursementMilestone[]; costItems: DisbursementCostItem[]; notes?: string; lastUpdatedBy?: string; lastUpdatedAt?: string; version: number;
};
export type ProjectFinanceResponse = {
  projectId: string; disbursement: DisbursementMetadata; projectMilestones: Array<{ id: string; title: string; dueDate: string | null; status: string }>;
  canManage: boolean; manageDeniedReason: string | null; contextVersion: unknown;
};

export type HealthLevel = "green" | "amber" | "red";

export type ProjectProgressSummary = {
  plannedPercent: number; actualPercent: number; spi: number | null; maxDaysOverdue: number; overdueMilestones: number; lateReports: number;
  computedLevel: HealthLevel | null; level: HealthLevel | null; levelSource: "computed" | "assessment" | "not_applicable"; needsReassessment: boolean; reasons: string[];
};

export type MilestoneProgressRow = {
  id: string; title: string; status: string; weightPercent: number; progressPercent: number; currentDueDate: string;
  baselineDueDate: string | null; originalDueDate: string | null; completedAt: string | null; slipDays: number | null; overdueDays: number;
};

export type ProjectProgress = {
  projectId: string; status: string; asOf: string; applicable: boolean; weightsConfigured: boolean; baselineVersion: number | null; baselineMissing: boolean;
  plannedPercent: number; actualPercent: number; spi: number | null; maxDaysOverdue: number; overdueMilestones: number; lateReports: number; endDatePassed: boolean;
  level: HealthLevel | null; reasons: string[]; milestones: MilestoneProgressRow[];
  effectiveLevel: HealthLevel | null; levelSource: "computed" | "assessment" | "not_applicable"; needsReassessment: boolean;
  baselines: Array<{ id: string; version: number; source: string; startDate: string | null; endDate: string | null; milestoneCount: number; createdAt: string | null }>;
  assessments: Array<{ id: string; level: HealthLevel; computedLevel: HealthLevel | null; reason: string | null; assessedBy: string | null; createdAt: string | null }>;
  updates: Array<{ id: string; milestoneId: string; milestoneTitle: string | null; previousPercent: number; progressPercent: number; note: string | null; author: string | null; createdAt: string | null }>;
  updatableMilestoneIds: string[];
  viewerAuthorization: ViewerAuthorizationV1;
};

export const HEALTH_LABELS: Record<HealthLevel, string> = { green: "Đúng tiến độ", amber: "Cần chú ý", red: "Chậm tiến độ" };
export const HEALTH_TONES: Record<HealthLevel, "success" | "warning" | "danger"> = { green: "success", amber: "warning", red: "danger" };
export const BASELINE_SOURCE_LABELS: Record<string, string> = { setup: "Thiết lập ban đầu", adjustment: "Điều chỉnh", extension: "Gia hạn", backfill: "Ghi nhận từ dữ liệu cũ" };

/** Nhãn tiếng Việt cho trạng thái đề tài, báo cáo và yêu cầu (giá trị nội bộ giữ như nhánh chính). */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  preparing: "Chuẩn bị triển khai",
  executing: "Đang thực hiện",
  paused: "Tạm dừng",
  pending_acceptance: "Chờ nghiệm thu",
  accepted: "Đã nghiệm thu",
  failed: "Không đạt",
  closed: "Đã đóng",
  draft: "Bản nháp",
  submitted: "Đã nộp",
  under_review: "Đang xem xét",
  supplement_requested: "Yêu cầu bổ sung",
  under_staff_review: "Chuyên viên đang xem xét",
  under_staff_validation: "Chuyên viên đang thẩm định",
  ready_for_head_decision: "Chờ lãnh đạo quyết định",
  approved: "Đã phê duyệt",
  rejected: "Từ chối",
  DRAFT: "Dự thảo",
  APPROVED: "Đã phê duyệt",
  open: "Đang mở",
  completed: "Hoàn thành"
};

export function projectStatusLabel(status?: string | null) {
  return status ? PROJECT_STATUS_LABELS[status] ?? status : "";
}

export function projectCapability(project: ProjectRecord) {
  const value = project.viewerAuthorization;
  return isViewerAuthorizationV1(value) && value.contextVersion.domain === "approved-project" && value.contextVersion.recordId === project.id ? value : null;
}

export function canProject(project: ProjectRecord, action: PermissionActionV1) { return !!projectCapability(project)?.allowedActions.includes(action); }
export function projectDenial(project: ProjectRecord, action: PermissionActionV1) { return projectCapability(project)?.blockedActions.find((item) => item.action === action)?.reason ?? "Quyền thao tác chưa được xác minh. Vui lòng tải lại."; }

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Không thể xử lý thao tác đề tài.");
  return body as T;
}

export async function listProjects(filters?: { overdue?: boolean; approaching?: boolean; health?: HealthLevel }) {
  const query = new URLSearchParams();
  if (filters?.health) query.set("health", filters.health);
  if (filters?.overdue !== undefined) query.set("overdue", String(filters.overdue));
  if (filters?.approaching !== undefined) query.set("approaching", String(filters.approaching));
  const result = await json<{ projects: ProjectRecord[] }>(`/projects${query.size ? `?${query}` : ""}`);
  return result.projects;
}

export async function getProject(id: string) { return (await json<{ project: ProjectRecord }>(`/projects/${id}`)).project; }
export async function getProjectProgress(id: string) { return (await json<{ progress: ProjectProgress }>(`/projects/${id}/progress`)).progress; }
export async function createProject(proposalId: string, contextVersion: unknown) { return json<{ project: { id: string } }>("/projects", { method: "POST", body: JSON.stringify({ proposalId, contextVersion }) }); }
export async function projectOfficerCandidates(id: string) { return (await json<{ users: Array<{ id: string; displayName: string; username: string }> }>(`/projects/${id}/officer-candidates`)).users; }
export async function projectAction(id: string, path: string, body: Record<string, unknown>, method = "POST") { return json<Record<string, unknown>>(`/projects/${id}/${path}`, { method, body: JSON.stringify(body) }); }

export async function uploadProjectFile(project: ProjectRecord, file: File, purpose = "PROJECT_EVIDENCE") {
  const capability = projectCapability(project);
  if (!capability) throw new Error("Ngữ cảnh quyền không hợp lệ. Vui lòng tải lại.");
  const form = new FormData();
  form.set("file", file);
  form.set("relatedEntityType", "approved_project");
  form.set("relatedEntityId", project.id);
  form.set("filePurpose", purpose);
  form.set("contextVersion", JSON.stringify(capability.contextVersion));
  const response = await fetch(`${getApiBaseUrl()}/files`, { method: "POST", credentials: "include", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.file?.id) throw new Error(typeof body.message === "string" ? body.message : "Không thể tải minh chứng.");
  return body.file as { id: string; fileName: string };
}

export async function getProjectFinance(id: string) { return json<ProjectFinanceResponse>(`/projects/${id}/finance`); }
export async function updateProjectFinance(id: string, body: { milestones: DisbursementMilestone[]; costItems: DisbursementCostItem[]; settlementStatus: DisbursementMetadata["settlementStatus"]; notes: string; financeVersion: number; contextVersion: unknown }) {
  return json<{ projectId: string; disbursement: DisbursementMetadata }>(`/projects/${id}/finance`, { method: "PUT", body: JSON.stringify(body) });
}
export async function acceptanceCandidates(id: string) { return (await json<{ candidates: CouncilCandidate[] }>(`/projects/${id}/acceptance/candidates`)).candidates; }

export function projectFileUrl(fileId: string) { return `${getApiBaseUrl()}/files/${fileId}/download`; }
export async function listProjectFiles(id: string) { return (await json<{ files: Array<{ id: string; fileName: string; uploadedById: string; filePurpose?: string }> }>(`/files?relatedEntityType=approved_project&relatedEntityId=${encodeURIComponent(id)}`)).files; }
