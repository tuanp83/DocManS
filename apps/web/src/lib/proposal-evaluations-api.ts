import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { getApiBaseUrl } from "@/lib/session";

/**
 * EP-03 (ST-3.2 .. ST-3.5) client. Kept apart from `research-proposals-api.ts` because these
 * endpoints belong to the evaluation phase and are only ever called by staff, an assigned
 * reviewer, or an approval authority.
 *
 * Every visibility decision here is a hint for rendering. The backend re-checks authority, workflow
 * state and conflict on each call, so a stale flag can never widen what actually happens.
 */

export type ReviewAssignmentRole = "reviewer" | "committee_member";
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
  status: "assigned" | "revoked" | "completed";
  statusLabel: string;
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
  status: "draft" | "ready_for_approval";
  statusLabel: string;
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
  averageTotalScore: number | null;
  maxTotalScore: number;
};

export type ProposalReviewProgress = ReviewProgressCounts & {
  proposalId: string;
  proposalStatus: string;
  proposalStatusLabel: string;
  assignments: ProposalReviewAssignment[];
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
  fromStatus: string;
  toStatus: string;
};

export type ProposalDecisionPackage = {
  proposalId: string;
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
  progress: ReviewProgressCounts;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      }
    });
  } catch {
    const error = new Error("Không kết nối được tới máy chủ. Kiểm tra kết nối và thử lại.") as EvaluationApiError;
    error.status = 0;
    throw error;
  }

  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    fieldErrors?: Record<string, string>;
    pendingReviewers?: Array<{ reviewerDisplayName: string }>;
  };

  if (!response.ok) {
    const error = new Error(body.message ?? "Không thể xử lý yêu cầu đánh giá.") as EvaluationApiError;
    error.status = response.status;
    error.fieldErrors = body.fieldErrors;
    error.pendingReviewers = body.pendingReviewers;
    throw error;
  }

  return body as T;
}

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
  input: { summary: string; recommendation: string; markReady: boolean }
) {
  return requestJson<{ evaluationSummary: ProposalEvaluationSummary; proposalStatus: string }>(
    `/research-proposals/${proposalId}/evaluation-summary`,
    { method: "PUT", body: JSON.stringify(input) }
  );
}

// ST-3.5 --------------------------------------------------------------------------------------

export async function loadProposalDecisionPackage(proposalId: string) {
  const response = await requestJson<{ decisionPackage: ProposalDecisionPackage }>(`/research-proposals/${proposalId}/decision-package`);
  return response.decisionPackage;
}

