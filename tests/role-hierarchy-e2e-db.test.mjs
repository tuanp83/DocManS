import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { ProposalParticipationService } from "../dist/apps/api/research-proposals/proposal-participation.service.js";
import { ProposalReviewAccessService } from "../dist/apps/api/proposals-shared/proposal-review-access.service.js";
import { ProposalManagementOfficerService } from "../dist/apps/api/proposals-shared/proposal-management-officer.service.js";
import { ResearchProposalsService } from "../dist/apps/api/research-proposals/research-proposals.service.js";
import { ProposalReviewAssignmentsService } from "../dist/apps/api/proposal-evaluations/proposal-review-assignments.service.js";
import { ProposalReviewsService } from "../dist/apps/api/proposal-evaluations/proposal-reviews.service.js";
import { ProposalEvaluationSummaryService } from "../dist/apps/api/proposal-evaluations/proposal-evaluation-summary.service.js";
import { ProposalDecisionsService } from "../dist/apps/api/proposal-evaluations/proposal-decisions.service.js";
import { EvaluationCoordinationService } from "../dist/apps/api/proposal-evaluations/evaluation-coordination.service.js";
import { ApprovalRoutingService } from "../dist/apps/api/approvals/approval-routing.service.js";

// Toàn luồng trên PostgreSQL thật với đủ vai trò (GĐ5):
// chủ nhiệm nộp → tự giao chuyên viên theo mảng → chuyên viên kiểm tra đầy đủ, mời hội đồng → thành viên nhận lời
// → tờ trình hội đồng qua Trưởng ban, Trưởng phòng → Phó GĐ KH ký → chấm phiếu → thư ký tổng hợp → gói phê duyệt
// qua Trưởng ban, Trưởng phòng → Giám đốc phê duyệt. Mỗi bước kiểm tra người không đúng vai trò bị chặn.

let database;
let db;
let authStore;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase("role_hierarchy_e2e");
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
  authStore = new AuthStore(db);
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

const FULL_SCORES = { "scientific-value": 26, feasibility: 21, "practical-impact": 22, "budget-suitability": 17 };

function services() {
  const auditLog = new AuditLogService(db);
  const participation = new ProposalParticipationService(db);
  const reviewAccess = new ProposalReviewAccessService(db);
  const officers = new ProposalManagementOfficerService(db);
  const assignments = new ProposalReviewAssignmentsService(db, auditLog, participation, reviewAccess);
  const reviews = new ProposalReviewsService(db, auditLog, reviewAccess, participation);
  const summaries = new ProposalEvaluationSummaryService(db, auditLog, assignments, reviews, participation, reviewAccess);
  return {
    proposals: new ResearchProposalsService(db, auditLog, participation, reviewAccess, officers),
    assignments,
    reviews,
    summaries,
    decisions: new ProposalDecisionsService(db, auditLog, participation, reviewAccess, assignments, reviews, summaries),
    coordination: new EvaluationCoordinationService(db, auditLog),
    routing: new ApprovalRoutingService(db)
  };
}

async function account(username, systemRole, units) {
  const user = await db.user.create({
    data: {
      username, usernameKey: username, displayName: username, passwordHash: "test-only", status: "active", systemRole, unit: units[0].name,
      organizationScopes: { create: units.map((unit, index) => ({ organizationUnitId: unit.id, isPrimary: index === 0 })) }
    }
  });
  return authStore.toSafeUser(await authStore.findUserById(user.id));
}

