// @ts-ignore TS7016: runtime package is JavaScript; API imports its TypeScript source contract.
import type { AuthorizationDecisionCodeV1, PermissionActionV1, ViewerAuthorizationV1, ViewerRelationshipV1 } from "@rtms/permissions";
import { isScoringRole } from "../proposals-shared/evaluation-council-rules.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { evaluateProposalConflict, type ProposalParticipation } from "../proposals-shared/proposal-participation.js";
import type { ProposalReviewAccess } from "../proposals-shared/proposal-review-access.js";
import type { ProposalManagementOfficerResolution } from "../proposals-shared/proposal-management-officer.service.js";
import { isInternalResearcherEligible, isResearchOversightAuthority, isResearchManagementHead, isResearchManagementStaff } from "../proposals-shared/proposal-access.js";
import { publicAuthorizationReasonV1 } from "./authorization-v1.service.js";

type ProposalCapabilityInput = {
  actor: SafeUserContext;
  proposal: {
    id: string;
    hostOrganizationUnitId: string;
    status: string;
    updatedAt: Date;
    authorizationContextUpdatedAt: Date;
    authorizationRelationshipVersion: number;
    authorizationConflictVersion: number;
    authorizationDelegationVersion: number;
  };
  participation?: ProposalParticipation;
  reviewAccess?: ProposalReviewAccess;
  managementOfficer?: ProposalManagementOfficerResolution;
  canRead: boolean;
  canEdit: boolean;
  canManageFiles: boolean;
  completenessCheckCompleted?: boolean;
};

const ACTIONS: PermissionActionV1[] = [
  "proposal.read",
  "proposal.draft.update",
  "proposal.submit",
  "proposal.review.assign",
  "proposal.review.consolidate",
  "proposal.review.progress.read",
  "proposal.review.submit",
  "proposal.supplement.request",
  "proposal.completeness.check",
  "proposal.management-officer.assign",
  "proposal.management-officer.revoke",
  "proposal.decision.approve",
  "proposal.decision.reject",
  "file.read",
  "file.upload"
];

export function projectProposalViewerAuthorizationV1(input: ProposalCapabilityInput): ViewerAuthorizationV1 {
  const evaluatedAsOf = input.proposal.authorizationContextUpdatedAt.toISOString();
  const relationships = viewerRelationships(input.participation, input.reviewAccess, input.managementOfficer, input.actor.id);
  const blockedActions: Array<{ action: PermissionActionV1; code: AuthorizationDecisionCodeV1; reason: string }> = [];
  const allowedActions: PermissionActionV1[] = [];

  for (const action of ACTIONS) {
    const blocked = blockFor(action, input);
    if (blocked) blockedActions.push({ action, ...blocked });
    else allowedActions.push(action);
  }

  const accessReasons = [
    isCurrentOfficer(input) ? "PROPOSAL_MANAGEMENT_OFFICER" : "",
    isResearchManagementHead(input.actor) ? "RESEARCH_MANAGEMENT_HEAD_OVERSIGHT" : "",
    isResearchOversightAuthority(input.actor) ? "RESEARCH_OVERSIGHT_AUTHORITY_OVERSIGHT" : "",
    input.actor.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY" ? "LEADERSHIP_APPROVAL_AUTHORITY_OVERSIGHT" : "",
    input.participation?.isParticipant ? input.participation.role : "",
    input.reviewAccess?.isAssignedReviewer ? "REVIEWER_ASSIGNMENT" : ""
  ].filter(Boolean);

  return {
    schemaVersion: "v1",
    systemRole: input.actor.systemRole,
    viewerRelationships: relationships,
    allowedActions: allowedActions.sort(),
    blockedActions: blockedActions.sort((left, right) => left.action.localeCompare(right.action)),
    policyVersion: "v1",
    evaluatedAsOf,
    contextVersion: {
      domain: "proposal",
      recordId: input.proposal.id,
      aggregateVersion: Math.max(0, input.proposal.updatedAt.getTime()),
      relationshipVersion: Math.max(0, input.proposal.authorizationRelationshipVersion),
      conflictVersion: Math.max(0, input.proposal.authorizationConflictVersion),
      delegationVersion: Math.max(0, input.proposal.authorizationDelegationVersion),
      policyVersion: "v1"
    },
    accessReasons
  };
}

