import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { apiRequest } from "@/lib/api-client";

/**
 * EP-03 (ST-3.2 .. ST-3.5) client. Kept apart from `research-proposals-api.ts` because these
 * endpoints belong to the evaluation phase and are only ever called by staff, an assigned
 * reviewer, or an approval authority.
 *
 * Every visibility decision here is a hint for rendering. The backend re-checks authority, workflow
 * state and conflict on each call, so a stale flag can never widen what actually happens.
 */

export type ReviewAssignmentRole = "reviewer" | "committee_member" | "committee_secretary";
export type ReviewRecommendation = "approve" | "revise" | "reject";

export type ProposalReviewAssignment = {
  id: string;
  proposalId: string;
  reviewerUserId: string;
  researcherProfileId: string | null;
  reviewerDisplayName: string;
  reviewerUsername: string;
  reviewerUnit: string;
  assignmentRole: ReviewAssignmentRole;
  assignmentRoleLabel: string;
  status: "assigned" | "revoked" | "completed" | "declined" | "invited";
  statusLabel: string;
  /** Lời mời chưa được người phản biện đồng ý hoặc từ chối. */
  invitationPending: boolean;
  /** Đã nhận lời tham gia hội đồng, chờ lãnh đạo ký quyết định thành lập (chưa xem được hồ sơ). */
  awaitingCouncilDecision?: boolean;
  acceptedAt: string;
  declinedAt: string;
  declineReason: string;
  assignedById: string;
  assignedByDisplayName: string;
  assignedAt: string;
  effectiveFrom: string;
  effectiveUntil: string;
  dueDate: string;
  revokedAt: string;
  completedAt: string;
  reviewStatus: string;
  reviewSubmittedAt: string;
  reviewTotalScore: number | null;
  reviewRecommendation: string;
  reviewRecommendationLabel: string;
};

export type ReviewerQueueItem = ProposalReviewAssignment & {
  proposal: {
    id: string;
    code: string;
    title: string;
    status: string;
    statusLabel: string;
    submittedAt: string;
  };
  myReviewStatus: string;
  myReviewSubmittedAt: string;
};

export type ReviewScoreCriterion = {
  code: string;
  label: string;
  maxScore: number;
};

export type ReviewRecommendationOption = {
  code: ReviewRecommendation;
  label: string;
};

export type MyProposalReview = {
  id: string;
  assignmentId: string;
  reviewerUserId: string;
  status: "draft" | "submitted";
  scoreData: Record<string, number>;
  totalScore: number | null;
  comment: string;
  recommendation: string;
  recommendationLabel: string;
  submittedAt: string;
  canEdit: boolean;
  criteria: ReviewScoreCriterion[];
  maxTotalScore: number;
  recommendations: ReviewRecommendationOption[];
};

export type SubmittedProposalReview = {
  id: string;
  proposalId: string;
  assignmentId: string;
  reviewerUserId: string;
  reviewerDisplayName: string;
  status: string;
  scoreData: Record<string, number>;
  totalScore: number | null;
  maxTotalScore: number;
  comment: string;
  recommendation: string;
  recommendationLabel: string;
  submittedAt: string;
};

