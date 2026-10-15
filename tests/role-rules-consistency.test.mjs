import assert from "node:assert/strict";
import test from "node:test";
import { canReadAllProjectFiles, canReadProjectFinanceDetail } from "../dist/apps/api/approved-projects/project-roles.js";
import { canSeeProjectFile } from "../dist/apps/api/modules/files/files.service.js";
import { canReadProposalDeliverables } from "../dist/apps/api/research-proposals/proposal-deliverables.service.js";

// Quy tắc vai trò dùng chung (docs/permission-matrix.md mục 7.2): một nguồn cho capability, tệp và danh sách hồ sơ.
const actor = (systemRole, id = systemRole) => ({ id, username: id, displayName: id, systemRole, unit: "unit", organizationScopes: [{ id: "unit-1", code: "U1", name: "Đơn vị 1" }] });
const ROLES = ["SYSTEM_ADMIN", "LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_OVERSIGHT_AUTHORITY", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_BOARD_HEAD", "RESEARCH_MANAGEMENT_STAFF", "RESEARCHER_INTERNAL_USER", "EXTERNAL_RESEARCHER_USER"];

test("project finance detail is fail-closed: only listed roles, the assigned officer or participants", () => {
  const always = ["LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_BOARD_HEAD"];
  for (const role of ROLES) {
    const expected = always.includes(role);
    assert.equal(canReadProjectFinanceDetail(actor(role)), expected, `${role} without relation`);
  }
  assert.equal(canReadProjectFinanceDetail(actor("RESEARCH_MANAGEMENT_STAFF"), { isAssignedOfficer: true }), true);
  assert.equal(canReadProjectFinanceDetail(actor("RESEARCH_MANAGEMENT_STAFF"), { isParticipant: true }), false, "chuyên viên: chỉ khi đang phụ trách");
  for (const role of ["RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCHER_INTERNAL_USER", "EXTERNAL_RESEARCHER_USER"]) {
    assert.equal(canReadProjectFinanceDetail(actor(role), { isParticipant: true }), true, `${role} tham gia đề tài`);
  }
  assert.equal(canReadProjectFinanceDetail(actor("RESEARCH_OVERSIGHT_AUTHORITY"), { isParticipant: true }), false, "Phó GĐ theo dõi chỉ xem tổng hợp");
  assert.equal(canReadProjectFinanceDetail(undefined), false);
});

test("all project files: Board of Directors, Head, Board Head and staff; monitors and admins do not", () => {
  const readers = ["LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_BOARD_HEAD", "RESEARCH_MANAGEMENT_STAFF"];
  for (const role of ROLES) assert.equal(canReadAllProjectFiles(actor(role)), readers.includes(role), role);
});

test("disbursement vouchers follow the finance permission; other files follow the file rule", () => {
  const voucher = { uploadedById: "officer", filePurpose: "disbursement_voucher" };
  const report = { uploadedById: "officer", filePurpose: "PROJECT_CONTRIBUTION" };
  const withFinance = { viewerRelationships: [], allowedActions: ["project.read", "project.finance.read"] };
  const withoutFinance = { viewerRelationships: [], allowedActions: ["project.read"] };
  assert.equal(canSeeProjectFile(actor("SCIENCE_DEPUTY_DIRECTOR"), withFinance, voucher), true, "Phó GĐ KH xem được chứng từ khi xem được kinh phí");
  assert.equal(canSeeProjectFile(actor("RESEARCH_MANAGEMENT_HEAD"), withFinance, report), true, "Trưởng phòng xem tệp chuyên viên tải lên");
  assert.equal(canSeeProjectFile(actor("RESEARCH_BOARD_HEAD"), withFinance, voucher), true);
  assert.equal(canSeeProjectFile(actor("RESEARCH_MANAGEMENT_STAFF", "staff2"), withoutFinance, voucher), false, "chuyên viên không phụ trách không xem chứng từ");
  assert.equal(canSeeProjectFile(actor("RESEARCH_MANAGEMENT_STAFF", "staff2"), withoutFinance, report), true);
  assert.equal(canSeeProjectFile(actor("RESEARCH_MANAGEMENT_DEPUTY_HEAD"), withFinance, report), false, "Phó phòng chỉ theo dõi");
  assert.equal(canSeeProjectFile(actor("RESEARCHER_INTERNAL_USER", "member"), withFinance, voucher), false, "thành viên chỉ xem tệp của mình");
  assert.equal(canSeeProjectFile(actor("RESEARCHER_INTERNAL_USER", "pi"), { viewerRelationships: [{ type: "TOPIC_PI" }], allowedActions: [] }, voucher), true, "chủ nhiệm xem mọi tệp");
  assert.equal(canSeeProjectFile(actor("RESEARCHER_INTERNAL_USER", "officer"), withoutFinance, voucher), true, "người tải lên luôn xem tệp của mình");
  assert.equal(canSeeProjectFile(actor("SYSTEM_ADMIN"), withFinance, report), false);
});

test("proposal deliverables: owner or in-scope management, never the system administrator", () => {
  const proposal = { ownerId: "pi", hostOrganizationUnitId: "unit-1" };
  assert.equal(canReadProposalDeliverables(actor("SYSTEM_ADMIN"), proposal), false);
  for (const role of ["RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_BOARD_HEAD", "LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_OVERSIGHT_AUTHORITY"]) {
    assert.equal(canReadProposalDeliverables(actor(role), proposal), true, role);
    assert.equal(canReadProposalDeliverables({ ...actor(role), organizationScopes: [] }, proposal), false, `${role} ngoài phạm vi`);
  }
  assert.equal(canReadProposalDeliverables(actor("RESEARCHER_INTERNAL_USER", "pi"), proposal), true, "chủ nhiệm");
  assert.equal(canReadProposalDeliverables(actor("RESEARCHER_INTERNAL_USER"), proposal), false);
});