export async function decideProposal(
  proposalId: string,
  decision: "approve" | "reject",
  payload: string | { note?: string; approvedBudget?: number; budgetNote?: string }
) {
  const body = typeof payload === "string" ? { note: payload } : payload;
  return requestJson<{ decision: ProposalDecisionRecord; proposalStatus: string; proposalStatusLabel: string }>(
    `/research-proposals/${proposalId}/${decision}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function approveProposalBudget(
  proposalId: string,
  payload: { approvedBudget: number; budgetNote?: string }
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

// Acceptance Council Types & APIs ---------------------------------------------
export type AcceptanceCouncilMember = {
  profileId: string;
  fullName: string;
  academicTitle?: string;
  unit?: string;
  role: "CHAIRMAN" | "SECRETARY" | "REVIEWER_1" | "REVIEWER_2" | "MEMBER";
  isConflicted?: boolean;
  conflictReason?: string;
};

export type AcceptanceEvaluationScores = {
  reportScore: number; // Max 30
  scientificProductsScore: number; // Max 30
  trainingProductsScore: number; // Max 15
  militaryMedicalPracticalScore: number; // Max 25
  totalScore: number; // 0 - 100
  classification: "EXCELLENT" | "PASSED" | "FAILED";
  assessmentComments: string;
};

export type AcceptanceCouncilMetadata = {
  councilType?: "FACILITY" | "OFFICIAL";
  establishmentDecisionNumber?: string;
  decisionDate?: string;
  meetingDate?: string;
  meetingLocation?: string;
  status: "NONE" | "PROPOSED" | "ESTABLISHED" | "EVALUATED";
  members: AcceptanceCouncilMember[];
  evaluationResult?: AcceptanceEvaluationScores;
  minutesNotes?: string;
  decisionSignerName?: string;
};

export function proposeAcceptanceCouncil(
  proposalId: string,
  payload: {
    councilType: "FACILITY" | "OFFICIAL";
    members: AcceptanceCouncilMember[];
    notes?: string;
  }
) {
  return requestJson<{ success: boolean; acceptanceCouncil: AcceptanceCouncilMetadata }>(
    `/research-proposals/${proposalId}/acceptance-council/propose`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function approveAcceptanceCouncil(
  proposalId: string,
  payload: {
    decisionNumber: string;
    decisionDate: string;
    signerName: string;
  }
) {
  return requestJson<{ success: boolean; acceptanceCouncil: AcceptanceCouncilMetadata }>(
    `/research-proposals/${proposalId}/acceptance-council/approve`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function recordAcceptanceMinutes(
  proposalId: string,
  payload: {
    meetingDate: string;
    meetingLocation: string;
    reportScore: number;
    scientificProductsScore: number;
    trainingProductsScore: number;
    militaryMedicalPracticalScore: number;
    assessmentComments: string;
    minutesNotes?: string;
  }
) {
  return requestJson<{ success: boolean; acceptanceCouncil: AcceptanceCouncilMetadata }>(
    `/research-proposals/${proposalId}/acceptance-council/minutes`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

// Milestone Disbursement & Settlement Types & APIs ---------------------------
export type MilestoneAttachment = {
  id: string;
  fileName: string;
  fileSize?: number;
  fileUrl?: string;
  uploadedAt: string;
  uploadedByName?: string;
};

export type DisbursementMilestone = {
  id: string;
  name: string;
  percentage: number;
  expectedAmount: number;
  disbursedAmount: number;
  status: "PENDING" | "DISBURSED" | "SETTLED";
  disbursedDate?: string;
  settledDate?: string;
  evidenceNotes?: string;
  attachments?: MilestoneAttachment[];
};

export type DisbursementCostItem = {
  code: string;
  name: string;
  allocatedAmount: number;
  spentAmount: number;
  settledAmount: number;
};

export type DisbursementMetadata = {
  totalBudget: number;
  totalDisbursed: number;
  totalSettled: number;
  settlementStatus: "PENDING" | "PARTIALLY_SETTLED" | "COMPLETED";
  milestones: DisbursementMilestone[];
  costItems: DisbursementCostItem[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
};

export function fetchDisbursement(proposalId: string) {
  return requestJson<{ success: boolean; proposalId: string; disbursement: DisbursementMetadata }>(
    `/research-proposals/${proposalId}/disbursement`
  );
}

export function updateDisbursement(
  proposalId: string,
  payload: {
    milestones: DisbursementMilestone[];
    costItems: DisbursementCostItem[];
    settlementStatus?: "PENDING" | "PARTIALLY_SETTLED" | "COMPLETED";
    notes?: string;
  }
) {
  return requestJson<{ success: boolean; proposalId: string; disbursement: DisbursementMetadata }>(
    `/research-proposals/${proposalId}/disbursement`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

// Biomedical Research Ethics Council / IRB Types & APIs -----------------------
export type IRBMember = {
  userId: string;
  displayName: string;
  role: string;
};

export type IRBReview = {
  reviewerId: string;
  reviewerName: string;
  status: "submitted";
  comment: string;
  recommendation: string;
  submittedAt: string;
};

export type IRBMetadata = {
  council?: {
    status: "draft" | "submitted" | "approved";
    members: IRBMember[];
    proposedById?: string;
    proposedByName?: string;
    proposedAt?: string;
    approvedById?: string;
    approvedByName?: string;
    approvedAt?: string;
    meetingDate?: string;
  };
  reviews?: IRBReview[];
  certificate?: {
    status: "APPROVED" | "REJECTED";
    certificateNumber?: string;
    decisionDate?: string;
    validUntil?: string;
    ethicsNotes?: string;
    riskLevel?: string;
    targetSubjects?: string;
    approvedById?: string;
    approvedByName?: string;
    updatedAt?: string;
  };
};

export function fetchIRBInfo(proposalId: string) {
  return requestJson<{ success: boolean; proposalId: string; irb: IRBMetadata }>(
    `/research-proposals/${proposalId}/irb`
  );
}

export function proposeIrbCouncil(proposalId: string, members: IRBMember[], meetingDate: string = "") {
  return requestJson<{ success: boolean; proposalId: string; irb: IRBMetadata }>(
    `/research-proposals/${proposalId}/irb/propose`,
    { method: "POST", body: JSON.stringify({ members, meetingDate }) }
  );
}

export function approveIrbCouncil(proposalId: string) {
  return requestJson<{ success: boolean; proposalId: string; irb: IRBMetadata }>(
    `/research-proposals/${proposalId}/irb/approve-council`,
    { method: "POST" }
  );
}

export function submitIrbReview(proposalId: string, payload: { comment: string; recommendation: string }) {
  return requestJson<{ success: boolean; proposalId: string; irb: IRBMetadata }>(
    `/research-proposals/${proposalId}/irb/review`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function updateIRBStatus(
  proposalId: string,
  payload: {
    status: "APPROVED" | "REJECTED";
    certificateNumber?: string;
    decisionDate?: string;
    validUntil?: string;
    riskLevel?: string;
    targetSubjects?: string;
    ethicsNotes?: string;
  }
) {
  return requestJson<{ success: boolean; proposalId: string; irb: IRBMetadata }>(
    `/research-proposals/${proposalId}/irb`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}