export type ProposalEvaluationSummary = {
  id: string;
  proposalId: string;
  summary: string;
  recommendation: string;
  recommendationLabel: string;
  /** Lưu nháp → chốt → trình lãnh đạo. */
  status: "draft" | "finalized" | "ready_for_approval";
  statusLabel: string;
  /** Phiên bản gói đánh giá; lãnh đạo quyết định trên đúng phiên bản này. */
  revision: number;
  /** Lý do mở lại (khi bản đã chốt được mở lại về nháp). */
  reopenReason: string;
  createdById: string;
  updatedById: string;
  updatedByDisplayName: string;
  markedReadyAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewProgressCounts = {
  activeAssignmentCount: number;
  submittedCount: number;
  pendingCount: number;
  pendingReviewers: Array<{ assignmentId: string; reviewerUserId: string; reviewerDisplayName: string }>;
  allReviewsSubmitted: boolean;
  /** Thiếu sót thành phần hội đồng (2–3 phản biện, 3–5 thành viên, 1 thư ký); rỗng khi đủ. */
  councilProblems?: string[];
  averageTotalScore: number | null;
  maxTotalScore: number;
};

export type ProposalReviewProgress = ReviewProgressCounts & {
  proposalId: string;
  proposalStatus: string;
  proposalStatusLabel: string;
  assignments: ProposalReviewAssignment[];
  /** Lời mời bị từ chối trong vòng hiện tại (chỉ người điều phối nhận được). */
  declinedAssignments?: ProposalReviewAssignment[];
  /** Lời mời hội đồng theo tờ trình, chưa có quyết định thành lập. */
  councilInvitations?: ProposalReviewAssignment[];
  reviews: SubmittedProposalReview[];
  evaluationSummary: ProposalEvaluationSummary | null;
  recommendations: ReviewRecommendationOption[];
};

export type ProposalDecisionRecord = {
  id: string;
  proposalId: string;
  decision: "approved" | "rejected";
  decisionLabel: string;
  note: string;
  decidedById: string;
  decidedByDisplayName: string;
  decidedAt: string;
  /** Số quyết định phê duyệt; rỗng khi chưa có. */
  decisionNumber?: string;
  fromStatus: string;
  toStatus: string;
};

export type ProposalDecisionPackage = {
  proposalId: string;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  proposalStatus: string;
  proposalStatusLabel: string;
  title?: string;
  code?: string;
  proposalTypeCode?: string;
  researchFieldCode?: string;
  budgetMetadata?: {
    amount?: number;
    currency?: string;
    note?: string;
    approvedAmount?: number;
    approvedNote?: string;
  };
  canDecide: boolean;
  conflict: {
    conflicted: boolean;
    reasonCode: string;
    reason: string;
    viewerMessage: string;
  };
  /** Lãnh đạo không thấy danh sách người chưa gửi phiếu (bảo mật phiếu). */
  progress: Omit<ReviewProgressCounts, "pendingReviewers"> & { pendingReviewers?: ReviewProgressCounts["pendingReviewers"] };
  /** Phiên bản gói đánh giá phải gửi kèm khi quyết định. */
  packageRevision: number;
  /** Phiếu từng người được bảo mật với lãnh đạo. */
  disclosure?: { protectedReviewData: string };
  reviews: SubmittedProposalReview[];
  evaluationSummary: ProposalEvaluationSummary | null;
  decisions: ProposalDecisionRecord[];
  attachmentCount: number;
  history: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    submittedAt: string;
    actorDisplayName: string;
    note: string;
  }>;
};

export type ProposalReviewPackage = {
  assignmentId: string;
  assignmentRole: string;
  assignmentRoleLabel: string;
  proposal: {
    id: string;
    code: string;
    title: string;
    status: string;
    statusLabel: string;
    objectives: string;
    summary: string;
    researchFieldCode: string;
    proposalTypeCode: string;
    startDate: string;
    endDate: string;
    budgetMetadata: { amount?: number; currency?: string };
    submittedAt: string;
  };
  members: Array<{ id: string; name: string; role: string; organization: string }>;
  attachments: Array<{
    id: string;
    requirementCode: string;
    fileName: string;
    description: string | null;
    mimeType: string;
    sizeBytes: number;
    uploaderDisplayName: string;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    submittedAt: string;
    actorDisplayName: string;
    note: string;
  }>;
};

/** Field-level validation detail the reviewer form renders next to the offending input. */
export type EvaluationApiError = Error & {
  /** HTTP status, or 0 when the request never reached the API. */
  status?: number;
  fieldErrors?: Record<string, string>;
  pendingReviewers?: Array<{ reviewerDisplayName: string }>;
};

/**
 * Only 401/403 mean "this panel does not apply to you". Anything else — a network failure, a 500,
 * a 404 — is a real error the user has to be told about, so panels must not treat it as a silent
 * "not entitled" and disappear.
 */
export function isNotEntitled(error: unknown) {
  const status = (error as EvaluationApiError)?.status;
  return status === 401 || status === 403;
}

const requestJson = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "Không thể xử lý yêu cầu đánh giá.");

// ST-3.2 --------------------------------------------------------------------------------------

export async function loadProposalReviewAssignments(proposalId: string) {
  const response = await requestJson<{ assignments: ProposalReviewAssignment[] }>(`/research-proposals/${proposalId}/review-assignments`);
  return response.assignments;
}

