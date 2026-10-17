import { apiRequest } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/session";
import type { RequiredPackageItem } from "@/lib/proposal-intake-periods-api";
import { isViewerAuthorizationV1, type BlockedActionV1, type PermissionActionV1, type ViewerAuthorizationV1 } from "@rtms/permissions";

/** Record-scoped participation role codes returned by the API. */
export type ProposalParticipationRole = "PROPOSAL_PI" | "TOPIC_SECRETARY" | "TOPIC_MEMBER" | "none" | "unknown";
export type ProposalTeamRole = "TOPIC_SECRETARY" | "TOPIC_MEMBER";

export type ProposalMember = {
  status?: string;
  id?: string;
  name: string;
  role: ProposalTeamRole;
  organization: string;
  /** Set when the participant is linked to a system account; empty for external participants. */
  userId?: string;
  /** Write-only alternative to `userId` — the API resolves it to an account. */
  username?: string;
  isAccountLinked?: boolean;
  participationRole?: ProposalParticipationRole;
  participationRoleLabel?: string;
};

/**
 * The viewer's role on this specific proposal, computed by the backend from the record
 * relationship. Never derive this from the account-level system role (UX-DR26).
 */
export type ProposalViewerParticipation = {
  role: ProposalParticipationRole;
  label: string;
  roles: ProposalParticipationRole[];
  labels: string[];
  isOwner: boolean;
  isParticipant: boolean;
  conflict: {
    conflicted: boolean;
    reasonCode: "no-conflict" | "participation" | "unresolved";
    reason: string;
    /** Plain-language reason to show next to a blocked control (UX-DR27). */
    message: string;
  };
};

/** The persisted proposal workflow states (EP-02 intake/submission, EP-03 evaluation/approval). */
export type ProposalWorkflowStatus =
  | "draft"
  | "submitted"
  | "supplement_requested"
  | "resubmitted"
  | "under_review"
  | "ready_for_approval"
  | "approved"
  | "rejected";

/**
 * The viewer's reviewer assignment on this specific proposal (ST-3.2). Like participation, it is
 * resolved from the assignment record — the `reviewer` account role grants nothing on its own.
 */
export type ProposalViewerReviewAssignment = {
  isAssignedReviewer: boolean;
  assignmentId: string;
  assignmentRole: "reviewer" | "committee_member" | "committee_secretary" | "none";
  assignmentRoleLabel: string;
};

export type ProposalManagementOfficerRecord = {
  id: string;
  officerUserId: string;
  officerDisplayName: string;
  officerUsername: string;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string;
  reason: string;
  assignedById: string;
  assignedByDisplayName?: string;
};

export type ProposalManagementOfficerState = {
  resolved: boolean;
  current: ProposalManagementOfficerRecord | null;
  history: ProposalManagementOfficerRecord[];
};

export type ProposalCapabilityState = {
  capability: ViewerAuthorizationV1 | null;
  reloadRequired: boolean;
  reason: string;
};

export function getProposalCapabilityState(proposal: Pick<ResearchProposal, "id" | "viewerAuthorization">): ProposalCapabilityState {
  if (!isViewerAuthorizationV1(proposal.viewerAuthorization)) {
    return { capability: null, reloadRequired: true, reason: "Không thể xác minh quyền thao tác. Vui lòng tải lại hồ sơ hoặc liên hệ hỗ trợ." };
  }
  if (proposal.viewerAuthorization.contextVersion.domain !== "proposal" || proposal.viewerAuthorization.contextVersion.recordId !== proposal.id) {
    return { capability: null, reloadRequired: true, reason: "Ngữ cảnh quyền không khớp hồ sơ đang mở. Vui lòng tải lại hồ sơ hoặc liên hệ hỗ trợ." };
  }
  return { capability: proposal.viewerAuthorization, reloadRequired: false, reason: "" };
}

export function blockedProposalAction(state: ProposalCapabilityState, action: PermissionActionV1): BlockedActionV1 | null {
  return state.capability?.blockedActions.find((item) => item.action === action) ?? null;
}

export function canPerformProposalAction(state: ProposalCapabilityState, action: PermissionActionV1) {
  return !state.reloadRequired && Boolean(state.capability?.allowedActions.includes(action));
}

