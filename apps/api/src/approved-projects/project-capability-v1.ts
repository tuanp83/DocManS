// @ts-ignore runtime package is JavaScript; API imports the TypeScript contract.
import type { AuthorizationDecisionCodeV1, PermissionActionV1, ViewerAuthorizationV1, ViewerRelationshipV1 } from "@rtms/permissions";
import type { SafeUserContext } from "../auth/auth.types.js";
import { publicAuthorizationReasonV1 } from "../permissions/authorization-v1.service.js";
import { canAssignProjectOfficer, canDecideProjectExtension, isInProjectScope, isProjectLeadership, isProjectStaff } from "./project-roles.js";

export const PROJECT_ACTIONS: PermissionActionV1[] = [
  "project.read", "project.monitor", "project.setup.configure", "project.setup.confirm", "project.officer.assign", "project.officer.revoke",
  "project.report.draft", "project.report.submit", "project.report.review", "project.report.request-supplement", "project.report.accept",
  "project.evidence.contribute",
  "project.adjustment.create", "project.adjustment.edit-draft", "project.adjustment.submit", "project.adjustment.review", "project.adjustment.request-supplement", "project.adjustment.approve", "project.adjustment.reject",
  "project.extension.create", "project.extension.edit-draft", "project.extension.submit", "project.extension.validate", "project.extension.prepare", "project.extension.request-supplement", "project.extension.approve", "project.extension.reject",
  "project.history.read",
  "project.progress.update", "project.health.assess",
  "project.acceptance.submit", "project.acceptance.return", "project.acceptance.council.propose", "project.acceptance.council.establish",
  "project.acceptance.minutes.record", "project.acceptance.revision.submit", "project.acceptance.revision.confirm",
  "project.finance.read", "project.finance.manage", "project.liquidation.prepare", "project.liquidation.approve", "project.close",
  "project.product.manage", "project.product.submit", "project.product.review",
  "project.superior.prepare", "project.superior.send", "project.superior.result"
];

/** Trạng thái một vòng nghiệm thu (project_acceptances.status). */
export const ACCEPTANCE_ROUND_STATUSES = {
  submitted: "SUBMITTED",
  returned: "RETURNED",
  councilProposed: "COUNCIL_PROPOSED",
  councilEstablished: "COUNCIL_ESTABLISHED",
  revisionRequired: "REVISION_REQUIRED",
  revisionSubmitted: "REVISION_SUBMITTED",
  passed: "PASSED",
  failed: "FAILED"
} as const;
export const CLOSED_ACCEPTANCE_ROUND_STATUSES: string[] = [ACCEPTANCE_ROUND_STATUSES.returned, ACCEPTANCE_ROUND_STATUSES.passed, ACCEPTANCE_ROUND_STATUSES.failed];
export const LIQUIDATION_STATUSES = { draft: "DRAFT", approved: "APPROVED" } as const;
export const SUPERIOR_STATUSES = { preparing: "PREPARING", sent: "SENT", passed: "PASSED", failed: "FAILED" } as const;
/** Cấp đề tài phải được cấp trên nghiệm thu sau nghiệm thu cơ sở. */
export const SUPERIOR_ACCEPTANCE_LEVELS = ["ministry-level", "national-level"];

export const PROJECT_STATUSES = {
  preparing: "preparing",
  executing: "executing",
  paused: "paused",
  pendingAcceptance: "pending_acceptance",
  /** Đề tài cấp Bộ / Nhà nước đã nghiệm thu cơ sở, chờ cấp trên nghiệm thu. */
  pendingSuperiorAcceptance: "pending_superior_acceptance",
  accepted: "accepted",
  failed: "failed",
  closed: "closed"
} as const;