export async function assignProposalReviewer(
  proposalId: string,
  input: { researcherProfileId: string; assignmentRole: ReviewAssignmentRole; dueDate?: string; effectiveFrom?: string; effectiveUntil?: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }
) {
  const response = await requestJson<{ assignment: ProposalReviewAssignment }>(`/research-proposals/${proposalId}/review-assignments`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.assignment;
}

export async function revokeProposalReviewAssignment(proposalId: string, assignmentId: string, note: string, contextVersion?: ViewerAuthorizationV1["contextVersion"]) {
  const response = await requestJson<{ assignment: ProposalReviewAssignment }>(
    `/research-proposals/${proposalId}/review-assignments/${assignmentId}/revoke`,
    { method: "POST", body: JSON.stringify({ note, contextVersion }) }
  );
  return response.assignment;
}

/** Nhà khoa học đồng ý nhận phản biện: mở hồ sơ và phiếu chấm. */
export async function acceptReviewInvitation(proposalId: string, assignmentId: string) {
  const response = await requestJson<{ assignment: ProposalReviewAssignment }>(`/research-proposals/${proposalId}/review-assignments/${assignmentId}/accept`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return response.assignment;
}

/** Nhà khoa học từ chối phản biện, kèm lý do bắt buộc. */
export async function declineReviewInvitation(proposalId: string, assignmentId: string, reason: string) {
  const response = await requestJson<{ assignment: ProposalReviewAssignment }>(`/research-proposals/${proposalId}/review-assignments/${assignmentId}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return response.assignment;
}

export async function loadMyReviewAssignments() {
  const response = await requestJson<{ assignments: ReviewerQueueItem[] }>("/research-proposals/review-assignments/mine");
  return response.assignments;
}

export async function loadProposalReviewPackage(proposalId: string) {
  const response = await requestJson<{ reviewPackage: ProposalReviewPackage }>(`/research-proposals/${proposalId}/review-package`);
  return response.reviewPackage;
}

// ST-3.3 --------------------------------------------------------------------------------------

export async function loadMyProposalReview(proposalId: string) {
  const response = await requestJson<{ review: MyProposalReview }>(`/research-proposals/${proposalId}/my-review`);
  return response.review;
}

export async function saveMyProposalReview(
  proposalId: string,
  input: { scoreData: Record<string, number>; comment: string; recommendation: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }
) {
  const response = await requestJson<{ review: MyProposalReview }>(`/research-proposals/${proposalId}/my-review`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
  return response.review;
}

export async function submitMyProposalReview(
  proposalId: string,
  input: { scoreData: Record<string, number>; comment: string; recommendation: string; contextVersion?: ViewerAuthorizationV1["contextVersion"] }
) {
  const response = await requestJson<{ review: MyProposalReview }>(`/research-proposals/${proposalId}/my-review/submit`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.review;
}

// ST-3.4 --------------------------------------------------------------------------------------

export async function loadProposalReviewProgress(proposalId: string) {
  const response = await requestJson<{ progress: ProposalReviewProgress }>(`/research-proposals/${proposalId}/review-progress`);
  return response.progress;
}

export async function saveProposalEvaluationSummary(
  proposalId: string,
  input: { summary: string; recommendation: string; revision: number; contextVersion?: unknown }
) {
  return requestJson<{ evaluationSummary: ProposalEvaluationSummary; proposalStatus: string }>(
    `/research-proposals/${proposalId}/evaluation-summary`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

/** Chốt bản nháp tổng hợp (khoá nội dung cùng danh sách phân công và phiếu của vòng hiện tại). */
export async function finalizeProposalEvaluationSummary(proposalId: string, input: { revision: number; contextVersion?: unknown }) {
  return requestJson<{ evaluationSummary: ProposalEvaluationSummary; proposalStatus: string }>(`/research-proposals/${proposalId}/evaluation-summary/finalize`, { method: "POST", body: JSON.stringify(input) });
}

/** Mở lại bản đã chốt về nháp (chưa trình), kèm lý do. */
export async function reopenProposalEvaluationSummary(proposalId: string, input: { reason: string; revision: number; contextVersion?: unknown }) {
  return requestJson<{ evaluationSummary: ProposalEvaluationSummary; proposalStatus: string }>(`/research-proposals/${proposalId}/evaluation-summary/reopen`, { method: "POST", body: JSON.stringify(input) });
}

/** Trình lãnh đạo bản tổng hợp đã chốt; hồ sơ chuyển "chờ phê duyệt". */
export async function submitProposalEvaluationPackage(proposalId: string, input: { revision: number; contextVersion?: unknown }) {
  return requestJson<{ evaluationSummary: ProposalEvaluationSummary; proposalStatus: string }>(`/research-proposals/${proposalId}/evaluation-summary/submit`, { method: "POST", body: JSON.stringify(input) });
}

// ST-3.5 --------------------------------------------------------------------------------------

export async function loadProposalDecisionPackage(proposalId: string) {
  const response = await requestJson<{ decisionPackage: ProposalDecisionPackage }>(`/research-proposals/${proposalId}/decision-package`);
  return response.decisionPackage;
}

export async function decideProposal(
  proposalId: string,
  decision: "approve" | "reject",
  payload: { note?: string; approvedBudget?: number; budgetNote?: string; decisionNumber?: string; packageRevision: number }
) {
  const body = payload;
  return requestJson<{ decision: ProposalDecisionRecord; proposalStatus: string; proposalStatusLabel: string }>(
    `/research-proposals/${proposalId}/${decision}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function approveProposalBudget(
  proposalId: string,
  payload: { approvedBudget: number; budgetNote?: string; contextVersion?: unknown }
) {
  return requestJson<{ success: boolean; proposalId: string; approvedAmount: number; budgetMetadata: Record<string, unknown> }>(
    `/research-proposals/${proposalId}/approve-budget`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export type ReviewerCandidates = { profiles: Array<{ id: string; fullName: string; linkedUserId: string; linkedAccountUsername: string; linkedAccountDisplayName: string }> };
export function loadReviewerCandidates(proposalId: string, query = "") { return requestJson<ReviewerCandidates>(`/research-proposals/${proposalId}/assignable-reviewers?q=${encodeURIComponent(query)}`); }

export type CouncilCandidate = {
  id: string;
  userId: string | null;
  fullName: string;
  username: string;
  systemRole: string;
  academicTitle: string;
  unit: string;
  militaryRank?: string;
  position?: string;
  profileType: string;
  isConflicted: boolean;
  /** Chức danh tại đơn vị của tài khoản (chỉ để hiển thị). */
  unitPositions?: string[];
  conflictSeverity?: "BLOCKED_DIRECT_PARTICIPANT" | "WARNING_SAME_UNIT";
  conflictReason?: string;
};

export type CouncilCandidatesResponse = {
  proposalId: string;
  candidates: CouncilCandidate[];
};

export function loadCouncilCandidates(proposalId: string) {
  return requestJson<CouncilCandidatesResponse>(`/research-proposals/${proposalId}/council-candidates`);
}

// Nghiệm thu và giải ngân gắn với đề tài: xem lib/projects-api.ts.

// Hội đồng Đạo đức trong nghiên cứu Y sinh học (IRB) ------------------------------------------------------
// Luồng (apps/api/src/proposal-evaluations/irb-council.ts): mời → Đồng ý/Từ chối → trình qua Phòng KHQS → Ban giám đốc ký
// thành lập → thành viên nhận xét → thư ký lập kết luận → chuyên viên trình → Ban giám đốc ký cấp Giấy chứng nhận.

export type IrbRole = "chair" | "secretary" | "reviewer" | "member";
export const IRB_ROLE_LABELS: Record<IrbRole, string> = { chair: "Chủ tịch", secretary: "Thư ký", reviewer: "Phản biện", member: "Ủy viên" };
/** Thành phần quy định: 1 Chủ tịch, 1 Thư ký, 2–3 Phản biện, 3–5 Ủy viên. */
export const IRB_COMPOSITION: Record<IrbRole, { min: number; max: number }> = { chair: { min: 1, max: 1 }, secretary: { min: 1, max: 1 }, reviewer: { min: 2, max: 3 }, member: { min: 3, max: 5 } };
export type IrbRecommendation = "approve" | "revise" | "reject";
export const IRB_RECOMMENDATION_LABELS: Record<IrbRecommendation, string> = { approve: "Đồng ý thông qua", revise: "Thông qua với điều kiện chỉnh sửa", reject: "Không thông qua" };
export const IRB_RISK_LABELS: Record<string, string> = { MINIMAL: "Rủi ro tối thiểu", LOW: "Rủi ro thấp", HIGH: "Rủi ro cao" };

export type IRBMember = { userId: string; displayName: string; role: IrbRole; roleLabel?: string; academicTitle?: string; unit?: string };

export type IRBReview = {
  reviewerId: string;
  reviewerName: string;
  role?: IrbRole;
  roleLabel?: string;
  status: "submitted";
  comment: string;
  recommendation: string;
  recommendationLabel?: string;
  submittedAt: string;
};

export type IRBConclusion = {
  status: "draft" | "finalized" | "submitted" | "returned" | "signed";
  decision: "APPROVED" | "REJECTED";
  riskLevel: string;
  targetSubjects?: string;
  ethicsNotes: string;
  conditions?: string;
  meetingConductedAt?: string;
  recordedByName?: string;
  recordedAt?: string;
  submittedByName?: string;
  returnReason?: string;
  returnedByName?: string;
};

export type IRBMetadata = {
  council?: {
    status: "draft" | "submitted" | "returned" | "rejected" | "approved";
    members: IRBMember[];
    meetingDate?: string;
    meetingLocation?: string;
    proposedById?: string;
    proposedByName?: string;
    proposedAt?: string;
    invitationsSentAt?: string | null;
    decisionNumber?: string;
    approvedByName?: string;
    approvedAt?: string;
    returnReason?: string;
    rejectionReason?: string;
  };
  reviews?: IRBReview[];
  conclusion?: IRBConclusion | null;
  certificate?: {
    status: "APPROVED" | "REJECTED";
    certificateNumber?: string | null;
    decisionDate?: string;
    validUntil?: string;
    ethicsNotes?: string;
    riskLevel?: string;
    targetSubjects?: string;
    conditions?: string;
    approvedById?: string;
    approvedByName?: string;
    updatedAt?: string;
  } | null;
};

export type IrbMemberStatus = {
  id: string;
  proposalId: string;
  userId: string;
  displayName: string | null;
  role: IrbRole;
  roleLabel: string;
  status: "invited" | "accepted" | "declined" | "active" | "revoked";
  statusLabel: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
};

/** Lời mời / tư cách thành viên IRB của người xem: chỉ tên đề tài. */
export type IrbInvitation = IrbMemberStatus & {
  proposal: { id: string; code: string | null; title: string };
  invitedByName: string | null;
  meetingDate: string | null;
  councilStatus: string;
  reviewSubmitted: boolean;
  conclusionStatus: string | null;
  certificateStatus: string | null;
};

/** Opaque proposal contextVersion token returned by the API; sent back unchanged on the next write. */
export type IRBContextVersion = unknown;
export type IRBInfo = {
  proposalId: string;
  irb: IRBMetadata;
  memberStatuses: IrbMemberStatus[];
  viewer: { memberRole: IrbRole | null; isCoordinator: boolean; canSign: boolean };
  contextVersion?: IRBContextVersion;
};
type IRBResponse = { success: boolean; irb: IRBMetadata; contextVersion?: IRBContextVersion };

const irbPost = (proposalId: string, path: string, body: Record<string, unknown>) =>
  requestJson<IRBResponse>(`/research-proposals/${proposalId}/irb${path}`, { method: "POST", body: JSON.stringify(body) });

export function fetchIRBInfo(proposalId: string) {
  return requestJson<IRBInfo>(`/research-proposals/${proposalId}/irb`);
}

export async function loadMyIrbInvitations() {
  return (await requestJson<{ invitations: IrbInvitation[] }>("/research-proposals/irb-invitations/mine")).invitations;
}

/** save: lưu nháp; invite: gửi lời mời cho người mới; submit: trình qua Phòng KHQS (mọi người đã nhận lời). */
export function proposeIrbCouncil(proposalId: string, payload: { action: "save" | "invite" | "submit"; members: IRBMember[]; meetingDate?: string; meetingLocation?: string; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/propose", payload);
}

export function acceptIrbInvitation(proposalId: string, memberId: string) {
  return requestJson<IrbMemberStatus>(`/research-proposals/${proposalId}/irb/members/${memberId}/accept`, { method: "POST", body: "{}" });
}

export function declineIrbInvitation(proposalId: string, memberId: string, reason: string) {
  return requestJson<IrbMemberStatus>(`/research-proposals/${proposalId}/irb/members/${memberId}/decline`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function approveIrbCouncil(proposalId: string, payload: { decisionNumber?: string; approvalNote?: string; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/approve-council", payload);
}

export function rejectIrbCouncil(proposalId: string, payload: { reason: string; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/reject-council", payload);
}

export function submitIrbReview(proposalId: string, payload: { comment: string; recommendation: IrbRecommendation; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/review", payload);
}

export function saveIrbConclusion(proposalId: string, payload: Omit<IRBConclusion, "status"> & { action: "save" | "finalize"; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/conclusion", payload);
}

export function submitIrbConclusion(proposalId: string, contextVersion?: IRBContextVersion) {
  return irbPost(proposalId, "/conclusion/submit", { contextVersion });
}

export function returnIrbConclusion(proposalId: string, payload: { reason: string; contextVersion?: IRBContextVersion }) {
  return irbPost(proposalId, "/conclusion/return", payload);
}

/** Ban giám đốc ký cấp Giấy chứng nhận theo kết luận đã trình; để trống số thì hệ thống tự cấp. */
export function updateIRBStatus(
  proposalId: string,
  payload: { certificateNumber?: string; decisionDate?: string; validUntil?: string; contextVersion?: IRBContextVersion }
) {
  return irbPost(proposalId, "", payload);
}