function viewerRelationships(
  participation: ProposalParticipation | undefined,
  reviewAccess: ProposalReviewAccess | undefined,
  managementOfficer: ProposalManagementOfficerResolution | undefined,
  actorId: string
): ViewerRelationshipV1[] {
  const relationships: ViewerRelationshipV1[] = [];
  for (const role of participation?.roles ?? []) {
    if (role === "none" || role === "unknown") continue;
    const type = role === "PROPOSAL_PI"
      ? "PROPOSAL_PI"
      : role === "TOPIC_SECRETARY"
        ? "TOPIC_SECRETARY"
        : "TOPIC_MEMBER";
    const effectiveFrom = participation?.relationshipEffectiveFrom[role];
    if (!effectiveFrom) continue;
    relationships.push({ type, status: "ACTIVE", effectiveFrom, effectiveUntil: participation?.relationshipEffectiveUntil?.[role] ?? null });
  }
  if (reviewAccess?.isAssignedReviewer && reviewAccess.effectiveFrom) {
    relationships.push({ type: "REVIEWER_ASSIGNMENT", status: "ACTIVE", effectiveFrom: reviewAccess.effectiveFrom, effectiveUntil: reviewAccess.effectiveUntil ?? null });
  }
  if (managementOfficer?.resolved && managementOfficer.officer?.officerUserId === actorId) {
    relationships.push({ type: "PROPOSAL_MANAGEMENT_OFFICER", status: "ACTIVE", effectiveFrom: managementOfficer.officer.effectiveFrom.toISOString(), effectiveUntil: managementOfficer.officer.effectiveUntil?.toISOString() ?? null });
  }
  return relationships.sort((left, right) => left.type.localeCompare(right.type));
}