test("a proposal goes from submission to the Director's approval through every role of the hierarchy", async () => {
  const s = services();
  const khoa = await db.organizationUnit.create({ data: { code: "KHOA-E2E", name: "Khoa Nội E2E", unitType: "FACULTY" } });
  const phong = await db.organizationUnit.create({ data: { code: "KHQS-E2E", name: "Phòng KHQS E2E", unitType: "DEPARTMENT" } });
  for (const [type, code, name] of [["research-field", "biomedical-tech", "Công nghệ y sinh"], ["proposal-type", "grassroots-level", "Đề tài cấp Cơ sở"]]) {
    await db.catalogItem.create({ data: { type, code, name } });
  }
  const both = [phong, khoa];
  const head = await account("truongphong", "RESEARCH_MANAGEMENT_HEAD", both);
  const deputyHead = await account("phophong", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", both);
  const board = await account("truongban", "RESEARCH_BOARD_HEAD", both);
  const officer = await account("chuyenvien", "RESEARCH_MANAGEMENT_STAFF", both);
  const otherStaff = await account("chuyenvien2", "RESEARCH_MANAGEMENT_STAFF", both);
  const director = await account("giamdoc", "LEADERSHIP_APPROVAL_AUTHORITY", both);
  const scienceDeputy = await account("pgdkh", "SCIENCE_DEPUTY_DIRECTOR", both);
  const otherDeputy = await account("pgd", "RESEARCH_OVERSIGHT_AUTHORITY", both);
  const pi = await account("chunhiem", "RESEARCHER_INTERNAL_USER", [khoa]);
  const council = [];
  for (const [role, name] of [["reviewer_1", "pb1"], ["reviewer_2", "pb2"], ["chair", "ct"], ["member", "uv1"], ["member", "uv2"], ["secretary", "tk"]]) {
    council.push({ role, account: await account(name, "RESEARCHER_INTERNAL_USER", [khoa]) });
  }

  // Trưởng phòng (hoặc Trưởng ban) giao mảng: chuyên viên phụ trách đề tài cấp Cơ sở. Phó phòng, chuyên viên không giao được.
  await assert.rejects(() => s.coordination.setPortfolio(deputyHead, officer.id, { rules: [{ proposalLevel: "grassroots-level" }] }), { status: 403 });
  await assert.rejects(() => s.coordination.setPortfolio(otherStaff, officer.id, { rules: [{ proposalLevel: "grassroots-level" }] }), { status: 403 });
  await s.coordination.setPortfolio(board, officer.id, { rules: [{ proposalLevel: "grassroots-level" }] });
  await s.coordination.setPortfolio(head, officer.id, { rules: [{ proposalLevel: "grassroots-level" }] });

  // Chủ nhiệm lập và nộp hồ sơ; hồ sơ tự giao cho chuyên viên phụ trách mảng.
  const intake = await db.proposalIntakePeriod.create({ data: { code: "DOT-E2E", title: "Đợt E2E", status: "open", startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 30 * 86_400_000), requiredPackage: [] } });
  const draft = await s.proposals.createDraft(pi, {
    intakePeriodId: intake.id, hostOrganizationUnitId: khoa.id, title: "Đề tài kiểm thử toàn luồng", researchFieldCode: "biomedical-tech", proposalTypeCode: "grassroots-level",
    militaryScope: "military", startDate: "2027-01-01", endDate: "2027-12-31", objectives: "Mục tiêu", summary: "Tóm tắt", budgetMetadata: { amount: 150000000, currency: "VND" }
  });
  await s.proposals.submitProposal(pi, draft.id);
  const vnYear = new Date(Date.now() + 7 * 3_600_000).getUTCFullYear();
  assert.equal((await db.researchProposal.findUnique({ where: { id: draft.id } })).code, `${vnYear}-KHOA-E2E-001`, "nộp lần đầu được cấp mã số");
  const officerRow = await db.proposalManagementOfficer.findFirst({ where: { proposalId: draft.id, status: "ACTIVE" } });
  assert.equal(officerRow.officerUserId, officer.id, "tự giao theo mảng Cơ sở");
  const id = draft.id;

  // Mã số: chuyên viên phụ trách sửa được kèm lý do (ghi nhật ký); chuyên viên khác, chủ nhiệm bị chặn; không trùng mã.
  await assert.rejects(() => s.proposals.updateCode(otherStaff, id, { code: "DT-E2E-01", reason: "Sửa theo sổ đăng ký" }), { status: 403 });
  await assert.rejects(() => s.proposals.updateCode(pi, id, { code: "DT-E2E-01", reason: "Sửa theo sổ đăng ký" }), { status: 403 });
  await s.proposals.updateCode(officer, id, { code: "ĐT.HVQY.2026-01", reason: "Sửa theo sổ đăng ký" });
  assert.equal((await db.researchProposal.findUnique({ where: { id } })).code, "ĐT.HVQY.2026-01");
  const codeAudit = await db.auditLog.findFirst({ where: { action: "update-proposal-code", targetEntityId: id } });
  assert.equal(codeAudit.reason, "Sửa theo sổ đăng ký");
  const other = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: khoa.id, title: "Hồ sơ khác", status: "submitted", code: "TRUNG-MA" } });
  await assert.rejects(() => s.proposals.updateCode(officer, id, { code: other.code, reason: "Thử trùng" }), { status: 409 });

  // Chỉ chuyên viên phụ trách điều phối; chuyên viên khác bị chặn; Phó phòng và Trưởng ban xem được (chỉ xem).
  await s.proposals.completeCheck(officer, id, {});
  await assert.rejects(() => s.decisions.proposeCouncil(otherStaff, id, { members: [], action: "save" }), /chuyên viên phụ trách/);
  assert.equal((await s.coordination.overview(deputyHead)).viewerRole, "department");
  assert.ok((await s.coordination.overview(officer)).proposals.some((row) => row.id === id));
  assert.ok(!(await s.coordination.overview(otherStaff)).proposals.some((row) => row.id === id));

  // Mời hội đồng; thành viên nhận lời; trình qua Phòng.
  const members = council.map(({ role, account: who }) => ({ role, userId: who.id, displayName: who.displayName }));
  await s.decisions.proposeCouncil(officer, id, { members, action: "invite", meetingDate: "2027-02-15" });
  for (const { account: who } of council) {
    const [invitation] = await s.assignments.listMyAssignments(who);
    assert.equal(invitation.invitationPending, true);
    await s.assignments.respondToInvitation(who, id, invitation.id, { response: "accept" });
  }
  await s.decisions.proposeCouncil(officer, id, { members, action: "submit", meetingDate: "2027-02-15" });
  await assert.rejects(() => s.decisions.approveCouncil(director, id, {}), /chưa tới Ban giám đốc/);
  const councilSubmission = (await s.routing.inbox(board)).submissions.find((item) => item.subjectId === id);
  assert.equal(councilSubmission.kind, "EVALUATION_COUNCIL");
  await assert.rejects(() => s.routing.advance(deputyHead, councilSubmission.id, {}), { status: 403 });
  await s.routing.advance(board, councilSubmission.id, { note: "Đủ thành phần" });
  await s.routing.advance(head, councilSubmission.id, { note: "Đồng ý" });
  await assert.rejects(() => s.decisions.approveCouncil(otherDeputy, id, {}), { status: 403 });
  const signed = await s.decisions.approveCouncil(scienceDeputy, id, {});
  assert.equal(signed.councilMetadata.status, "approved");

  // Các thành viên chấm phiếu; thư ký tổng hợp và trình gói.
  for (const { role, account: who } of council) {
    if (role === "secretary") continue;
    await s.reviews.submitMyReview(who, id, { scoreData: FULL_SCORES, comment: "Đạt yêu cầu", recommendation: "approve" });
  }
  const secretary = council.find((item) => item.role === "secretary").account;
  await s.summaries.saveEvaluationSummary(secretary, id, { summary: "Hội đồng thống nhất đề nghị phê duyệt", recommendation: "approve" });
  await s.summaries.finalizeEvaluationSummary(secretary, id, {});
  await s.summaries.submitEvaluationPackage(secretary, id, {});

  // Gói phê duyệt: Phó GĐ KH không ký được thủ tục có kinh phí; Giám đốc ký sau khi qua Phòng.
  const packageSubmission = (await s.routing.inbox(board)).submissions.find((item) => item.subjectId === id && item.kind === "DECISION_PACKAGE");
  await s.routing.advance(board, packageSubmission.id, {});
  await s.routing.advance(head, packageSubmission.id, {});
  const revision = (await db.proposalEvaluationSummary.findFirst({ where: { proposalId: id } })).revision;
  await assert.rejects(() => s.decisions.decide(scienceDeputy, id, "approved", { note: "x", packageRevision: revision }), /Chỉ Giám đốc/);
  await s.decisions.decide(director, id, "approved", { note: "Phê duyệt", packageRevision: revision });
  assert.equal((await db.researchProposal.findUnique({ where: { id } })).status, "approved");

  // Phó GĐ chỉ theo dõi xem được hồ sơ nhưng không thấy kinh phí; lịch sử tờ trình đầy đủ cho chuyên viên.
  const watched = await s.proposals.getProposal(otherDeputy, id);
  assert.deepEqual(watched.budgetMetadata, {});
  const history = (await s.routing.forSubject(officer, "proposal", id)).submissions;
  assert.deepEqual(history.map((item) => `${item.kind}:${item.status}`).sort(), ["DECISION_PACKAGE:APPROVED", "EVALUATION_COUNCIL:APPROVED"]);
});
