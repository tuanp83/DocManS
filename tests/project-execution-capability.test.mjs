import assert from "node:assert/strict";
import test from "node:test";
import { projectViewerAuthorizationV1 } from "../dist/apps/api/approved-projects/project-capability-v1.js";

// Chuyển từ nhánh thanhdotien278/DocManS, điều chỉnh theo mô hình 5 vai trò của nhánh này:
// chuyên viên QLKH được phân công quyết định điều chỉnh, LÃNH ĐẠO quyết định gia hạn (thay Trưởng phòng),
// lãnh đạo hoặc chuyên viên QLKH trong phạm vi phân công chuyên viên phụ trách đề tài.

const now = new Date();
const project = { id: "project-1", ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "executing", updatedAt: now, aggregateVersion: 1, relationshipVersion: 1 };
const actor = (id, systemRole, scoped = true) => ({ id, username: id, displayName: id, systemRole, unit: "unit", organizationScopes: scoped ? [{ id: "unit-1", code: "UNIT", name: "Unit" }] : [] });
const officer = { officerUserId: "staff", status: "ACTIVE", effectiveFrom: new Date(now.getTime() - 1000), effectiveUntil: null };
const has = (view, action) => view.allowedActions.includes(action);

test("PI can report and request changes but cannot decide them", () => {
  const view = projectViewerAuthorizationV1({ actor: actor("pi", "RESEARCHER_INTERNAL_USER"), project });
  assert(has(view, "project.report.submit"));
  assert(has(view, "project.adjustment.submit"));
  assert(has(view, "project.extension.submit"));
  assert(!has(view, "project.adjustment.approve"));
  assert(!has(view, "project.extension.approve"));
  assert(!has(view, "project.officer.assign"));
});

test("assigned Staff decides adjustments; Leadership decides extensions only", () => {
  const staff = projectViewerAuthorizationV1({ actor: actor("staff", "SCIENTIFIC_MANAGEMENT_STAFF"), project, projectOfficer: officer, request: { requestType: "adjustment", status: "under_staff_review", requesterId: "pi" } });
  assert(has(staff, "project.adjustment.approve"));
  assert(!has(staff, "project.extension.approve"));
  const staffOnExtension = projectViewerAuthorizationV1({ actor: actor("staff", "SCIENTIFIC_MANAGEMENT_STAFF"), project, projectOfficer: officer, request: { requestType: "extension", status: "ready_for_head_decision", requesterId: "pi" } });
  assert(!has(staffOnExtension, "project.extension.approve"));

  const leader = projectViewerAuthorizationV1({ actor: actor("leader", "LEADERSHIP_APPROVAL_AUTHORITY"), project, request: { requestType: "extension", status: "ready_for_head_decision", requesterId: "pi" } });
  assert(has(leader, "project.monitor"));
  assert(has(leader, "project.extension.approve"));
  assert(has(leader, "project.extension.reject"));
  assert(!has(leader, "project.adjustment.approve"));
  assert(!has(leader, "project.report.accept"));
});

test("Leadership is academy-wide; Staff needs the host unit scope", () => {
  const leaderNoScope = projectViewerAuthorizationV1({ actor: actor("leader", "LEADERSHIP_APPROVAL_AUTHORITY", false), project });
  assert(has(leaderNoScope, "project.read"));
  assert(has(leaderNoScope, "project.officer.assign"));
  const staffNoScope = projectViewerAuthorizationV1({ actor: actor("staff", "SCIENTIFIC_MANAGEMENT_STAFF", false), project, projectOfficer: officer });
  assert(!has(staffNoScope, "project.read"));
  assert(!has(staffNoScope, "project.adjustment.approve"));
});

test("Staff in scope reads and assigns officers but operates only when assigned", () => {
  const staff = actor("staff", "SCIENTIFIC_MANAGEMENT_STAFF");
  const unassigned = projectViewerAuthorizationV1({ actor: staff, project, request: { requestType: "adjustment", status: "under_staff_review", requesterId: "pi" } });
  assert(has(unassigned, "project.read"));
  assert(has(unassigned, "project.officer.assign"));
  assert(!has(unassigned, "project.adjustment.approve"));
  assert(!has(unassigned, "project.report.accept"));
  const expired = projectViewerAuthorizationV1({ actor: staff, project, projectOfficer: { ...officer, effectiveUntil: new Date(now.getTime() - 1) } });
  assert(!has(expired, "project.adjustment.approve"));
});

test("participants cannot manage or decide on their own project", () => {
  const conflictedStaff = projectViewerAuthorizationV1({ actor: actor("staff", "SCIENTIFIC_MANAGEMENT_STAFF"), project, projectOfficer: officer, participant: { isParticipant: true, role: "TOPIC_MEMBER" } });
  assert(!has(conflictedStaff, "project.adjustment.approve"));
  assert(!has(conflictedStaff, "project.officer.assign"));
  const conflictedLeader = projectViewerAuthorizationV1({ actor: actor("leader", "LEADERSHIP_APPROVAL_AUTHORITY"), project, participant: { isParticipant: true, role: "TOPIC_MEMBER" }, request: { requestType: "extension", status: "ready_for_head_decision", requesterId: "pi" } });
  assert(!has(conflictedLeader, "project.extension.approve"));
});

test("responsible member can contribute evidence but cannot submit or approve", () => {
  const member = projectViewerAuthorizationV1({ actor: actor("member", "RESEARCHER_INTERNAL_USER"), project, participant: { isParticipant: true, role: "TOPIC_MEMBER" }, responsibleMember: true });
  assert(has(member, "project.evidence.contribute"));
  assert(!has(member, "project.report.submit"));
  assert(!has(member, "project.adjustment.submit"));
  assert(!has(member, "project.extension.approve"));
  const unassigned = projectViewerAuthorizationV1({ actor: actor("member", "RESEARCHER_INTERNAL_USER"), project, participant: { isParticipant: true, role: "TOPIC_MEMBER" } });
  assert(!has(unassigned, "project.evidence.contribute"));
});

test("other researchers and admins see nothing", () => {
  for (const role of ["RESEARCHER_INTERNAL_USER", "EXTERNAL_RESEARCHER_USER", "SYSTEM_ADMIN"]) {
    const view = projectViewerAuthorizationV1({ actor: actor("someone", role), project });
    assert.deepEqual(view.allowedActions, [], role);
  }
});
