import assert from "node:assert/strict";
import test from "node:test";
import { canAttachStudentDocument, canCreateStudentProject, canManageStudentProject, canReadStudentProject, studentProjectReadFilter } from "../dist/apps/api/student-research/student-research-access.js";
import { completeStudentProjectPipe, createStudentProjectPipe } from "../dist/apps/api/student-research/dto/create-student-project.dto.js";
import { uploadStudentDocumentPipe } from "../dist/apps/api/student-research/dto/upload-student-document.dto.js";

// NCKH sinh viên: phân quyền và kiểm tra dữ liệu đầu vào.

const actor = (id, systemRole, scopes = ["unit-a"]) => ({ id, username: id, displayName: id, systemRole, unit: "", organizationScopes: scopes.map((scope) => ({ id: scope, code: scope, name: scope })) });
const project = { officerId: "creator", supervisorId: "teacher", organizationUnitId: "unit-a" };

test("management needs research-management role and the project's unit (or being its creator)", () => {
  assert.equal(canManageStudentProject(actor("s1", "RESEARCH_MANAGEMENT_STAFF"), project), true);
  assert.equal(canManageStudentProject(actor("h1", "RESEARCH_MANAGEMENT_HEAD"), project), false);
  assert.equal(canManageStudentProject(actor("s2", "RESEARCH_MANAGEMENT_STAFF", ["unit-b"]), project), false);
  assert.equal(canManageStudentProject(actor("creator", "RESEARCH_MANAGEMENT_STAFF", ["unit-b"]), { ...project, organizationUnitId: null }), true);
  for (const role of ["RESEARCHER_INTERNAL_USER", "EXTERNAL_RESEARCHER_USER", "SYSTEM_ADMIN", "LEADERSHIP_APPROVAL_AUTHORITY"]) assert.equal(canManageStudentProject(actor("x", role), project), false, role);
});

test("reading: managers and the project's own supervisor only", () => {
  assert.equal(canReadStudentProject(actor("l", "LEADERSHIP_APPROVAL_AUTHORITY", []), project), false);
  assert.equal(canReadStudentProject(actor("o", "RESEARCH_OVERSIGHT_AUTHORITY", []), project), false);
  assert.equal(canReadStudentProject(actor("teacher", "RESEARCHER_INTERNAL_USER"), project), true);
  assert.equal(canReadStudentProject(actor("other", "RESEARCHER_INTERNAL_USER"), project), false);
  assert.equal(canReadStudentProject(actor("ext", "EXTERNAL_RESEARCHER_USER"), project), false);
  assert.equal(canReadStudentProject(actor("admin", "SYSTEM_ADMIN"), project), false);
  assert.equal(canAttachStudentDocument(actor("teacher", "RESEARCHER_INTERNAL_USER"), project), true);
  assert.equal(canAttachStudentDocument(actor("l", "LEADERSHIP_APPROVAL_AUTHORITY", []), project), false);
});

test("creation requires research management with the chosen unit in scope", () => {
  assert.equal(canCreateStudentProject(actor("s", "RESEARCH_MANAGEMENT_STAFF"), "unit-a"), true);
  assert.equal(canCreateStudentProject(actor("s", "RESEARCH_MANAGEMENT_STAFF"), "unit-b"), false);
  assert.equal(canCreateStudentProject(actor("r", "RESEARCHER_INTERNAL_USER"), "unit-a"), false);
});

test("list filter mirrors read access", () => {
  assert.deepEqual(studentProjectReadFilter(actor("l", "LEADERSHIP_APPROVAL_AUTHORITY", [])), { OR: [{ supervisorId: "l" }] });
  assert.deepEqual(studentProjectReadFilter(actor("r", "RESEARCHER_INTERNAL_USER")), { OR: [{ supervisorId: "r" }] });
  assert.deepEqual(studentProjectReadFilter(actor("s", "RESEARCH_MANAGEMENT_STAFF")), { OR: [{ supervisorId: "s" }, { officerId: "s" }, { organizationUnitId: { in: ["unit-a"] } }] });
});

test("input validation: required fields, YYYY-MM-DD dates, score 0–10, known document types", () => {
  const valid = { code: " SV-01 ", name: "Đề tài", studentName: "Nguyễn A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a", startDate: "2026-10-01", endDate: "2027-05-31", status: "COMPLETED", score: 10 };
  const parsed = createStudentProjectPipe.transform(valid);
  assert.equal(parsed.code, "SV-01");
  assert.equal(parsed.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal("status" in parsed || "score" in parsed, false, "no mass assignment");
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, code: " " }));
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, organizationUnitId: undefined }));
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, startDate: "01/10/2026" }));
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, endDate: "2026-09-01" }));
  assert.deepEqual(completeStudentProjectPipe.transform({ score: "8.75", award: "Giải Nhất" }), { score: 8.75, award: "Giải Nhất" });
  assert.deepEqual(completeStudentProjectPipe.transform({}), { score: undefined, award: undefined });
  assert.equal(completeStudentProjectPipe.transform({ score: 8.1 }).score, 8.1, "8.1 × 100 is not exactly 810 in floating point");
  assert.throws(() => completeStudentProjectPipe.transform({ score: 85 }));
  assert.throws(() => completeStudentProjectPipe.transform({ score: 8.123 }));
  assert.deepEqual(uploadStudentDocumentPipe.transform({ documentType: "final_report", fileId: "f1" }), { documentType: "FINAL_REPORT", fileId: "f1" });
  assert.throws(() => uploadStudentDocumentPipe.transform({ documentType: "Báo cáo giữa kỳ", fileId: "f1" }));
});