export type ProposalAttachment = {
  id: string;
  relatedEntityType: string;
  relatedEntityId: string;
  proposalId: string;
  filePurpose: string;
  requirementCode: string;
  fileName: string;
  version?: number;
  description?: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploaderDisplayName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type ProposalHistoryEvent = {
  id: string;
  proposalId: string;
  actorId: string;
  actorDisplayName: string;
  fromStatus: string;
  toStatus: string;
  submittedAt: string;
  note: string;
};

export type ProposalSupplementRequest = {
  id: string;
  proposalId: string;
  actorId: string;
  actorDisplayName: string;
  reason: string;
  dueDate: string;
  requestedAt: string;
  resolvedAt: string;
  status: string;
};

export type CouncilMemberRole = "chair" | "vice_chair" | "secretary" | "reviewer_1" | "reviewer_2" | "reviewer" | "member";

export type CouncilMember = {
  role: CouncilMemberRole;
  roleLabel: string;
  userId?: string;
  displayName: string;
  academicTitle?: string;
  unit?: string;
  organization?: string;
};

export type CouncilMinutes = {
  meetingConductedAt?: string;
  attendance?: string[];
  conclusion: "approved" | "revision_required" | "rejected";
  conclusionLabel?: string;
  averageScore?: number;
  summaryComments?: string;
  modificationsRequired?: string;
  minutesAttachment?: { fileName: string; fileUrl?: string; uploadedAt?: string } | null;
  recordedById?: string;
  recordedByName?: string;
  recordedAt?: string;
};

export type CouncilMetadata = {
  /** returned: Phòng KHQS (Trưởng ban/Trưởng phòng) trả lại chuyên viên; rejected: Ban giám đốc không phê duyệt. */
  status: "draft" | "submitted" | "approved" | "rejected" | "returned";
  returnReason?: string;
  returnedByName?: string;
  rejectedByName?: string;
  /** Đã gửi lời mời thành viên theo tờ trình (quy trình mời trước khi trình). */
  invitationsSentAt?: string;
  decisionNumber?: string;
  decidedAt?: string;
  decidedById?: string;
  decidedByName?: string;
  /** Vai trò người ký (Giám đốc hoặc Phó GĐ phụ trách Khoa học) để in đúng chức danh ký. */
  decidedByRole?: string;
  approvalNote?: string;
  rejectionReason?: string;
  proposedAt?: string;
  proposedById?: string;
  proposedByName?: string;
  meetingDate?: string;
  meetingLocation?: string;
  tentativeAgenda?: string;
  members: CouncilMember[];
  councilMinutes?: CouncilMinutes;
};

export type ResearchProposal = {
  versions?: Array<{ id: string; version: number; submittedAt: string; content: { title: string; objectives: string; summary: string; attachments: ProposalAttachment[] } }>;
  id: string;
  code: string;
  intakePeriodId: string;
  ownerId: string;
  ownerDisplayName?: string;
  hostOrganizationUnitId: string;
  hostOrganizationUnitName?: string;
  researchFieldCode: string;
  proposalTypeCode: string;
  militaryScope?: "military" | "civilian";
  title: string;
  objectives: string;
  summary: string;
  startDate: string;
  endDate: string;
  budgetMetadata: {
    amount?: number;
    currency?: string;
    note?: string;
    /** Kinh phí lãnh đạo phê duyệt (có sau quyết định phê duyệt). */
    approvedAmount?: number;
    approvedNote?: string;
  };
  councilMetadata?: CouncilMetadata | null;
  /** Số liệu nghiệm thu / giải ngân lấy từ đề tài thực hiện (khi đã lập đề tài). */
  acceptanceCouncilMetadata?: any;
  disbursementMetadata?: any;
  /** Đề tài thực hiện được lập từ hồ sơ này (nếu có). */
  project?: { id: string; status: string } | null;
  irbMetadata?: any;
  status: ProposalWorkflowStatus;
  /** Vietnamese label for `status`, resolved by the backend so both apps read the same wording. */
  statusLabel?: string;
  submittedAt: string;
  submittedById: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canSubmit: boolean;
  viewerAuthorization?: ViewerAuthorizationV1;
  viewerParticipation?: ProposalViewerParticipation;
  viewerReviewAssignment?: ProposalViewerReviewAssignment;
  members?: ProposalMember[];
  attachments?: ProposalAttachment[];
  history?: ProposalHistoryEvent[];
  supplementRequests?: ProposalSupplementRequest[];
  managementOfficer?: ProposalManagementOfficerState;
  requiredPackage?: RequiredPackageItem[];
};

export type ReadinessItem = {
  code: string;
  label: string;
};

export type ProposalReadiness = {
  ready: boolean;
  missingFields: ReadinessItem[];
  missingFiles: ReadinessItem[];
};

export type ProposalDraftInput = {
  intakePeriodId?: string;
  hostOrganizationUnitId: string;
  title: string;
  researchFieldCode?: string;
  proposalTypeCode?: string;
  /** Tính chất đề tài: Quân sự / Dân sự (cùng cấp đề tài xác định mảng giao chuyên viên phụ trách). */
  militaryScope?: "military" | "civilian";
  startDate?: string;
  endDate?: string;
  objectives?: string;
  summary?: string;
  budgetMetadata?: {
    amount?: number;
    currency?: string;
    note?: string;
  };
  members?: ProposalMember[];
};

export type ApiErrorWithReadiness = Error & {
  missingFields?: ReadinessItem[];
  missingFiles?: ReadinessItem[];
};

const requestJson = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "Không thể xử lý yêu cầu hồ sơ.");

