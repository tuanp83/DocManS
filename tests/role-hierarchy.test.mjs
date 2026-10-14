import assert from "node:assert/strict";
import test from "node:test";
import { projectViewerAuthorizationV1 } from "../dist/apps/api/approved-projects/project-capability-v1.js";
import { projectProposalViewerAuthorizationV1 } from "../dist/apps/api/permissions/proposal-capability-v1.js";
import { canReadProposal } from "../dist/apps/api/proposals-shared/proposal-access.js";
import { assertApprovalAuthority, assertCouncilSigningAuthority } from "../dist/apps/api/proposal-evaluations/proposal-evaluation-support.js";

// Phân cấp Ban giám đốc và Phòng KHQS:
//   Giám đốc: phê duyệt đề tài, kinh phí, thanh lý; ký cả những gì Phó GĐ KH ký.
//   Phó GĐ phụ trách Khoa học: ký thành lập hội đồng (đánh giá, nghiệm thu, IRB), gia hạn (không đổi kinh phí).
//   Các Phó GĐ khác: chỉ theo dõi; không xem chi tiết kinh phí từng đề tài.
//   Trưởng phòng > Phó phòng (chỉ theo dõi) > Trưởng ban > chuyên viên.

const now = new Date();
const project = { id: "project-1", ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "executing", updatedAt: now, aggregateVersion: 1, relationshipVersion: 1 };
const actor = (id, systemRole) => ({ id, username: id, displayName: id, systemRole, unit: "unit", organizationScopes: [{ id: "unit-1", code: "UNIT", name: "Unit" }] });
const has = (view, action) => view.allowedActions.includes(action);
const director = actor("director", "LEADERSHIP_APPROVAL_AUTHORITY");
const scienceDeputy = actor("pgd-kh", "SCIENCE_DEPUTY_DIRECTOR");
const otherDeputy = actor("pgd", "RESEARCH_OVERSIGHT_AUTHORITY");
const deputyHead = actor("pho-phong", "RESEARCH_MANAGEMENT_DEPUTY_HEAD");
const boardHead = actor("truong-ban", "RESEARCH_BOARD_HEAD");

test("council signing: Director and Science Deputy Director; proposal and budget approval: Director only", () => {
  assert.doesNotThrow(() => assertCouncilSigningAuthority(director));
  assert.doesNotThrow(() => assertCouncilSigningAuthority(scienceDeputy));
  assert.throws(() => assertCouncilSigningAuthority(otherDeputy), /Phó Giám đốc phụ trách Khoa học/);
  assert.doesNotThrow(() => assertApprovalAuthority(director));
  assert.throws(() => assertApprovalAuthority(scienceDeputy), /Chỉ Giám đốc/);

  const proposal = { id: "p", ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "ready_for_approval", updatedAt: now, authorizationContextUpdatedAt: now, authorizationRelationshipVersion: 1, authorizationConflictVersion: 1 };
  const none = { role: "none", label: "Không tham gia", roles: [], labels: [], isOwner: false, isParticipant: false, relationshipEffectiveFrom: {}, relationshipEffectiveUntil: {} };
  const view = (who) => projectProposalViewerAuthorizationV1({ actor: who, proposal, participation: none, reviewAccess: { isAssignedReviewer: false }, managementOfficer: { resolved: true, officer: null }, canRead: true, canEdit: false, canManageFiles: false, evaluationSummaryStatus: "ready_for_approval" });
  assert.ok(view(director).allowedActions.includes("proposal.decision.approve"));
  assert.ok(!view(scienceDeputy).allowedActions.includes("proposal.decision.approve"));
  // Mọi cấp lãnh đạo trên đều xem được tiến độ đánh giá.
  for (const who of [director, scienceDeputy, otherDeputy, deputyHead, boardHead]) assert.ok(view(who).allowedActions.includes("proposal.review.progress.read"), who.systemRole);
});

test("projects: Science Deputy signs extensions and acceptance councils; only the Director approves liquidation", () => {
  const extension = { requestType: "extension", status: "ready_for_head_decision", requesterId: "pi" };
  assert.ok(has(projectViewerAuthorizationV1({ actor: scienceDeputy, project, request: extension }), "project.extension.approve"));
  assert.ok(has(projectViewerAuthorizationV1({ actor: director, project, request: extension }), "project.extension.approve"));
  assert.ok(!has(projectViewerAuthorizationV1({ actor: otherDeputy, project, request: extension }), "project.extension.approve"));

  const pending = { ...project, status: "pending_acceptance" };
  const councilProposed = { acceptanceStatus: "COUNCIL_PROPOSED", liquidationStatus: null };
  assert.ok(has(projectViewerAuthorizationV1({ actor: scienceDeputy, project: pending, closure: councilProposed }), "project.acceptance.council.establish"));

  const concluded = { ...project, status: "accepted" };
  const liquidationDraft = { acceptanceStatus: "PASSED", liquidationStatus: "DRAFT" };
  assert.ok(has(projectViewerAuthorizationV1({ actor: director, project: concluded, closure: liquidationDraft }), "project.liquidation.approve"));
  assert.ok(!has(projectViewerAuthorizationV1({ actor: scienceDeputy, project: concluded, closure: liquidationDraft }), "project.liquidation.approve"));
});

test("other Deputy Directors and department leaders monitor projects; other Deputy Directors never read per-project finance", () => {
  for (const who of [otherDeputy, deputyHead, boardHead, scienceDeputy]) {
    const view = projectViewerAuthorizationV1({ actor: who, project });
    assert.ok(has(view, "project.read"), who.systemRole);
    assert.ok(has(view, "project.monitor"), who.systemRole);
    assert.ok(!has(view, "project.report.accept"), who.systemRole);
  }
  assert.ok(!has(projectViewerAuthorizationV1({ actor: otherDeputy, project }), "project.finance.read"));
  assert.ok(has(projectViewerAuthorizationV1({ actor: deputyHead, project }), "project.finance.read"));
  assert.ok(!has(projectViewerAuthorizationV1({ actor: scienceDeputy, project }), "project.finance.manage"), "Phó GĐ KH không quản lý kinh phí");
});

test("department leaders read every submitted proposal in their unit scope; Deputy Head only monitors", () => {
  const submitted = { ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "submitted" };
  for (const who of [deputyHead, boardHead, otherDeputy, scienceDeputy]) assert.equal(canReadProposal(who, submitted), true, who.systemRole);
  assert.equal(canReadProposal({ ...deputyHead, organizationScopes: [] }, submitted), false);
  const proposal = { id: "p", ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "under_review", updatedAt: now, authorizationContextUpdatedAt: now, authorizationRelationshipVersion: 1, authorizationConflictVersion: 1 };
  const none = { role: "none", label: "Không tham gia", roles: [], labels: [], isOwner: false, isParticipant: false, relationshipEffectiveFrom: {}, relationshipEffectiveUntil: {} };
  const view = projectProposalViewerAuthorizationV1({ actor: deputyHead, proposal, participation: none, reviewAccess: { isAssignedReviewer: false }, managementOfficer: { resolved: true, officer: null }, canRead: true, canEdit: false, canManageFiles: false, completenessCheckCompleted: true });
  assert.ok(!view.allowedActions.includes("proposal.review.assign"));
  assert.ok(!view.allowedActions.includes("proposal.management-officer.assign"));
});