function blockFor(action: PermissionActionV1, input: ProposalCapabilityInput): { code: AuthorizationDecisionCodeV1; reason: string } | null {
  if (action === "proposal.read" || action === "file.read") return input.canRead ? null : blocked("ACTION_NOT_GRANTED");
  if (action === "proposal.review.progress.read") {
    if (!inScope(input)) return blocked("ORG_SCOPE_DENIED");
    if (!["submitted", "resubmitted", "supplement_requested", "under_review", "ready_for_approval", "approved", "rejected"].includes(input.proposal.status)) return blocked("WORKFLOW_STATE_DENIED");
    if (isResearchManagementHead(input.actor) || isResearchOversightAuthority(input.actor) || input.actor.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY") return null;
    if (!isResearchManagementStaff(input.actor) || !isCurrentOfficer(input)) return blocked("ACTION_NOT_GRANTED");
    if (!input.participation || input.participation.role === "unknown" || !input.reviewAccess || input.reviewAccess.conflictUnresolved) return blocked("CONTEXT_UNRESOLVED");
    return hasReviewOrParticipationConflict(input) ? blocked("CONFLICT_DENIED") : null;
  }
  if (action === "proposal.draft.update" || action === "file.upload") {
    return (action === "file.upload" ? input.canManageFiles : input.canEdit) ? null : blocked(input.proposal.status === "draft" || input.proposal.status === "supplement_requested" ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
  }
  if (action === "proposal.submit") {
    if (!isInternalResearcherEligible(input.actor) || !input.participation?.isOwner) return blocked("ACTION_NOT_GRANTED");
    return input.canEdit ? null : blocked("WORKFLOW_STATE_DENIED");
  }
  if (action === "proposal.review.submit") {
    if (!input.participation || input.participation.role === "unknown") return blocked("CONTEXT_UNRESOLVED");
    if (input.participation.isParticipant) return blocked("CONFLICT_DENIED");
    if (!input.managementOfficer?.resolved) return blocked("CONTEXT_UNRESOLVED");
    if (input.managementOfficer.officer?.officerUserId === input.actor.id) return blocked("CONFLICT_DENIED");
    // Thư ký hội đồng ghi biên bản, không chấm phiếu.
    if (!input.reviewAccess?.isAssignedReviewer || !isScoringRole(input.reviewAccess.assignmentRole)) return blocked("ACTION_NOT_GRANTED");
    return input.proposal.status === "under_review" ? null : blocked("WORKFLOW_STATE_DENIED");
  }

  // Protected management actions: role, scope, resolved context and no conflict, in that order.
  if (STAFF_ACTIONS.includes(action) && !isResearchManagementStaff(input.actor)) return blocked("ACTION_NOT_GRANTED");
  if (HEAD_ACTIONS.includes(action) && !isResearchManagementHead(input.actor)) return blocked("ACTION_NOT_GRANTED");
  if (DECISION_ACTIONS.includes(action) && input.actor.systemRole !== "LEADERSHIP_APPROVAL_AUTHORITY") return blocked("ACTION_NOT_GRANTED");
  if (!STAFF_ACTIONS.includes(action) && !HEAD_ACTIONS.includes(action) && !DECISION_ACTIONS.includes(action)) return blocked("ACTION_NOT_GRANTED");
  if (!inScope(input)) return blocked("ORG_SCOPE_DENIED");
  if (!input.participation || input.participation.role === "unknown" || !input.reviewAccess || input.reviewAccess.conflictUnresolved) return blocked("CONTEXT_UNRESOLVED");
  if (hasReviewOrParticipationConflict(input)) return blocked("CONFLICT_DENIED");

  if (STAFF_ACTIONS.includes(action)) {
    if (!isCurrentOfficer(input)) return blocked("ACTION_NOT_GRANTED");
    if (action === "proposal.completeness.check" && input.completenessCheckCompleted) return blocked("WORKFLOW_STATE_DENIED");
    return ["submitted", "resubmitted"].includes(input.proposal.status) ? null : blocked("WORKFLOW_STATE_DENIED");
  }
  if (action === "proposal.review.assign") {
    if (!input.completenessCheckCompleted) return { code: "WORKFLOW_STATE_DENIED", reason: "Cần xác nhận hồ sơ đầy đủ trước khi phân công đánh giá." };
    return ["submitted", "resubmitted", "under_review"].includes(input.proposal.status) ? null : blocked("WORKFLOW_STATE_DENIED");
  }
  if (action === "proposal.review.consolidate") {
    return ["under_review", "ready_for_approval"].includes(input.proposal.status) ? null : blocked("WORKFLOW_STATE_DENIED");
  }
  if (action === "proposal.management-officer.assign" || action === "proposal.management-officer.revoke") {
    if (!input.managementOfficer?.resolved) return blocked("CONTEXT_UNRESOLVED");
    if (action === "proposal.management-officer.revoke" && !input.managementOfficer.officer) return blocked("ACTION_NOT_GRANTED");
    return null;
  }
  return input.proposal.status === "ready_for_approval" ? null : blocked("WORKFLOW_STATE_DENIED");
}

const STAFF_ACTIONS: PermissionActionV1[] = ["proposal.completeness.check", "proposal.supplement.request"];
const HEAD_ACTIONS: PermissionActionV1[] = ["proposal.review.assign", "proposal.review.consolidate", "proposal.management-officer.assign", "proposal.management-officer.revoke"];
const DECISION_ACTIONS: PermissionActionV1[] = ["proposal.decision.approve", "proposal.decision.reject"];

function inScope(input: ProposalCapabilityInput) {
  return input.actor.organizationScopes.some((scope) => scope.id === input.proposal.hostOrganizationUnitId);
}

function isCurrentOfficer(input: ProposalCapabilityInput) {
  return input.managementOfficer?.resolved === true && input.managementOfficer.officer?.officerUserId === input.actor.id;
}

function hasReviewOrParticipationConflict(input: ProposalCapabilityInput) {
  return Boolean(
    evaluateProposalConflict(input.participation).conflicted ||
    input.participation?.isParticipant ||
    input.reviewAccess?.isAssignedReviewer ||
    input.reviewAccess?.hasReviewConflict ||
    input.reviewAccess?.hasPersistedReview
  );
}

function blocked(code: AuthorizationDecisionCodeV1) {
  return { code, reason: publicAuthorizationReasonV1(code) };
}
