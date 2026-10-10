import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { ApprovedProjectsService } from "../dist/apps/api/approved-projects/approved-projects.service.js";
import { WorkQueueService } from "../dist/apps/api/approved-projects/work-queue.service.js";

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
    staff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA);
    otherStaff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA);
    outsiderStaff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgB);
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

  it("tracks progress: weights, baseline versions, member updates, officer assessment and the work queue", async () => {
    const proposal = await approvedProposal();
    const { id } = await projects.createFromApprovedProposal(staff, proposal.id);
    await projects.assignOfficer(leader, id, { contextVersion: await context(leader, id), officerUserId: staff.id, reason: "Phân công" });
    const memberRow = (await projects.getProject(staff, id)).members.find((item) => item.userId === member.id);

    // Mỗi mốc phải có kỳ báo cáo (mốc chỉ hoàn thành qua báo cáo được chấp nhận).
    await assert.rejects(projects.configureSetup(staff, id, { contextVersion: await context(staff, id), milestones: [{ title: "A", dueDate: "2031-03-31" }], checkpoints: [] }), BadRequestException);
    await assert.rejects(projects.configureSetup(staff, id, { contextVersion: await context(staff, id), milestones: [], checkpoints: [{ title: "K", dueDate: "2031-03-31" }] }), BadRequestException);
    // Trọng số: hoặc để trống tất cả, hoặc đủ mọi mốc với tổng 100.
    await assert.rejects(projects.configureSetup(staff, id, { contextVersion: await context(staff, id), milestones: [{ title: "A", dueDate: "2031-03-31", weightPercent: 30 }, { title: "B", dueDate: "2031-06-30", weightPercent: 30 }], checkpoints: [] }), BadRequestException);
    await projects.configureSetup(staff, id, {
      contextVersion: await context(staff, id),
      milestones: [
        { title: "Khảo sát", dueDate: "2031-03-31", weightPercent: 20, isImportant: true },
        { title: "Thử nghiệm", dueDate: "2031-06-30", weightPercent: 30, isImportant: true, responsibleMemberId: memberRow.id },
        { title: "Tổng kết", dueDate: "2031-12-31", weightPercent: 50, isImportant: true }
      ],
      checkpoints: [
        { title: "Báo cáo khảo sát", dueDate: "2031-03-31", milestonePosition: 0 },
        { title: "Báo cáo thử nghiệm", dueDate: "2031-06-30", milestonePosition: 1 },
        { title: "Báo cáo tổng kết", dueDate: "2031-12-31", milestonePosition: 2 }
      ]
    });
    await projects.confirmSetup(staff, id, { contextVersion: await context(staff, id) });
    const firstBaselines = await db.projectPlanBaseline.findMany({ where: { projectId: id } });
    assert.equal(firstBaselines.length, 1);
    assert.equal(firstBaselines[0].version, 1);
    assert.equal(firstBaselines[0].source, "setup");
    assert.equal(firstBaselines[0].milestones.length, 3);

    // Thành viên chỉ cập nhật mốc mình phụ trách; chuyên viên không cập nhật tiến độ thay chủ nhiệm.
    const milestones = await db.projectMilestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } });
    await projects.updateMilestoneProgress(member, id, { contextVersion: await context(member, id), milestoneId: milestones[1].id, progressPercent: 50, note: "Đã làm một nửa" });
    await assert.rejects(projects.updateMilestoneProgress(member, id, { contextVersion: await context(member, id), milestoneId: milestones[2].id, progressPercent: 10 }), ForbiddenException);
    await assert.rejects(projects.updateMilestoneProgress(staff, id, { contextVersion: await context(staff, id), milestoneId: milestones[0].id, progressPercent: 10 }), ForbiddenException);

    // Cập nhật tiến độ không làm mất hiệu lực ngữ cảnh mà chủ nhiệm đang giữ.
    const piContext = await context(pi, id);
    await projects.updateMilestoneProgress(pi, id, { contextVersion: piContext, milestoneId: milestones[2].id, progressPercent: 5 });

    // Mốc 1 hoàn thành khi báo cáo của nó được chấp nhận.
    const checkpoint = await db.projectCheckpoint.findFirst({ where: { projectId: id, milestoneId: milestones[0].id } });
    const report = await projects.createReportDraft(pi, id, { contextVersion: await context(pi, id), checkpointId: checkpoint.id, reportingPeriodStart: day("2031-01-01"), reportingPeriodEnd: day("2031-03-31"), progressResults: "Hoàn thành khảo sát." });
    await projects.submitReport(pi, id, { contextVersion: await context(pi, id), reportId: report.id });
    await projects.reviewReport(staff, id, { contextVersion: await context(staff, id), reportId: report.id });
    await projects.acceptReport(staff, id, { contextVersion: await context(staff, id), reportId: report.id, reason: "Đạt" });
    const done = await db.projectMilestone.findUnique({ where: { id: milestones[0].id } });
    assert.equal(done.status, "completed");
    assert.equal(done.progressPercent, 100);
    assert.equal(done.completedAt.toISOString(), (await db.projectReportRevision.findUnique({ where: { id: report.id } })).submittedAt.toISOString(), "completion = submission time");
    // 100% chỉ đạt qua báo cáo được chấp nhận.
    await assert.rejects(projects.updateMilestoneProgress(pi, id, { contextVersion: await context(pi, id), milestoneId: milestones[1].id, progressPercent: 100 }), BadRequestException);

    // 20% (xong) + 30% × 50% + 50% × 5% = 37.5%.
    const progress = await projects.getProgress(pi, id);
    assert.equal(progress.actualPercent, 37.5);
    assert.equal(progress.weightsConfigured, true);
    assert.equal(progress.baselineVersion, 1);
    assert.deepEqual(progress.updatableMilestoneIds.sort(), [milestones[1].id, milestones[2].id].sort());
    assert.deepEqual((await projects.getProgress(member, id)).updatableMilestoneIds, [milestones[1].id]);
    assert.equal((await projects.getProject(leader, id)).progressSummary.actualPercent, 37.5);

    // Chỉ chuyên viên phụ trách đánh giá sức khoẻ.
    await assert.rejects(projects.assessHealth(leader, id, { contextVersion: await context(leader, id), level: "red", reason: "Không" }), ForbiddenException);
    await assert.rejects(projects.assessHealth(pi, id, { contextVersion: await context(pi, id), level: "green", reason: "Không" }), ForbiddenException);
    const assessment = await projects.assessHealth(staff, id, { contextVersion: await context(staff, id), level: "amber", reason: "Theo dõi sát giai đoạn thử nghiệm" });
    assert.equal(assessment.level, "amber");
    assert.ok(["green", "amber", "red"].includes(assessment.computedLevel));

    // Gia hạn được duyệt tạo kế hoạch gốc phiên bản 2; phiên bản 1 giữ nguyên.
    const extension = await projects.createExtension(pi, id, { contextVersion: await context(pi, id), proposedValues: { requestedEndDate: "2032-03-31" }, reason: "Cần thêm thời gian" });
    await projects.submitRequest(pi, id, "extension", { contextVersion: await context(pi, id), requestId: extension.id });
    await projects.validateExtension(staff, id, { contextVersion: await context(staff, id), requestId: extension.id });
    await projects.prepareExtension(staff, id, { contextVersion: await context(staff, id), requestId: extension.id, note: "Đủ hồ sơ" });
    await projects.decideRequest(leader, id, "extension", "approve", { contextVersion: await context(leader, id), requestId: extension.id, reason: "Đồng ý" });
    const baselines = await db.projectPlanBaseline.findMany({ where: { projectId: id }, orderBy: { version: "asc" } });
    assert.deepEqual(baselines.map((item) => [item.version, item.source]), [[1, "setup"], [2, "extension"]]);
    assert.equal(baselines[1].sourceRequestId, extension.id);
    assert.equal(baselines[1].endDate.toISOString().slice(0, 10), "2032-03-31");
    assert.equal(baselines[0].endDate.toISOString().slice(0, 10), "2031-12-31");

    // Trọng số chỉ đổi được qua điều chỉnh, và tổng phải còn bằng 100.
    await assert.rejects(projects.createAdjustment(pi, id, { contextVersion: await context(pi, id), proposedValues: { milestoneChanges: [{ id: milestones[2].id, weightPercent: 40 }] }, reason: "Đổi trọng số" }), BadRequestException);

    // "Việc của tôi" (ngày giả định 20/6/2031): mốc 2 sắp đến hạn cho chủ nhiệm và thành viên; báo cáo chờ xét cho chuyên viên.
    const general = await projects.createReportDraft(pi, id, { contextVersion: await context(pi, id), reportingPeriodStart: day("2031-04-01"), reportingPeriodEnd: day("2031-05-31"), progressResults: "Báo cáo chung." });
    await projects.submitReport(pi, id, { contextVersion: await context(pi, id), reportId: general.id });
    const workQueue = new WorkQueueService(db, projects);
    const at = day("2031-06-20");
    const piQueue = await workQueue.forUser(pi, at);
    assert.ok(piQueue.items.some((item) => item.kind === "milestone_progress" && item.id.endsWith(milestones[1].id)));
    const memberQueue = await workQueue.forUser(member, at);
    assert.deepEqual(memberQueue.items.map((item) => item.kind), ["milestone_progress"]);
    const staffQueue = await workQueue.forUser(staff, at);
    assert.ok(staffQueue.items.some((item) => item.kind === "report_review"));
    assert.equal((await workQueue.forUser(researcher, at)).items.length, 0);

    const history = await db.projectHistory.findMany({ where: { projectId: id } });
    for (const action of ["project.progress.update", "project.health.assess"]) assert.ok(history.some((item) => item.action === action), action);
  });

  it("a stale context version is rejected", async () => {
    const proposal = await approvedProposal();
    const { id } = await projects.createFromApprovedProposal(staff, proposal.id);
    const stale = await context(leader, id);
    await projects.assignOfficer(leader, id, { contextVersion: stale, officerUserId: staff.id });
    await assert.rejects(projects.assignOfficer(leader, id, { contextVersion: stale, officerUserId: otherStaff.id }), (error) => error.getResponse?.().code === "CONTEXT_VERSION_MISMATCH");
  });
});
