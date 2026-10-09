import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { ApprovedProjectsService } from "../dist/apps/api/approved-projects/approved-projects.service.js";

// Module thực hiện đề tài (chuyển từ nhánh thanhdotien278/DocManS) chạy trên PostgreSQL thật với mô hình
// 5 vai trò của nhánh này: chuyên viên QLKH tạo đề tài và xử lý hằng ngày khi được phân công, lãnh đạo
// hoặc chuyên viên trong phạm vi phân công chuyên viên phụ trách, LÃNH ĐẠO quyết định gia hạn.

let database;
let db;
let projects;
let authStore;
let orgA;
let orgB;
let period;
let pi;
let member;
let staff;
let otherStaff;
let outsiderStaff;
let leader;
let researcher;
let sequence = 0;

const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;
const day = (value) => new Date(`${value}T00:00:00.000Z`);

async function createUser(role, org) {
  const name = unique(role.toLowerCase().replace(/_/g, "-"));
  const user = await db.user.create({
    data: {
      username: name, usernameKey: name, displayName: name, passwordHash: "not-used", status: "active", systemRole: role, unit: org.name,
      organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] }
    }
  });
  return authStore.toSafeUser(await authStore.findUserById(user.id));
}

/** An approved proposal with the evidence the project module needs: a formal submission and an approval decision. */
async function approvedProposal(hostOrg = orgA) {
  const proposal = await db.researchProposal.create({
    data: {
      intakePeriodId: period.id, ownerId: pi.id, hostOrganizationUnitId: hostOrg.id, title: unique("Đề tài thực hiện"),
      status: "approved", startDate: day("2031-01-01"), endDate: day("2031-12-31"), submittedAt: day("2030-10-01")
    }
  });
  const snapshot = {
    id: proposal.id, ownerId: pi.id, title: proposal.title, objectives: "Mục tiêu", summary: "Tóm tắt", startDate: "2031-01-01", endDate: "2031-12-31",
    members: [{ id: unique("pm"), userId: member.id, name: member.displayName, role: "TOPIC_MEMBER", participationRole: "TOPIC_MEMBER" }]
  };
  await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: pi.id, fromStatus: "draft", toStatus: "submitted", submittedAt: day("2030-10-01"), snapshot } });
  // A later completeness-check record must not be mistaken for the approved submission.
  await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: staff.id, fromStatus: "submitted", toStatus: "submitted", submittedAt: day("2030-10-05"), snapshot: { kind: "completeness_check" } } });
  await db.proposalDecision.create({ data: { proposalId: proposal.id, decision: "approved", decidedById: leader.id, decidedAt: day("2030-11-01"), fromStatus: "ready_for_approval", toStatus: "approved" } });
  return proposal;
}

const context = async (actor, projectId) => (await projects.getProject(actor, projectId)).viewerAuthorization.contextVersion;

