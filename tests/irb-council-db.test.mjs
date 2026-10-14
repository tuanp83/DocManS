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
import { ApprovalRoutingService } from "../dist/apps/api/approvals/approval-routing.service.js";
import { irbCompositionProblems } from "../dist/apps/api/proposal-evaluations/irb-council.js";

// Hội đồng Đạo đức (IRB) trên PostgreSQL thật: mời trước khi trình, Đồng ý / Từ chối, người chưa ký thành lập chỉ
// thấy tên đề tài, thành phần (Chủ tịch, Thư ký, 2–3 Phản biện, 3–5 Ủy viên), trình qua Phòng KHQS, Ban giám đốc ký
// thành lập; thành viên nhận xét, thư ký lập kết luận, chuyên viên trình, Ban giám đốc trả lại hoặc ký cấp giấy.

let database;
let db;
let authStore;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase("irb_council");
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
  authStore = new AuthStore(db);
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

function services() {
  const auditLog = new AuditLogService(db);
  const participation = new ProposalParticipationService(db);
  const reviewAccess = new ProposalReviewAccessService(db);
  const assignments = new ProposalReviewAssignmentsService(db, auditLog, participation, reviewAccess);
  const reviews = new ProposalReviewsService(db, auditLog, reviewAccess, participation);
  const summaries = new ProposalEvaluationSummaryService(db, auditLog, assignments, reviews, participation, reviewAccess);
  const sent = [];
  const notifications = { async dispatch(events) { sent.push(...events); }, async createNotification(input) { sent.push(input); } };
  return {
    sent,
    proposals: new ResearchProposalsService(db, auditLog, participation, reviewAccess, new ProposalManagementOfficerService(db)),
    decisions: new ProposalDecisionsService(db, auditLog, participation, reviewAccess, assignments, reviews, summaries, notifications),
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

const member = (user, role) => ({ userId: user.id, displayName: user.displayName, role });
const myInvitation = async (s, user, proposalId) => (await s.decisions.listMyIrbInvitations(user)).find((item) => item.proposal.id === proposalId);

test("IRB composition: 1 chair, 1 secretary, 2–3 reviewers, 3–5 members; duplicates rejected", () => {
  const people = (role, count, prefix) => Array.from({ length: count }, (_, index) => ({ userId: `${prefix}${index}`, displayName: `${prefix}${index}`, role }));
  const full = [...people("chair", 1, "c"), ...people("secretary", 1, "s"), ...people("reviewer", 2, "r"), ...people("member", 3, "m")];
  assert.deepEqual(irbCompositionProblems(full, true), []);
  assert.equal(irbCompositionProblems(full.slice(0, 4), false).length, 0, "nháp chưa đủ người vẫn lưu được");
  assert.match(irbCompositionProblems(full.slice(0, 4), true).join(" "), /Ủy viên cần 3–5/);
  assert.match(irbCompositionProblems([...full, ...people("reviewer", 2, "x")], false).join(" "), /Phản biện tối đa 3/);
  assert.match(irbCompositionProblems([...full, { ...full[0], role: "member" }], false).join(" "), /hai lần/);
});

test("an IRB council goes from invitations to the certificate through every role", async () => {
  const s = services();
  const khoa = await db.organizationUnit.create({ data: { code: "KHOA-IRB", name: "Khoa Nội IRB", unitType: "FACULTY" } });
  const phong = await db.organizationUnit.create({ data: { code: "KHQS-IRB", name: "Phòng KHQS IRB", unitType: "DEPARTMENT" } });
  const both = [phong, khoa];
  const head = await account("irb-truongphong", "RESEARCH_MANAGEMENT_HEAD", both);
  const board = await account("irb-truongban", "RESEARCH_BOARD_HEAD", both);
  const officer = await account("irb-chuyenvien", "RESEARCH_MANAGEMENT_STAFF", both);
  const otherStaff = await account("irb-chuyenvien2", "RESEARCH_MANAGEMENT_STAFF", both);
  const director = await account("irb-giamdoc", "LEADERSHIP_APPROVAL_AUTHORITY", both);
  const scienceDeputy = await account("irb-pgdkh", "SCIENCE_DEPUTY_DIRECTOR", both);
  const otherDeputy = await account("irb-pgd", "RESEARCH_OVERSIGHT_AUTHORITY", both);
  const pi = await account("irb-chunhiem", "RESEARCHER_INTERNAL_USER", [khoa]);
  const people = {};
  for (const name of ["chair", "secretary", "rev1", "rev2", "m1", "m2", "m3", "decliner"]) people[name] = await account(`irb-${name}`, "RESEARCHER_INTERNAL_USER", [phong]);

  const intake = await db.proposalIntakePeriod.create({ data: { code: "DOT-IRB", title: "Đợt IRB", status: "open", startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000), requiredPackage: [] } });
  const proposal = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: khoa.id, title: "Đề tài can thiệp lâm sàng", objectives: "Mục tiêu bí mật", status: "submitted", submittedAt: new Date() } });
  const id = proposal.id;
  await db.proposalManagementOfficer.create({ data: { proposalId: id, officerUserId: officer.id, assignedById: head.id, status: "ACTIVE", effectiveFrom: new Date(Date.now() - 60_000), reason: "Giao phụ trách" } });

  const council = (decliner) => [
    member(people.chair, "chair"), member(people.secretary, "secretary"), member(people.rev1, "reviewer"), member(people.rev2, "reviewer"),
    member(people.m1, "member"), member(people.m2, "member"), member(decliner ? people.decliner : people.m3, "member")
  ];

  // Chỉ chuyên viên phụ trách (hoặc Trưởng phòng) lập; chủ nhiệm đề tài không được mời; trình phải đủ thành phần.
  await assert.rejects(() => s.decisions.proposeIrbCouncil(otherStaff, id, { action: "save", members: [] }), { status: 403 });
  await assert.rejects(() => s.decisions.proposeIrbCouncil(officer, id, { action: "invite", members: [member(pi, "chair")] }), /người tham gia đề tài/);
  await assert.rejects(() => s.decisions.proposeIrbCouncil(officer, id, { action: "submit", members: council(true).slice(0, 4) }), /Ủy viên cần 3–5/);

  // Gửi lời mời: mỗi người một lời mời, có thông báo.
  s.sent.length = 0;
  await s.decisions.proposeIrbCouncil(officer, id, { action: "invite", members: council(true), meetingDate: "2027-03-01" });
  assert.equal(await db.proposalIrbMember.count({ where: { proposalId: id, status: "invited" } }), 7);
  assert.equal(s.sent.filter((event) => event.type === "IRB_INVITATION").length, 7);

  // Chưa đồng ý: chỉ thấy tên đề tài (lời mời), không đọc được hồ sơ hay thông tin IRB.
  const invitation = await myInvitation(s, people.chair, id);
  assert.deepEqual(Object.keys(invitation.proposal).sort(), ["code", "id", "title"]);
  assert.equal(invitation.statusLabel, "Chờ trả lời");
  await assert.rejects(() => s.proposals.getProposal(people.chair, id), { status: 403 });
  await assert.rejects(() => s.decisions.getIRBInfo(people.chair, id), { status: 403 });

  // Trả lời: người khác không trả lời thay; từ chối phải có lý do.
  await assert.rejects(() => s.decisions.respondToIrbInvitation(people.m1, id, invitation.id, { response: "accept" }), { status: 403 });
  for (const name of ["chair", "secretary", "rev1", "rev2", "m1", "m2"]) {
    await s.decisions.respondToIrbInvitation(people[name], id, (await myInvitation(s, people[name], id)).id, { response: "accept" });
  }
  const declinerInvitation = await myInvitation(s, people.decliner, id);
  await assert.rejects(() => s.decisions.respondToIrbInvitation(people.decliner, id, declinerInvitation.id, { response: "decline", reason: " " }), /Lý do từ chối/);
  await s.decisions.respondToIrbInvitation(people.decliner, id, declinerInvitation.id, { response: "decline", reason: "Đi công tác" });
  await assert.rejects(() => s.decisions.respondToIrbInvitation(people.decliner, id, declinerInvitation.id, { response: "accept" }), /đã được trả lời/);
  assert.ok(s.sent.some((event) => event.type === "IRB_INVITATION_DECLINED" && event.userIds.includes(officer.id)));
  await assert.rejects(() => s.decisions.proposeIrbCouncil(officer, id, { action: "submit", members: council(true) }), /Đã từ chối \(cần thay người khác\): irb-decliner/);

  // Thay người, người mới nhận lời, trình qua Phòng KHQS.
  await s.decisions.proposeIrbCouncil(officer, id, { action: "invite", members: council(false) });
  await assert.rejects(() => s.decisions.proposeIrbCouncil(officer, id, { action: "submit", members: council(false) }), /Chờ nhận lời: irb-m3/);
  await s.decisions.respondToIrbInvitation(people.m3, id, (await myInvitation(s, people.m3, id)).id, { response: "accept" });
  await s.decisions.proposeIrbCouncil(officer, id, { action: "submit", members: council(false) });
  await assert.rejects(() => s.decisions.approveIrbCouncil(director, id, {}), /chưa tới Ban giám đốc/);
  const councilSubmission = (await s.routing.inbox(board)).submissions.find((item) => item.subjectId === id && item.kind === "IRB_COUNCIL");
  await s.routing.advance(board, councilSubmission.id, {});
  await s.routing.advance(head, councilSubmission.id, {});
  await assert.rejects(() => s.decisions.approveIrbCouncil(otherDeputy, id, {}), { status: 403 });
  await assert.rejects(() => s.decisions.approveIrbCouncil(officer, id, {}), { status: 403 });
  const signed = await s.decisions.approveIrbCouncil(scienceDeputy, id, { approvalNote: "Đồng ý" });
  assert.equal(signed.irb.council.status, "approved");
  assert.equal(await db.proposalIrbMember.count({ where: { proposalId: id, status: "active" } }), 7);
  assert.equal(await db.proposalIrbMember.count({ where: { proposalId: id, userId: people.decliner.id, status: { not: "declined" } } }), 0);

  // Đã ký thành lập: thành viên đọc được hồ sơ và thông tin IRB; không thành người chấm phiếu đánh giá.
  const read = await s.proposals.getProposal(people.chair, id);
  assert.equal(read.objectives, "Mục tiêu bí mật");
  assert.ok(read.viewerAuthorization.accessReasons.includes("IRB_COUNCIL_MEMBER"));
  assert.ok(!read.viewerAuthorization.allowedActions.includes("proposal.review.submit"));
  assert.equal((await s.decisions.getIRBInfo(people.rev1, id)).viewer.memberRole, "reviewer");
  await assert.rejects(() => s.proposals.getProposal(people.decliner, id), { status: 403 });

  // Nhận xét: thư ký không nhận xét; chốt kết luận khi mọi phản biện đã gửi.
  const review = (recommendation) => ({ recommendation, comment: "Đề cương bảo đảm quyền của người tham gia" });
  await assert.rejects(() => s.decisions.submitIrbReview(people.secretary, id, review("approve")), { status: 403 });
  await assert.rejects(() => s.decisions.submitIrbReview(people.chair, id, review("maybe")), /Ý kiến đề nghị/);
  for (const name of ["chair", "rev1", "m1"]) await s.decisions.submitIrbReview(people[name], id, review("approve"));
  const conclusion = { decision: "APPROVED", riskLevel: "LOW", ethicsNotes: "Thông qua đề cương", targetSubjects: "Bệnh nhân nội trú" };
  await assert.rejects(() => s.decisions.saveIrbConclusion(people.chair, id, { ...conclusion, action: "save" }), { status: 403 });
  await assert.rejects(() => s.decisions.saveIrbConclusion(people.secretary, id, { ...conclusion, action: "finalize" }), /phản biện chưa gửi nhận xét: irb-rev2/);
  await s.decisions.submitIrbReview(people.rev2, id, review("revise"));
  await assert.rejects(() => s.decisions.submitIrbConclusion(officer, id, {}), /chưa chốt kết luận/);
  await s.decisions.saveIrbConclusion(people.secretary, id, { ...conclusion, action: "finalize" });
  await assert.rejects(() => s.decisions.submitIrbReview(people.m2, id, review("approve")), /đã chốt/);

  // Chuyên viên trình kết luận qua Phòng; Ban giám đốc trả lại thì về thư ký sửa.
  await s.decisions.submitIrbConclusion(officer, id, {});
  await assert.rejects(() => s.decisions.updateIRBStatus(director, id, {}), /chưa tới Ban giám đốc/);
  const route = async () => {
    const submission = (await s.routing.inbox(board)).submissions.find((item) => item.subjectId === id && item.kind === "IRB_CERTIFICATE");
    await s.routing.advance(board, submission.id, {});
    await s.routing.advance(head, submission.id, {});
  };
  await route();
  await assert.rejects(() => s.decisions.returnIrbConclusion(director, id, { reason: "" }), /Lý do trả lại/);
  await s.decisions.returnIrbConclusion(director, id, { reason: "Bổ sung đối tượng nghiên cứu" });
  assert.equal((await s.decisions.getIRBInfo(officer, id)).irb.conclusion.status, "returned");
  await s.decisions.saveIrbConclusion(people.secretary, id, { ...conclusion, targetSubjects: "Bệnh nhân nội trú từ 18 tuổi", action: "finalize" });
  await s.decisions.submitIrbConclusion(officer, id, {});
  await route();

  // Ký cấp giấy: chỉ Giám đốc / Phó GĐ KH; nội dung lấy theo kết luận.
  await assert.rejects(() => s.decisions.updateIRBStatus(officer, id, {}), { status: 403 });
  await assert.rejects(() => s.decisions.updateIRBStatus(otherDeputy, id, {}), { status: 403 });
  const certificate = (await s.decisions.updateIRBStatus(scienceDeputy, id, {})).irb.certificate;
  assert.equal(certificate.status, "APPROVED");
  assert.match(certificate.certificateNumber, /^IRB-HVQY-\d{4}-\d{3}$/);
  assert.equal(certificate.targetSubjects, "Bệnh nhân nội trú từ 18 tuổi");
  const history = (await s.routing.forSubject(officer, "proposal", id)).submissions.map((item) => `${item.kind}:${item.status}`).sort();
  assert.deepEqual(history, ["IRB_CERTIFICATE:APPROVED", "IRB_CERTIFICATE:RETURNED", "IRB_COUNCIL:APPROVED"]);
});