export type ProjectOfficerFact = {
  officerUserId: string;
  status: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

export type ProjectCapabilityInput = {
  actor: SafeUserContext;
  project: {
    id: string;
    ownerId: string;
    hostOrganizationUnitId: string;
    status: string;
    updatedAt: Date;
    aggregateVersion?: number;
    relationshipVersion?: number;
    conflictVersion?: number;
    delegationVersion?: number;
  };
  projectOfficer?: ProjectOfficerFact | null;
  participant?: { isParticipant: boolean; role?: string; effectiveFrom?: string; effectiveUntil?: string | null };
  responsibleMember?: boolean;
  request?: { requestType: string; status: string; requesterId: string };
  report?: { status: string; authorId: string };
  /** Vòng nghiệm thu gần nhất và biên bản thanh lý (nếu có). */
  closure?: { acceptanceStatus: string | null; liquidationStatus: string | null; superiorStatus?: string | null };
};

// Ánh xạ vai trò của nhánh này: xem project-roles.ts.
function isStaff(actor: SafeUserContext) { return isProjectStaff(actor); }
function isLeadership(actor: SafeUserContext) { return isProjectLeadership(actor); }
function inScope(actor: SafeUserContext, project: ProjectCapabilityInput["project"]) { return isInProjectScope(actor, project.hostOrganizationUnitId); }
function activeOfficer(officer: ProjectOfficerFact | null | undefined, actorId: string, asOf = new Date()) {
  return !!officer && officer.status === "ACTIVE" && officer.officerUserId === actorId && officer.effectiveFrom <= asOf && (officer.effectiveUntil === null || asOf < officer.effectiveUntil);
}
function blocked(code: AuthorizationDecisionCodeV1) { return { code, reason: publicAuthorizationReasonV1(code) }; }

export function projectViewerAuthorizationV1(input: ProjectCapabilityInput): ViewerAuthorizationV1 {
  const scoped = inScope(input.actor, input.project);
  const officerFact = input.projectOfficer && activeOfficer(input.projectOfficer, input.actor.id) ? input.projectOfficer : null;
  const hasOfficer = officerFact !== null;
  const participant = input.participant?.isParticipant === true;
  const isPi = input.project.ownerId === input.actor.id && scoped;
  // Đọc/theo dõi: giống quyền đọc đề xuất của nhánh này — chuyên viên QLKH có phạm vi đơn vị và lãnh đạo
  // xem được mọi đề tài trong phạm vi; chủ nhiệm và thành viên xem đề tài của mình.
  const canRead = scoped && (isPi || participant || isLeadership(input.actor) || isStaff(input.actor));
  const canMonitor = canRead;
  // Thao tác nghiệp vụ: chỉ chuyên viên đang được phân công phụ trách chính, không tham gia đề tài.
  const canOperate = scoped && isStaff(input.actor) && hasOfficer && !participant && !isPi;
  const canAssignOfficer = scoped && canAssignProjectOfficer(input.actor) && !participant && !isPi;
  // Quyết định gia hạn: lãnh đạo (thay Trưởng phòng ở nhánh chính).
  const canHeadDecide = scoped && canDecideProjectExtension(input.actor) && !participant && !isPi;
  const canPi = isPi && input.project.status === PROJECT_STATUSES.executing;
  const statusesForExecution = [PROJECT_STATUSES.executing, PROJECT_STATUSES.paused];
  const inExecution = statusesForExecution.includes(input.project.status as typeof PROJECT_STATUSES.executing | typeof PROJECT_STATUSES.paused);

  const blockedActions: Array<{ action: PermissionActionV1; code: AuthorizationDecisionCodeV1; reason: string }> = [];
  const allowedActions: PermissionActionV1[] = [];
  for (const action of PROJECT_ACTIONS) {
    const denial = projectActionDenial(action, { ...input, scoped, officer: hasOfficer, participantActive: participant, isPi, canRead, canMonitor, canOperate, canAssignOfficer, canHeadDecide, canPi, inExecution });
    if (denial) blockedActions.push({ action, ...denial });
    else allowedActions.push(action);
  }

  const viewerRelationships: ViewerRelationshipV1[] = [];
  if (isPi) viewerRelationships.push({ type: "TOPIC_PI", status: "ACTIVE", effectiveFrom: input.participant?.effectiveFrom ?? input.project.updatedAt.toISOString(), effectiveUntil: input.participant?.effectiveUntil ?? null });
  if (participant && input.participant?.role) viewerRelationships.push({ type: input.participant.role === "TOPIC_SECRETARY" ? "TOPIC_SECRETARY" : "TOPIC_MEMBER", status: "ACTIVE", effectiveFrom: input.participant.effectiveFrom ?? input.project.updatedAt.toISOString(), effectiveUntil: input.participant.effectiveUntil ?? null });
  if (officerFact) viewerRelationships.push({ type: "PROJECT_MANAGEMENT_OFFICER", status: "ACTIVE", effectiveFrom: officerFact.effectiveFrom.toISOString(), effectiveUntil: officerFact.effectiveUntil?.toISOString() ?? null });
  viewerRelationships.sort((left, right) => left.type.localeCompare(right.type));

  return {
    schemaVersion: "v1",
    systemRole: input.actor.systemRole,
    viewerRelationships,
    allowedActions: allowedActions.sort(),
    blockedActions: blockedActions.sort((left, right) => left.action.localeCompare(right.action)),
    policyVersion: "v1",
    evaluatedAsOf: new Date().toISOString(),
    contextVersion: {
      domain: "approved-project",
      recordId: input.project.id,
      aggregateVersion: input.project.aggregateVersion ?? input.project.updatedAt.getTime(),
      relationshipVersion: input.project.relationshipVersion ?? 0,
      conflictVersion: input.project.conflictVersion ?? 0,
      delegationVersion: input.project.delegationVersion ?? 0,
      policyVersion: "v1"
    },
    accessReasons: [isPi ? "TOPIC_PI" : "", participant ? (input.participant?.role ?? "TOPIC_MEMBER") : "", hasOfficer ? "PROJECT_MANAGEMENT_OFFICER" : "", isStaff(input.actor) && scoped && !hasOfficer ? "RESEARCH_MANAGEMENT_STAFF_SCOPE" : "", isLeadership(input.actor) ? "LEADERSHIP_APPROVAL_AUTHORITY_OVERSIGHT" : ""].filter(Boolean)
  };
}

function projectActionDenial(action: PermissionActionV1, input: ProjectCapabilityInput & { scoped: boolean; officer: boolean; participantActive: boolean; isPi: boolean; canRead: boolean; canMonitor: boolean; canOperate: boolean; canAssignOfficer: boolean; canHeadDecide: boolean; canPi: boolean; inExecution: boolean }): { code: AuthorizationDecisionCodeV1; reason: string } | null {
  if (action === "project.read" || action === "project.history.read") return input.canRead ? null : blocked("ACTION_NOT_GRANTED");
  if (action === "project.monitor") return input.canMonitor ? null : blocked("ACTION_NOT_GRANTED");
  if (action === "project.setup.configure" || action === "project.setup.confirm") return input.canOperate && input.project.status === PROJECT_STATUSES.preparing ? null : blocked(input.project.status === PROJECT_STATUSES.preparing ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
  if (action === "project.officer.assign" || action === "project.officer.revoke") return input.canAssignOfficer ? null : blocked("ACTION_NOT_GRANTED");
  if (action === "project.report.draft" || action === "project.report.submit") return input.canPi && input.isPi ? null : blocked(input.inExecution ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
  if (action === "project.evidence.contribute") return input.project.status === PROJECT_STATUSES.executing && input.scoped && (input.isPi || (input.participantActive && input.responsibleMember)) ? null : blocked(input.inExecution ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
  // Tiến độ (docs/design/quan-ly-tien-do-nhiem-vu.md, mục 5): chủ nhiệm cập nhật mọi mốc, thành viên chỉ mốc mình
  // phụ trách (kiểm tra theo từng mốc ở service); chỉ khi đề tài đang thực hiện.
  if (action === "project.progress.update") {
    const eligible = input.scoped && (input.isPi || (input.participantActive && input.responsibleMember === true));
    return eligible && input.project.status === PROJECT_STATUSES.executing ? null : blocked(eligible ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  }
  // Đánh giá sức khoẻ: chuyên viên đang được phân công phụ trách, khi đề tài đang thực hiện hoặc tạm dừng.
  if (action === "project.health.assess") return input.canOperate && input.inExecution ? null : blocked(input.canOperate ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  if (action === "project.report.review") return input.canOperate && (!input.report || ["submitted", "under_review"].includes(input.report.status)) ? null : blocked(input.report && !["submitted", "under_review"].includes(input.report.status) ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  if (action === "project.report.request-supplement") return input.canOperate && (!input.report || ["submitted", "under_review"].includes(input.report.status)) ? null : blocked(input.report && !["submitted", "under_review"].includes(input.report.status) ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  if (action === "project.report.accept") return input.canOperate && (!input.report || input.report.status === "under_review") ? null : blocked(input.report && input.report.status !== "under_review" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  if (action.startsWith("project.acceptance.") || action.startsWith("project.finance.") || action.startsWith("project.liquidation.") || action.startsWith("project.product.") || action.startsWith("project.superior.") || action === "project.close") {
    return closureActionDenial(action, input);
  }
  if (action.startsWith("project.adjustment.")) {
    if (["project.adjustment.create", "project.adjustment.edit-draft", "project.adjustment.submit"].includes(action)) return input.canPi && input.isPi ? null : blocked(input.inExecution ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
    if (action === "project.adjustment.review") return input.canOperate && (!input.request || (input.request.requestType === "adjustment" && input.request.status === "submitted")) ? null : blocked(input.request && input.request.requestType === "adjustment" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
    if (action === "project.adjustment.request-supplement") return input.canOperate && (!input.request || (input.request.requestType === "adjustment" && ["submitted", "under_staff_review"].includes(input.request.status))) ? null : blocked(input.request && input.request.requestType === "adjustment" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
    if (action === "project.adjustment.approve" || action === "project.adjustment.reject") return input.canOperate && (!input.request || (input.request.requestType === "adjustment" && input.request.status === "under_staff_review")) ? null : blocked(input.request && input.request.requestType === "adjustment" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  }
  if (action.startsWith("project.extension.")) {
    if (["project.extension.create", "project.extension.edit-draft", "project.extension.submit"].includes(action)) return input.canPi && input.isPi ? null : blocked(input.inExecution ? "ACTION_NOT_GRANTED" : "WORKFLOW_STATE_DENIED");
    if (action === "project.extension.validate") return input.canOperate && (!input.request || (input.request.requestType === "extension" && input.request.status === "submitted")) ? null : blocked(input.request && input.request.requestType === "extension" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
    if (action === "project.extension.prepare") return input.canOperate && (!input.request || (input.request.requestType === "extension" && input.request.status === "under_staff_validation")) ? null : blocked(input.request && input.request.requestType === "extension" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
    if (action === "project.extension.request-supplement") return (input.canOperate && !!input.request && input.request.requestType === "extension" && ["submitted", "under_staff_validation"].includes(input.request.status)) || (input.canHeadDecide && !!input.request && input.request.requestType === "extension" && input.request.status === "ready_for_head_decision") ? null : blocked(input.request && input.request.requestType === "extension" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
    if (action === "project.extension.approve" || action === "project.extension.reject") return input.canHeadDecide && (!input.request || (input.request.requestType === "extension" && input.request.status === "ready_for_head_decision")) ? null : blocked(input.request && input.request.requestType === "extension" ? "WORKFLOW_STATE_DENIED" : "ACTION_NOT_GRANTED");
  }
  return blocked("ACTION_NOT_GRANTED");
}

type DenialInput = ProjectCapabilityInput & { scoped: boolean; participantActive: boolean; isPi: boolean; canRead: boolean; canOperate: boolean; canHeadDecide: boolean };

/**
 * Nghiệm thu → thanh lý → đóng (docs/design/nghiem-thu-thanh-ly-dong-de-tai.md):
 *   - Chủ nhiệm nộp hồ sơ nghiệm thu khi đề tài đang thực hiện, nộp bản hoàn thiện khi hội đồng yêu cầu.
 *   - Chuyên viên phụ trách: trả hồ sơ, đề xuất hội đồng, ghi biên bản, xác nhận hoàn thiện, lập thanh lý, đóng đề tài.
 *   - Lãnh đạo: thành lập hội đồng, phê duyệt thanh lý.
 *   - Kinh phí: lãnh đạo hoặc cán bộ QLKH có phạm vi đơn vị (như trước đây), không tham gia đề tài; khoá khi đã thanh lý.
 */
function closureActionDenial(action: PermissionActionV1, input: DenialInput): { code: AuthorizationDecisionCodeV1; reason: string } | null {
  const status = input.project.status;
  const acceptance = input.closure?.acceptanceStatus ?? null;
  const liquidation = input.closure?.liquidationStatus ?? null;
  const R = ACCEPTANCE_ROUND_STATUSES;
  const pending = status === PROJECT_STATUSES.pendingAcceptance;
  const concluded = status === PROJECT_STATUSES.accepted || status === PROJECT_STATUSES.failed;
  const gate = (eligible: boolean, stateOk: boolean) => (!eligible ? blocked("ACTION_NOT_GRANTED") : stateOk ? null : blocked("WORKFLOW_STATE_DENIED"));
  const pi = input.isPi && input.scoped;
  switch (action) {
    case "project.acceptance.submit": return gate(pi, status === PROJECT_STATUSES.executing);
    case "project.acceptance.revision.submit": return gate(pi, pending && acceptance === R.revisionRequired);
    case "project.acceptance.return": return gate(input.canOperate, pending && acceptance === R.submitted);
    case "project.acceptance.council.propose": return gate(input.canOperate, pending && (acceptance === R.submitted || acceptance === R.councilProposed));
    case "project.acceptance.council.establish": return gate(input.canHeadDecide, pending && acceptance === R.councilProposed);
    case "project.acceptance.minutes.record": return gate(input.canOperate, pending && acceptance === R.councilEstablished);
    case "project.acceptance.revision.confirm": return gate(input.canOperate, pending && acceptance === R.revisionSubmitted);
    case "project.finance.read": return input.canRead ? null : blocked("ACTION_NOT_GRANTED");
    case "project.finance.manage": {
      const manager = input.scoped && (isStaff(input.actor) || isLeadership(input.actor)) && !input.participantActive && !input.isPi;
      return gate(manager, status !== PROJECT_STATUSES.closed && liquidation !== LIQUIDATION_STATUSES.approved);
    }
    case "project.liquidation.prepare": return gate(input.canOperate, concluded && liquidation !== LIQUIDATION_STATUSES.approved);
    case "project.liquidation.approve": return gate(input.canHeadDecide, concluded && liquidation === LIQUIDATION_STATUSES.draft);
    case "project.close": return gate(input.canOperate, concluded && liquidation === LIQUIDATION_STATUSES.approved);
    // Sản phẩm (nội dung công việc): chuyên viên lập danh sách khi chuẩn bị / đang thực hiện; chủ nhiệm nộp minh chứng;
    // chuyên viên lập tổ chuyên gia và ghi kết quả. Trạng thái từng sản phẩm được kiểm tra ở service.
    case "project.product.manage": return gate(input.canOperate, status === PROJECT_STATUSES.preparing || status === PROJECT_STATUSES.executing);
    case "project.product.submit": return gate(pi, status === PROJECT_STATUSES.executing);
    case "project.product.review": return gate(input.canOperate, status === PROJECT_STATUSES.executing);
    // Cấp trên: chuyên viên chuẩn bị hồ sơ, gửi công văn, ghi kết quả.
    case "project.superior.prepare":
    case "project.superior.send": return gate(input.canOperate, status === PROJECT_STATUSES.pendingSuperiorAcceptance && input.closure?.superiorStatus === SUPERIOR_STATUSES.preparing);
    case "project.superior.result": return gate(input.canOperate, status === PROJECT_STATUSES.pendingSuperiorAcceptance && input.closure?.superiorStatus === SUPERIOR_STATUSES.sent);
    default: return blocked("ACTION_NOT_GRANTED");
  }
}

export function projectContextVersion(project: Record<string, any>) {
  return {
    domain: "approved-project",
    recordId: project.id,
    aggregateVersion: project.aggregateVersion ?? project.updatedAt.getTime(),
    relationshipVersion: project.relationshipVersion ?? 0,
    conflictVersion: project.conflictVersion ?? 0,
    delegationVersion: project.delegationVersion ?? 0,
    policyVersion: "v1"
  };
}