export async function loadResearchProposals(filters?: Record<string, string>) {
  const query = new URLSearchParams();
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.append(key, value);
    }
  }
  const qs = query.toString() ? `?${query.toString()}` : "";
  const response = await requestJson<{ proposals: ResearchProposal[] }>(`/research-proposals${qs}`);
  return response.proposals;
}

export async function createResearchProposalDraft(input: ProposalDraftInput) {
  return requestJson<{ proposal: ResearchProposal }>("/research-proposals", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function loadProposalManagementOfficerCandidates(id: string) {
  const response = await requestJson<{ users: Array<{ id: string; username: string | null; displayName: string; unit: string }> }>(`/research-proposals/${id}/management-officer-candidates`);
  return response.users;
}

export async function assignProposalManagementOfficer(id: string, input: { officerUserId: string; reason: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }) {
  return requestJson<{ managementOfficer: ProposalManagementOfficerState }>(`/research-proposals/${id}/management-officer`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function revokeProposalManagementOfficer(id: string, input: { reason: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }) {
  return requestJson<{ managementOfficer: ProposalManagementOfficerState }>(`/research-proposals/${id}/management-officer/revoke`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function loadResearchProposal(id: string) {
  const response = await requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}`);
  return response.proposal;
}

export async function updateResearchProposalDraft(
  id: string,
  input: Partial<ProposalDraftInput>,
  contextVersion?: ViewerAuthorizationV1["contextVersion"]
) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, contextVersion })
  });
}

export async function uploadProposalAttachment(
  proposalId: string,
  input: {
    contextVersion?: ViewerAuthorizationV1["contextVersion"];
    requirementCode: string;
    description: string;
    file: File;
  }
) {
  const formData = new FormData();
  formData.set("contextVersion", JSON.stringify(input.contextVersion));
  formData.set("relatedEntityType", "research_proposal");
  formData.set("relatedEntityId", proposalId);
  formData.set("filePurpose", input.requirementCode);
  formData.set("originalFileName", input.file.name);
  formData.set("description", input.description);
  formData.set("file", input.file);

  const body = await apiRequest<{ file?: ProposalAttachment }>("/files", { method: "POST", body: formData }, "Không thể tải tệp.");
  if (!body.file) throw new Error("Không thể tải tệp.");
  return { attachment: body.file };
}

export async function updateProposalAttachmentMetadata(attachmentId: string, input: { description: string | null; contextVersion?: ViewerAuthorizationV1["contextVersion"] }) {
  const body = await apiRequest<{ file?: ProposalAttachment }>(`/files/${attachmentId}`, { method: "PATCH", body: JSON.stringify(input) }, "Không thể cập nhật mô tả tệp.");
  if (!body.file) throw new Error("Không thể cập nhật mô tả tệp.");
  return body;
}

export async function deleteProposalAttachment(attachmentId: string, contextVersion?: ViewerAuthorizationV1["contextVersion"]) {
  const body = await apiRequest<{ file?: ProposalAttachment }>(`/files/${attachmentId}`, { method: "DELETE", body: JSON.stringify({ contextVersion }) }, "Không thể xóa tệp.");
  if (!body.file) throw new Error("Không thể xóa tệp.");
  return body;
}

export function getProposalAttachmentDownloadUrl(attachmentId: string) {
  return `${getApiBaseUrl()}/files/${attachmentId}/download`;
}

export async function loadProposalReadiness(id: string) {
  const response = await requestJson<{ readiness: ProposalReadiness }>(`/research-proposals/${id}/readiness`);
  return response.readiness;
}

export async function submitResearchProposal(id: string, contextVersion?: ViewerAuthorizationV1["contextVersion"]) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}/submit`, {
    method: "POST", body: JSON.stringify({ contextVersion })
  });
}

export async function requestProposalSupplement(id: string, input: { reason: string; dueDate: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}/supplement-requests`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function resubmitResearchProposal(id: string, contextVersion?: ViewerAuthorizationV1["contextVersion"]) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}/resubmit`, {
    method: "POST", body: JSON.stringify({ contextVersion })
  });
}

export function completeProposalCheck(id: string, contextVersion: ViewerAuthorizationV1["contextVersion"]) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}/checks/complete`, { method: "POST", body: JSON.stringify({ contextVersion }) });
}

export function updateProposalCode(id: string, code: string, reason: string, contextVersion: ViewerAuthorizationV1["contextVersion"]) {
  return requestJson<{ proposal: ResearchProposal }>(`/research-proposals/${id}/code`, { method: "POST", body: JSON.stringify({ code, reason, contextVersion }) });
}

export async function loadProposalCatalogs() {
  const response = await requestJson<{ items: import("./admin-api").CatalogItem[] }>("/research-proposals/catalogs");
  return response.items;
}

export async function proposeProposalCouncil(proposalId: string, payload: Record<string, unknown>) {
  return requestJson<{ success: boolean; proposalId: string; councilMetadata: CouncilMetadata }>(
    `/research-proposals/${proposalId}/propose-council`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function approveProposalCouncil(proposalId: string, payload: Record<string, unknown> = {}) {
  return requestJson<{ success: boolean; proposalId: string; councilMetadata: CouncilMetadata }>(
    `/research-proposals/${proposalId}/approve-council`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function rejectProposalCouncil(proposalId: string, payload: Record<string, unknown> = {}) {
  return requestJson<{ success: boolean; proposalId: string; councilMetadata: CouncilMetadata }>(
    `/research-proposals/${proposalId}/reject-council`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function recordProposalCouncilMinutes(proposalId: string, payload: Record<string, unknown>) {
  return requestJson<{ success: boolean; proposalId: string; councilMetadata: CouncilMetadata }>(
    `/research-proposals/${proposalId}/council-minutes`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export type AuditLogRecord = {
  id: string;
  action: string;
  actorDisplayName: string;
  timestamp: string;
  result: string;
  reason?: string;
  beforeFacts?: Record<string, unknown>;
  afterFacts?: Record<string, unknown>;
};

export async function getProposalAuditLogs(id: string) {
  const response = await requestJson<{ auditLogs: AuditLogRecord[] }>(`/research-proposals/${id}/audit-logs`);
  return response.auditLogs;
}

/** Sản phẩm dự kiến của hồ sơ đề xuất. Sản phẩm hoàn thành và nghiệm thu từng sản phẩm nằm ở đề tài. */
export interface ProposalDeliverable {
  id: string;
  proposalId: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const DELIVERABLE_TYPES = ["Bài báo khoa học", "Bằng sáng chế", "Sản phẩm công nghệ", "Sách chuyên khảo"] as const;

export type DeliverableInput = { type: string; title: string; description?: string | null };

export async function getProposalDeliverables(proposalId: string) {
  return requestJson<{ deliverables: ProposalDeliverable[]; canEdit: boolean }>(`/proposals/${proposalId}/deliverables`);
}

export async function createProposalDeliverable(proposalId: string, data: DeliverableInput) {
  return (await requestJson<{ deliverable: ProposalDeliverable }>(`/proposals/${proposalId}/deliverables`, { method: "POST", body: JSON.stringify(data) })).deliverable;
}

export async function updateProposalDeliverable(proposalId: string, deliverableId: string, data: Partial<DeliverableInput>) {
  return (await requestJson<{ deliverable: ProposalDeliverable }>(`/proposals/${proposalId}/deliverables/${deliverableId}`, { method: "PATCH", body: JSON.stringify(data) })).deliverable;
}

export async function deleteProposalDeliverable(proposalId: string, deliverableId: string) {
  return requestJson<{ success: boolean }>(`/proposals/${proposalId}/deliverables/${deliverableId}`, { method: "DELETE" });
}