describe("Approved project execution on real PostgreSQL (5-role model)", () => {
  before(async () => {
    database = await createMigratedDatabase("projects");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();

    authStore = new AuthStore(db);
    projects = new ApprovedProjectsService(db, new AuditLogService(db));

    orgA = await db.organizationUnit.create({ data: { code: unique("PRJ-A"), name: "Đơn vị đề tài A" } });
    orgB = await db.organizationUnit.create({ data: { code: unique("PRJ-B"), name: "Đơn vị đề tài B" } });
    period = await db.proposalIntakePeriod.create({
      data: { code: unique("DOT"), title: "Đợt kiểm thử", startsAt: day("2030-01-01"), endsAt: day("2030-12-31"), status: "closed", requiredPackage: {} }
    });
    pi = await createUser("RESEARCHER_INTERNAL_USER", orgA);
    member = await createUser("RESEARCHER_INTERNAL_USER", orgA);
    researcher = await createUser("RESEARCHER_INTERNAL_USER", orgA);
    staff = await createUser("SCIENTIFIC_MANAGEMENT_STAFF", orgA);
    otherStaff = await createUser("SCIENTIFIC_MANAGEMENT_STAFF", orgA);
    outsiderStaff = await createUser("SCIENTIFIC_MANAGEMENT_STAFF", orgB);
    leader = await createUser("LEADERSHIP_APPROVAL_AUTHORITY", orgB); // academy-wide, no scope on orgA
  });

  after(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it("only in-scope staff create the project, from the approved submission, idempotently", async () => {
    const proposal = await approvedProposal();
    await assert.rejects(projects.createFromApprovedProposal(outsiderStaff, proposal.id), ForbiddenException);
    await assert.rejects(projects.createFromApprovedProposal(researcher, proposal.id), ForbiddenException);
    await assert.rejects(projects.createFromApprovedProposal(leader, proposal.id), ForbiddenException);

    const created = await projects.createFromApprovedProposal(staff, proposal.id);
    assert.equal(created.status, "preparing");
    const again = await projects.createFromApprovedProposal(staff, proposal.id);
    assert.equal(again.id, created.id);

    const stored = await db.approvedProject.findUnique({ where: { id: created.id }, include: { members: true, sourceSubmissionEvent: true } });
    assert.equal(stored.sourceSubmissionEvent.toStatus, "submitted");
    assert.equal(stored.sourceSubmissionEvent.snapshot.id, proposal.id);
    assert.deepEqual(stored.members.map((item) => item.participationRole).sort(), ["TOPIC_MEMBER", "TOPIC_PI"]);

    const unapproved = await db.researchProposal.create({ data: { intakePeriodId: period.id, ownerId: pi.id, hostOrganizationUnitId: orgA.id, title: unique("Chưa duyệt"), status: "submitted" } });
    await assert.rejects(projects.createFromApprovedProposal(staff, unapproved.id), BadRequestException);
  });

  it("walks setup, report and extension with the 5-role authority split", async () => {
    const proposal = await approvedProposal();
    const { id } = await projects.createFromApprovedProposal(staff, proposal.id);

    // Visibility: academy-wide leadership and in-scope staff read; outsiders and unrelated researchers do not.
    assert.ok((await projects.getProject(leader, id)).viewerAuthorization.allowedActions.includes("project.read"));
    assert.ok((await projects.getProject(otherStaff, id)).viewerAuthorization.allowedActions.includes("project.read"));
    await assert.rejects(projects.getProject(outsiderStaff, id), ForbiddenException);
    await assert.rejects(projects.getProject(researcher, id), ForbiddenException);

    // Only the assigned officer operates; leadership (or in-scope staff) assigns; the PI cannot.
    await assert.rejects(projects.configureSetup(staff, id, { contextVersion: await context(staff, id), milestones: [], checkpoints: [] }), ForbiddenException);
    await assert.rejects(projects.assignOfficer(pi, id, { contextVersion: await context(pi, id), officerUserId: staff.id }), ForbiddenException);
    await projects.assignOfficer(leader, id, { contextVersion: await context(leader, id), officerUserId: staff.id, reason: "Phân công" });

    await projects.configureSetup(staff, id, {
      contextVersion: await context(staff, id),
      milestones: [{ title: "Mốc giữa kỳ", dueDate: "2031-06-30", isImportant: true }],
      checkpoints: [{ title: "Báo cáo giữa kỳ", dueDate: "2031-06-30", milestonePosition: 0 }]
    });
    await projects.confirmSetup(staff, id, { contextVersion: await context(staff, id) });
    assert.equal((await db.approvedProject.findUnique({ where: { id } })).status, "executing");

    // Progress report: PI drafts and submits, the officer reviews and accepts.
    const checkpoint = await db.projectCheckpoint.findFirst({ where: { projectId: id } });
    const report = await projects.createReportDraft(pi, id, { contextVersion: await context(pi, id), checkpointId: checkpoint.id, reportingPeriodStart: day("2031-01-01"), reportingPeriodEnd: day("2031-06-30"), progressResults: "Đã hoàn thành 50%." });
    await assert.rejects(projects.createReportDraft(member, id, { contextVersion: await context(member, id), reportingPeriodStart: day("2031-01-01"), reportingPeriodEnd: day("2031-02-01"), progressResults: "x" }), ForbiddenException);
    await projects.submitReport(pi, id, { contextVersion: await context(pi, id), reportId: report.id });
    await assert.rejects(projects.reviewReport(otherStaff, id, { contextVersion: await context(otherStaff, id), reportId: report.id }), ForbiddenException);
    await projects.reviewReport(staff, id, { contextVersion: await context(staff, id), reportId: report.id });
    await projects.acceptReport(staff, id, { contextVersion: await context(staff, id), reportId: report.id, reason: "Đạt" });
    assert.equal((await db.projectCheckpoint.findUnique({ where: { id: checkpoint.id } })).status, "completed");

    // Extension: the officer validates and prepares; only leadership decides.
    const extension = await projects.createExtension(pi, id, { contextVersion: await context(pi, id), proposedValues: { requestedEndDate: "2032-03-31" }, reason: "Cần thêm thời gian thử nghiệm" });
    await projects.submitRequest(pi, id, "extension", { contextVersion: await context(pi, id), requestId: extension.id });
    await projects.validateExtension(staff, id, { contextVersion: await context(staff, id), requestId: extension.id });
    await projects.prepareExtension(staff, id, { contextVersion: await context(staff, id), requestId: extension.id, note: "Hồ sơ đầy đủ" });
    await assert.rejects(projects.decideRequest(staff, id, "extension", "approve", { contextVersion: await context(staff, id), requestId: extension.id }), ForbiddenException);
    await projects.decideRequest(leader, id, "extension", "approve", { contextVersion: await context(leader, id), requestId: extension.id, reason: "Đồng ý gia hạn" });
    assert.equal((await db.approvedProject.findUnique({ where: { id } })).endDate.toISOString().slice(0, 10), "2032-03-31");

    // Adjustment: decided by the assigned officer, never by leadership.
    const adjustment = await projects.createAdjustment(pi, id, { contextVersion: await context(pi, id), proposedValues: { scope: { summary: "Tóm tắt điều chỉnh" } }, reason: "Điều chỉnh phạm vi" });
    await projects.submitRequest(pi, id, "adjustment", { contextVersion: await context(pi, id), requestId: adjustment.id });
    await projects.reviewAdjustment(staff, id, { contextVersion: await context(staff, id), requestId: adjustment.id });
    await assert.rejects(projects.decideRequest(leader, id, "adjustment", "approve", { contextVersion: await context(leader, id), requestId: adjustment.id }), ForbiddenException);
    await projects.decideRequest(staff, id, "adjustment", "approve", { contextVersion: await context(staff, id), requestId: adjustment.id, reason: "Hợp lý" });
    assert.equal((await db.projectRequest.findUnique({ where: { id: adjustment.id } })).status, "approved");

    const history = await db.projectHistory.findMany({ where: { projectId: id } });
    for (const action of ["project.created", "project.setup.configure", "project.report.submit", "project.extension.approve", "project.adjustment.approve"]) {
      assert.ok(history.some((item) => item.action === action), action);
    }
  });

  it("a stale context version is rejected", async () => {
    const proposal = await approvedProposal();
    const { id } = await projects.createFromApprovedProposal(staff, proposal.id);
    const stale = await context(leader, id);
    await projects.assignOfficer(leader, id, { contextVersion: stale, officerUserId: staff.id });
    await assert.rejects(projects.assignOfficer(leader, id, { contextVersion: stale, officerUserId: otherStaff.id }), (error) => error.getResponse?.().code === "CONTEXT_VERSION_MISMATCH");
  });
});
