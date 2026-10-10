import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApprovedProjectsService } from "../dist/apps/api/approved-projects/approved-projects.service.js";
import { ProjectClosureService } from "../dist/apps/api/approved-projects/project-closure.service.js";
import { projectViewerAuthorizationV1 } from "../dist/apps/api/approved-projects/project-capability-v1.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { actor, createClosureDb, seedExecutingProject } from "./helpers/project-closure-prisma.mjs";

function setup(overrides) {
  const db = seedExecutingProject(createClosureDb(), overrides);
  const dispatched = [];
  const notifications = { dispatch: async (events) => { dispatched.push(...events); return events.length; } };
  const projects = new ApprovedProjectsService(db, new AuditLogService(db), notifications);
  const closure = new ProjectClosureService(db, projects);
  const context = async () => (await projects.getProject(actor(db, "pi"), "project-1")).viewerAuthorization.contextVersion;
  const as = (id) => actor(db, id);
  const project = () => db.tables.projects[0];
  const round = () => [...db.tables.acceptances].sort((a, b) => b.round - a.round)[0];
  return { db, projects, closure, context, as, project, round, dispatched };
}

// Ngày hôm nay theo giờ Việt Nam (ngày họp hội đồng không được ở tương lai).
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const PLUS_30 = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
const dossier = { finalReportSummary: "Đã hoàn thành toàn bộ nội dung.", products: "02 bài báo", evidenceFileIds: ["file-report"] };
const councilMembers = [{ profileId: "prof-a", role: "CHAIRMAN" }, { profileId: "prof-b", role: "SECRETARY" }, { profileId: "prof-c", role: "REVIEWER_1" }, { profileId: "prof-d", role: "MEMBER" }];
const passingScores = { reportScore: 28, scientificProductsScore: 27, trainingProductsScore: 13, militaryMedicalPracticalScore: 22 };

async function toEstablishedCouncil(env) {
  await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
  await env.closure.proposeCouncil(env.as("officer"), "project-1", { members: councilMembers, meetingDate: TODAY, meetingLocation: "Phòng họp 1", contextVersion: await env.context() });
  await env.closure.establishCouncil(env.as("leader"), "project-1", { contextVersion: await env.context() });
}

describe("Nghiệm thu đề tài", () => {
  it("chỉ nộp hồ sơ khi mọi sản phẩm đã được tổ chuyên gia nghiệm thu đạt, có tệp thuộc đề tài; chuyển sang chờ nghiệm thu và báo chuyên viên", async () => {
    const env = setup({ productStatus: "UNDER_REVIEW" });
    await assert.rejects(env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() }), /sản phẩm chưa được tổ chuyên gia nghiệm thu đạt/);
    env.db.tables.products.length = 0;
    await assert.rejects(env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() }), /chưa có danh sách sản phẩm/);
    env.db.tables.products.push({ id: "prod-1", projectId: "project-1", position: 0, title: "Nội dung 1", productForm: 1, status: "PASSED", submission: null, createdById: "officer" });
    await assert.rejects(env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, evidenceFileIds: ["file-other-project"], contextVersion: await env.context() }), /không thuộc đề tài/);
    await assert.rejects(env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, evidenceFileIds: ["file-voucher"], contextVersion: await env.context() }), /không đúng loại tệp/, "chứng từ giải ngân không được gắn vào hồ sơ nghiệm thu");
    await assert.rejects(env.closure.submitAcceptance(env.as("member"), "project-1", { ...dossier, contextVersion: await env.context() }), (error) => error.status === 403);
    const result = await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    assert.equal(result.status, "pending_acceptance");
    assert.equal(env.round().status, "SUBMITTED");
    assert.equal(env.round().round, 1);
    assert.deepEqual(env.dispatched.map((event) => [event.type, event.userIds]), [["ACCEPTANCE_SUBMITTED", ["officer"]]]);
    assert.ok(env.db.tables.history.some((row) => row.action === "project.acceptance.submit" && row.toStatus === "pending_acceptance"));
  });

  it("contextVersion cũ bị từ chối (409) và không ghi gì", async () => {
    const env = setup();
    const stale = await env.context();
    await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: stale });
    const before = env.db.tables.acceptances.length;
    await assert.rejects(env.closure.returnAcceptance(env.as("officer"), "project-1", { reason: "Thiếu", contextVersion: stale }), (error) => error.status === 409);
    assert.equal(env.db.tables.acceptances.length, before);
    assert.equal(env.round().status, "SUBMITTED");
  });

  it("trả hồ sơ đưa đề tài về đang thực hiện; chủ nhiệm nộp lại thành vòng 2", async () => {
    const env = setup();
    await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    await assert.rejects(env.closure.returnAcceptance(env.as("staff2"), "project-1", { reason: "Thiếu", contextVersion: await env.context() }), (error) => error.status === 403);
    await env.closure.returnAcceptance(env.as("officer"), "project-1", { reason: "Thiếu bảng số liệu", contextVersion: await env.context() });
    assert.equal(env.project().status, "executing");
    assert.equal(env.round().status, "RETURNED");
    assert.equal(env.dispatched.at(-1).type, "ACCEPTANCE_RETURNED");
    assert.deepEqual(env.dispatched.at(-1).userIds, ["pi"]);
    await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    assert.equal(env.round().round, 2);
  });

  it("hội đồng: chủ nhiệm không được làm thành viên; chỉ lãnh đạo thành lập; số quyết định tự cấp", async () => {
    const env = setup();
    await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    await assert.rejects(env.closure.proposeCouncil(env.as("officer"), "project-1", { members: [...councilMembers.slice(0, 3), { profileId: "prof-pi", role: "MEMBER" }], contextVersion: await env.context() }), /không thể tham gia hội đồng/);
    await env.closure.proposeCouncil(env.as("officer"), "project-1", { members: councilMembers, meetingDate: "2026-12-01", contextVersion: await env.context() });
    assert.equal(env.round().status, "COUNCIL_PROPOSED");
    assert.equal(env.dispatched.at(-1).type, "ACCEPTANCE_COUNCIL_PROPOSED");
    assert.deepEqual(env.dispatched.at(-1).userIds, ["leader"]);
    await assert.rejects(env.closure.establishCouncil(env.as("officer"), "project-1", { contextVersion: await env.context() }), (error) => error.status === 403);
    await env.closure.establishCouncil(env.as("leader"), "project-1", { decisionDate: "2026-11-20", contextVersion: await env.context() });
    assert.equal(env.round().status, "COUNCIL_ESTABLISHED");
    assert.equal(env.round().decisionNumber, "001/QĐ-HVQY-NT/2026");
    const invitation = env.dispatched.find((event) => event.type === "INVITATION_TO_REVIEW");
    assert.deepEqual(invitation.userIds, ["ext-a"]);
  });

  it("kết luận hoàn thiện → chủ nhiệm nộp bản hoàn thiện → chuyên viên xác nhận → đã nghiệm thu", async () => {
    const env = setup();
    await toEstablishedCouncil(env);
    await assert.rejects(env.closure.recordMinutes(env.as("officer"), "project-1", { reportScore: 20, contextVersion: await env.context() }), /bắt buộc/);
    await env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, resolution: "revise", contextVersion: await env.context() });
    assert.equal(env.round().status, "REVISION_REQUIRED");
    assert.equal(env.project().status, "pending_acceptance");
    await env.closure.submitRevision(env.as("pi"), "project-1", { finalReportSummary: "Đã sửa theo góp ý", evidenceFileIds: ["file-revision"], contextVersion: await env.context() });
    await assert.rejects(env.closure.confirmRevision(env.as("officer"), "project-1", { outcome: "return", contextVersion: await env.context() }), /bắt buộc/);
    // Lần hoàn thiện thứ hai không ghi đè lần đầu.
    await env.closure.confirmRevision(env.as("officer"), "project-1", { outcome: "return", note: "Bổ sung bảng 3", contextVersion: await env.context() });
    await env.closure.submitRevision(env.as("pi"), "project-1", { finalReportSummary: "Đã bổ sung bảng 3", evidenceFileIds: ["file-report"], contextVersion: await env.context() });
    assert.equal(env.round().revisionDossier.previous.length, 1);
    assert.equal(env.round().revisionDossier.previous[0].finalReportSummary, "Đã sửa theo góp ý");
    assert.equal(env.round().revisionDossier.previous[0].returnNote, "Bổ sung bảng 3");
    assert.deepEqual(env.round().revisionDossier.allEvidenceFileIds.sort(), ["file-report", "file-revision"]);
    await env.closure.confirmRevision(env.as("officer"), "project-1", { outcome: "accept", contextVersion: await env.context() });
    assert.equal(env.round().status, "PASSED");
    assert.equal(env.project().status, "accepted");
  });

  it("tổng điểm dưới 70 không thể kết luận đạt; kết luận không đạt → đề tài không đạt", async () => {
    const env = setup();
    await toEstablishedCouncil(env);
    const low = { reportScore: 10, scientificProductsScore: 10, trainingProductsScore: 5, militaryMedicalPracticalScore: 10 };
    await assert.rejects(env.closure.recordMinutes(env.as("officer"), "project-1", { ...low, resolution: "approved", contextVersion: await env.context() }), /dưới 70/);
    await assert.rejects(env.closure.recordMinutes(env.as("officer"), "project-1", { ...low, resolution: "revise", contextVersion: await env.context() }), /dưới 70/, "không cho kết luận hoàn thiện dưới 70 điểm");
    await env.closure.recordMinutes(env.as("officer"), "project-1", { ...low, contextVersion: await env.context() });
    assert.equal(env.round().status, "FAILED");
    assert.equal(env.project().status, "failed");
    const result = env.dispatched.at(-1);
    assert.equal(result.type, "ACCEPTANCE_RESULT");
    assert.deepEqual(result.userIds.sort(), ["member", "pi"]);
  });
});

describe("Kinh phí gắn với đề tài", () => {
  const finance = (overrides = {}) => ({
    financeVersion: 0,
    milestones: [{ id: "M1", name: "Đợt 1", percentage: 60, expectedAmount: 60_000_000, disbursedAmount: 60_000_000, status: "DISBURSED", projectMilestoneId: "ms-1", attachments: [{ id: "file-voucher", fileName: "giả mạo.exe" }] }],
    costItems: [{ code: "REMUNERATION", name: "Thù lao", allocatedAmount: 60_000_000, spentAmount: 60_000_000, settledAmount: 50_000_000 }],
    settlementStatus: "PARTIALLY_SETTLED",
    ...overrides
  });

  it("cán bộ QLKH trong phạm vi cập nhật; tổng do máy chủ tính; tên chứng từ lấy từ CSDL; chủ nhiệm chỉ xem", async () => {
    const env = setup();
    await assert.rejects(env.closure.updateFinance(env.as("pi"), "project-1", { ...finance(), contextVersion: await env.context() }), (error) => error.status === 403);
    await assert.rejects(env.closure.updateFinance(env.as("outsider"), "project-1", { ...finance(), contextVersion: await env.context() }), (error) => error.status === 403);
    const saved = await env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance(), totalDisbursed: 1, contextVersion: await env.context() });
    assert.equal(saved.disbursement.totalBudget, 100_000_000, "ưu tiên kinh phí lãnh đạo phê duyệt (approvedAmount)");
    assert.equal(saved.disbursement.totalDisbursed, 60_000_000);
    assert.equal(saved.disbursement.totalSettled, 50_000_000);
    assert.equal(saved.disbursement.milestones[0].attachments[0].fileName, "file-voucher.pdf");
    assert.equal(saved.disbursement.milestones[0].projectMilestoneId, "ms-1");
    assert.equal(typeof env.db.tables.finances[0].totalDisbursed, "bigint");
    assert.equal(env.dispatched.at(-1).type, "DISBURSEMENT_UPDATE");
    const read = await env.closure.getFinance(env.as("pi"), "project-1");
    assert.equal(read.canManage, false);
    assert.equal(read.disbursement.version, 1);
  });

  it("phiên bản kinh phí cũ bị từ chối; chứng từ của đề tài khác và mốc lạ bị từ chối", async () => {
    const env = setup();
    await env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance(), contextVersion: await env.context() });
    await assert.rejects(env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance({ financeVersion: 0 }), contextVersion: await env.context() }), (error) => error.status === 409);
    await assert.rejects(env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance({ financeVersion: 1, milestones: [{ ...finance().milestones[0], attachments: [{ id: "file-other-project", fileName: "x.pdf" }] }] }), contextVersion: await env.context() }), /không thuộc đề tài/);
    await assert.rejects(env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance({ financeVersion: 1, milestones: [{ ...finance().milestones[0], projectMilestoneId: "ms-x" }] }), contextVersion: await env.context() }), /không thuộc đề tài/);
    await assert.rejects(env.closure.updateFinance(env.as("staff2"), "project-1", { ...finance({ financeVersion: 1, milestones: [{ ...finance().milestones[0], expectedAmount: 200_000_000, disbursedAmount: 200_000_000 }] }), contextVersion: await env.context() }), /vượt quá kinh phí/);
  });
});

describe("Thanh lý và đóng đề tài", () => {
  async function accepted(env) {
    await toEstablishedCouncil(env);
    await env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, contextVersion: await env.context() });
    assert.equal(env.project().status, "accepted");
    await env.closure.updateFinance(env.as("staff2"), "project-1", {
      financeVersion: 0, settlementStatus: "PARTIALLY_SETTLED",
      milestones: [{ id: "M1", name: "Đợt 1", percentage: 60, expectedAmount: 60_000_000, disbursedAmount: 60_000_000, status: "DISBURSED" }],
      costItems: [{ code: "A", name: "Thù lao", allocatedAmount: 60_000_000, spentAmount: 55_000_000, settledAmount: 55_000_000 }],
      contextVersion: await env.context()
    });
  }

  it("chưa thanh lý thì không đóng; lãnh đạo chỉ phê duyệt khi quyết toán + thu hồi = đã giải ngân; sau đó khoá kinh phí và đóng được", async () => {
    const env = setup();
    await accepted(env);
    await assert.rejects(env.closure.closeProject(env.as("officer"), "project-1", { contextVersion: await env.context() }), /thanh lý|trạng thái/i);
    await assert.rejects(env.closure.prepareLiquidation(env.as("officer"), "project-1", { recoveredAmount: 70_000_000, contextVersion: await env.context() }), /lớn hơn số đã giải ngân/);
    await env.closure.prepareLiquidation(env.as("officer"), "project-1", { recoveredAmount: 3_000_000, liquidationDate: "2026-12-20", evidenceFileIds: ["file-liquidation"], contextVersion: await env.context() });
    assert.equal(env.db.tables.liquidations[0].status, "DRAFT");
    assert.equal(env.dispatched.at(-1).type, "LIQUIDATION_PREPARED");
    await assert.rejects(env.closure.approveLiquidation(env.as("officer"), "project-1", { contextVersion: await env.context() }), (error) => error.status === 403);
    await assert.rejects(env.closure.approveLiquidation(env.as("leader"), "project-1", { contextVersion: await env.context() }), /Chưa cân đối kinh phí/);
    await env.closure.prepareLiquidation(env.as("officer"), "project-1", { recoveredAmount: 5_000_000, liquidationDate: "2026-12-20", contextVersion: await env.context() });
    await env.closure.approveLiquidation(env.as("leader"), "project-1", { contextVersion: await env.context() });
    const liquidation = env.db.tables.liquidations[0];
    assert.equal(liquidation.status, "APPROVED");
    assert.equal(liquidation.liquidationNumber, "001/BBTL-HVQY/2026");
    const read = await env.closure.getFinance(env.as("staff2"), "project-1");
    assert.equal(read.canManage, false, "kinh phí bị khoá sau khi thanh lý");
    await env.closure.closeProject(env.as("officer"), "project-1", { note: "Hoàn tất", contextVersion: await env.context() });
    assert.equal(env.project().status, "closed");
    assert.ok(env.project().closedAt instanceof Date);
    assert.equal(env.dispatched.at(-1).type, "PROJECT_CLOSED");
    const after = await env.projects.getProject(env.as("officer"), "project-1");
    for (const action of ["project.finance.manage", "project.liquidation.prepare", "project.close", "project.acceptance.submit"]) assert.ok(!after.viewerAuthorization.allowedActions.includes(action), action);
  });

  it("đề tài không đạt vẫn phải thanh lý (thu hồi kinh phí) trước khi đóng", async () => {
    const env = setup();
    await toEstablishedCouncil(env);
    await env.closure.recordMinutes(env.as("officer"), "project-1", { reportScore: 10, scientificProductsScore: 10, trainingProductsScore: 5, militaryMedicalPracticalScore: 10, contextVersion: await env.context() });
    assert.equal(env.project().status, "failed");
    await env.closure.prepareLiquidation(env.as("officer"), "project-1", { recoveredAmount: 0, contextVersion: await env.context() });
    await env.closure.approveLiquidation(env.as("leader"), "project-1", { liquidationNumber: "12/TL-2026", contextVersion: await env.context() });
    assert.equal(env.db.tables.liquidations[0].outcome, "failed");
    assert.equal(env.db.tables.liquidations[0].liquidationNumber, "12/TL-2026");
    await env.closure.closeProject(env.as("officer"), "project-1", { contextVersion: await env.context() });
    assert.equal(env.project().status, "closed");
  });
});

describe("Capability nghiệm thu / thanh lý (một nguồn sự thật cho giao diện và máy chủ)", () => {
  const base = { id: "p", ownerId: "pi", hostOrganizationUnitId: "unit-1", updatedAt: new Date(), aggregateVersion: 1 };
  const people = {
    pi: { id: "pi", systemRole: "RESEARCHER_INTERNAL_USER", organizationScopes: [{ id: "unit-1" }] },
    officer: { id: "officer", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationScopes: [{ id: "unit-1" }] },
    staff2: { id: "staff2", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationScopes: [{ id: "unit-1" }] },
    leader: { id: "leader", systemRole: "LEADERSHIP_APPROVAL_AUTHORITY", organizationScopes: [] }
  };
  const officerFact = { officerUserId: "officer", status: "ACTIVE", effectiveFrom: new Date(0), effectiveUntil: null };
  const allowed = (who, status, closure) => projectViewerAuthorizationV1({ actor: people[who], project: { ...base, status }, projectOfficer: officerFact, participant: { isParticipant: false }, closure }).allowedActions;

  const cases = [
    ["pi", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.acceptance.submit", true],
    ["pi", "paused", { acceptanceStatus: null, liquidationStatus: null }, "project.acceptance.submit", false],
    ["officer", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.acceptance.submit", false],
    ["officer", "pending_acceptance", { acceptanceStatus: "SUBMITTED", liquidationStatus: null }, "project.acceptance.return", true],
    ["staff2", "pending_acceptance", { acceptanceStatus: "SUBMITTED", liquidationStatus: null }, "project.acceptance.council.propose", false],
    ["leader", "pending_acceptance", { acceptanceStatus: "COUNCIL_PROPOSED", liquidationStatus: null }, "project.acceptance.council.establish", true],
    ["officer", "pending_acceptance", { acceptanceStatus: "COUNCIL_PROPOSED", liquidationStatus: null }, "project.acceptance.council.establish", false],
    ["officer", "pending_acceptance", { acceptanceStatus: "COUNCIL_ESTABLISHED", liquidationStatus: null }, "project.acceptance.minutes.record", true],
    ["pi", "pending_acceptance", { acceptanceStatus: "REVISION_REQUIRED", liquidationStatus: null }, "project.acceptance.revision.submit", true],
    ["officer", "pending_acceptance", { acceptanceStatus: "REVISION_SUBMITTED", liquidationStatus: null }, "project.acceptance.revision.confirm", true],
    ["staff2", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.finance.manage", true],
    ["leader", "accepted", { acceptanceStatus: "PASSED", liquidationStatus: "DRAFT" }, "project.finance.manage", true],
    ["pi", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.finance.manage", false],
    ["pi", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.finance.read", true],
    ["staff2", "accepted", { acceptanceStatus: "PASSED", liquidationStatus: "APPROVED" }, "project.finance.manage", false],
    ["officer", "accepted", { acceptanceStatus: "PASSED", liquidationStatus: null }, "project.liquidation.prepare", true],
    ["officer", "pending_acceptance", { acceptanceStatus: "COUNCIL_ESTABLISHED", liquidationStatus: null }, "project.liquidation.prepare", false],
    ["leader", "failed", { acceptanceStatus: "FAILED", liquidationStatus: "DRAFT" }, "project.liquidation.approve", true],
    ["officer", "accepted", { acceptanceStatus: "PASSED", liquidationStatus: "DRAFT" }, "project.close", false],
    ["officer", "accepted", { acceptanceStatus: "PASSED", liquidationStatus: "APPROVED" }, "project.close", true],
    ["officer", "closed", { acceptanceStatus: "PASSED", liquidationStatus: "APPROVED" }, "project.close", false],
    ["officer", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.product.manage", true],
    ["officer", "pending_acceptance", { acceptanceStatus: "SUBMITTED", liquidationStatus: null }, "project.product.manage", false],
    ["pi", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.product.submit", true],
    ["staff2", "executing", { acceptanceStatus: null, liquidationStatus: null }, "project.product.review", false],
    ["officer", "pending_superior_acceptance", { acceptanceStatus: "PASSED", liquidationStatus: null, superiorStatus: "PREPARING" }, "project.superior.send", true],
    ["officer", "pending_superior_acceptance", { acceptanceStatus: "PASSED", liquidationStatus: null, superiorStatus: "SENT" }, "project.superior.send", false],
    ["officer", "pending_superior_acceptance", { acceptanceStatus: "PASSED", liquidationStatus: null, superiorStatus: "SENT" }, "project.superior.result", true],
    ["leader", "pending_superior_acceptance", { acceptanceStatus: "PASSED", liquidationStatus: null, superiorStatus: "SENT" }, "project.superior.result", false],
    ["officer", "pending_superior_acceptance", { acceptanceStatus: "PASSED", liquidationStatus: null, superiorStatus: "PREPARING" }, "project.liquidation.prepare", false]
  ];
  for (const [who, status, closure, action, expected] of cases) {
    it(`${who} · ${status} · ${closure.acceptanceStatus ?? "-"}/${closure.liquidationStatus ?? "-"} → ${action} = ${expected}`, () => {
      assert.equal(allowed(who, status, closure).includes(action), expected);
    });
  }

  it("thành viên đề tài (kể cả cán bộ QLKH) không được quản lý kinh phí đề tài mình tham gia", () => {
    const capability = projectViewerAuthorizationV1({ actor: people.staff2, project: { ...base, status: "executing" }, projectOfficer: officerFact, participant: { isParticipant: true, role: "TOPIC_MEMBER" }, closure: { acceptanceStatus: null, liquidationStatus: null } });
    assert.ok(!capability.allowedActions.includes("project.finance.manage"));
  });
});

describe("Giao dịch đề tài", () => {
  it("xung đột tuần tự hoá (P2034) được thử lại; thông báo chỉ phát một lần cho lần thử thành công", async () => {
    const env = setup();
    const original = env.db.$transaction.bind(env.db);
    let calls = 0;
    // Lần thử đầu chạy work() rồi "bị huỷ" do P2034: khôi phục bảng để mô phỏng rollback.
    const snapshot = structuredClone({ acceptances: env.db.tables.acceptances, projects: env.db.tables.projects });
    env.db.$transaction = async (work) => {
      calls += 1;
      if (calls === 1) {
        await work(env.db);
        env.db.tables.acceptances.splice(0, env.db.tables.acceptances.length, ...structuredClone(snapshot.acceptances));
        env.db.tables.projects.splice(0, env.db.tables.projects.length, ...structuredClone(snapshot.projects));
        const error = new Error("serialization"); error.code = "P2034"; throw error;
      }
      return original(work);
    };
    await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    assert.equal(calls, 2);
    assert.equal(env.db.tables.acceptances.length, 1);
    assert.equal(env.dispatched.filter((event) => event.type === "ACCEPTANCE_SUBMITTED").length, 1);
  });
});

describe("Bước 1: nghiệm thu sản phẩm bởi tổ chuyên gia", () => {
  const panel = [{ profileId: "prof-a", role: "LEADER" }, { profileId: "prof-b", role: "MEMBER" }, { profileId: "prof-c", role: "MEMBER" }];

  it("chuyên viên lập danh sách sản phẩm theo nội dung công việc (dạng 1–6); chủ nhiệm không lập được", async () => {
    const env = setup({ productStatus: null });
    const products = [{ title: "Nội dung 1: Khảo sát", productForm: 1 }, { title: "Nội dung 2: Quy trình", productForm: 2, milestoneId: "ms-1" }];
    await assert.rejects(env.closure.saveProducts(env.as("pi"), "project-1", { products, contextVersion: await env.context() }), (error) => error.status === 403);
    await assert.rejects(env.closure.saveProducts(env.as("officer"), "project-1", { products: [{ title: "X", productForm: 7 }], contextVersion: await env.context() }), /từ 1 đến 6/);
    const saved = await env.closure.saveProducts(env.as("officer"), "project-1", { products, contextVersion: await env.context() });
    assert.deepEqual(saved.products.map((item) => [item.title, item.productForm, item.status]), [["Nội dung 1: Khảo sát", 1, "PLANNED"], ["Nội dung 2: Quy trình", 2, "PLANNED"]]);
  });

  it("nộp minh chứng → tổ chuyên gia 3–5 người, 1 tổ trưởng, không người tham gia → không đạt → nộp lại → đạt", async () => {
    const env = setup({ productStatus: "PLANNED" });
    await assert.rejects(env.closure.submitProduct(env.as("pi"), "project-1", { productId: "prod-1", evidenceFileIds: ["file-voucher"], contextVersion: await env.context() }), /không đúng loại tệp/);
    await env.closure.submitProduct(env.as("pi"), "project-1", { productId: "prod-1", note: "Báo cáo khảo sát", evidenceFileIds: ["file-product"], contextVersion: await env.context() });
    assert.equal(env.db.tables.products[0].status, "SUBMITTED");
    assert.equal(env.dispatched.at(-1).type, "PRODUCT_SUBMITTED");
    assert.deepEqual(env.dispatched.at(-1).userIds, ["officer"]);
    // Không cho sửa nội dung / dạng sản phẩm đã nộp.
    await assert.rejects(env.closure.saveProducts(env.as("officer"), "project-1", { products: [{ id: "prod-1", title: "Đổi tên", productForm: 1 }], contextVersion: await env.context() }), /không đổi nội dung/);
    await assert.rejects(env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: panel.slice(0, 2), contextVersion: await env.context() }), /từ 3 đến 5/);
    await assert.rejects(env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: [...panel, { profileId: "prof-d", role: "LEADER" }], contextVersion: await env.context() }), /đúng một tổ trưởng/);
    await assert.rejects(env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: [...panel, { profileId: "prof-pi", role: "MEMBER" }], contextVersion: await env.context() }), /không thể tham gia tổ chuyên gia/);
    await assert.rejects(env.closure.formProductPanel(env.as("staff2"), "project-1", { productId: "prod-1", members: panel, contextVersion: await env.context() }), (error) => error.status === 403);
    // Minh chứng bị xoá trước khi lập tổ chuyên gia → không lập được.
    const evidence = env.db.tables.files.find((file) => file.id === "file-product");
    evidence.status = "deleted";
    await assert.rejects(env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: panel, contextVersion: await env.context() }), /đã bị xoá/);
    evidence.status = "active";
    await env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: panel, reviewDate: "2026-11-01", location: "Phòng 2", contextVersion: await env.context() });
    assert.equal(env.db.tables.products[0].status, "UNDER_REVIEW");
    assert.ok(env.dispatched.some((event) => event.type === "INVITATION_TO_REVIEW" && event.userIds.includes("ext-a")));
    await assert.rejects(env.closure.recordProductReview(env.as("officer"), "project-1", { productId: "prod-1", result: "FAILED", minutesFileIds: ["file-panel-minutes"], contextVersion: await env.context() }), /bắt buộc/);
    await assert.rejects(env.closure.recordProductReview(env.as("officer"), "project-1", { productId: "prod-1", result: "PASSED", contextVersion: await env.context() }), /biên bản/);
    await env.closure.recordProductReview(env.as("officer"), "project-1", { productId: "prod-1", result: "FAILED", conclusion: "Thiếu số liệu nhóm chứng", minutesFileIds: ["file-panel-minutes"], contextVersion: await env.context() });
    assert.equal(env.db.tables.products[0].status, "FAILED");
    assert.match(env.dispatched.at(-1).message, /Thiếu số liệu nhóm chứng/);
    await env.closure.submitProduct(env.as("pi"), "project-1", { productId: "prod-1", evidenceFileIds: ["file-product-2"], contextVersion: await env.context() });
    await env.closure.formProductPanel(env.as("officer"), "project-1", { productId: "prod-1", members: panel, contextVersion: await env.context() });
    await env.closure.recordProductReview(env.as("officer"), "project-1", { productId: "prod-1", result: "PASSED", reviewDate: "2026-11-15", minutesFileIds: ["file-panel-minutes"], contextVersion: await env.context() });
    assert.equal(env.db.tables.products[0].status, "PASSED");
    assert.deepEqual(env.db.tables.productReviews.map((row) => [row.round, row.result]).sort(), [[1, "FAILED"], [2, "PASSED"]]);
    assert.match(env.dispatched.at(-1).message, /có thể nộp hồ sơ nghiệm thu cơ sở/);
    const result = await env.closure.submitAcceptance(env.as("pi"), "project-1", { ...dossier, contextVersion: await env.context() });
    assert.equal(result.status, "pending_acceptance");
  });
});

describe("Bước 3: đề nghị cấp trên nghiệm thu (cấp Bộ / Nhà nước)", () => {
  async function facilityPassed(level) {
    const env = setup({ level });
    await toEstablishedCouncil(env);
    await env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, meetingDate: TODAY, contextVersion: await env.context() });
    return env;
  }

  it("ngày họp ở tương lai bị từ chối (không được dời hạn 30 ngày)", async () => {
    const env = setup({ level: "ministry-level" });
    await toEstablishedCouncil(env);
    await assert.rejects(env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, meetingDate: "2099-01-01", contextVersion: await env.context() }), /tương lai/);
    await assert.rejects(env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, meetingDate: "2020-01-01", contextVersion: await env.context() }), /không được trước/);
  });

  it("đề tài cấp Học viện: nghiệm thu cơ sở đạt là kết thúc", async () => {
    const env = await facilityPassed("academy-level");
    assert.equal(env.project().status, "accepted");
    assert.equal(env.db.tables.superiors.length, 0);
  });

  it("cấp Bộ: chờ cấp trên, hạn 30 ngày từ ngày nghiệm thu cơ sở; chưa thanh lý được; gửi khi đủ hồ sơ; cấp trên đạt → đã nghiệm thu", async () => {
    const env = await facilityPassed("ministry-level");
    assert.equal(env.project().status, "pending_superior_acceptance");
    const superior = env.db.tables.superiors[0];
    assert.equal(superior.facilityAcceptedOn.toISOString().slice(0, 10), TODAY);
    assert.equal(superior.dueDate.toISOString().slice(0, 10), PLUS_30);
    const due = env.dispatched.find((event) => event.type === "SUPERIOR_REQUEST_DUE");
    assert.deepEqual(due.userIds.sort(), ["leader", "officer"]);
    assert.match(due.message, new RegExp(PLUS_30.split("-").reverse().join("/")));
    const view = await env.projects.getProject(env.as("officer"), "project-1");
    assert.ok(!view.viewerAuthorization.allowedActions.includes("project.liquidation.prepare"), "chưa thanh lý khi cấp trên chưa nghiệm thu");
    assert.ok(view.viewerAuthorization.allowedActions.includes("project.superior.prepare"));

    await assert.rejects(env.closure.sendSuperiorRequest(env.as("officer"), "project-1", { contextVersion: await env.context() }), /Chưa có danh mục hồ sơ/);
    const checklist = [{ title: "Báo cáo tổng hợp kết quả đề tài" }, { title: "Biên bản nghiệm thu cơ sở", done: true, fileIds: ["file-superior-1"] }];
    await env.closure.saveSuperiorDossier(env.as("officer"), "project-1", { checklist, letterNumber: "123/HVQY-KHQS", letterDate: "2026-11-20", recipient: "Cục Khoa học quân sự", letterFileIds: ["file-superior-letter"], contextVersion: await env.context() });
    await assert.rejects(env.closure.sendSuperiorRequest(env.as("officer"), "project-1", { contextVersion: await env.context() }), /Còn 1 mục hồ sơ chưa hoàn thành/);
    const saved = env.db.tables.superiors[0].checklist;
    await env.closure.saveSuperiorDossier(env.as("officer"), "project-1", { checklist: saved.map((item) => ({ ...item, done: true, fileIds: ["file-superior-1"] })), letterNumber: "123/HVQY-KHQS", letterDate: "2026-11-20", recipient: "Cục Khoa học quân sự", letterFileIds: ["file-superior-letter"], contextVersion: await env.context() });
    await env.closure.sendSuperiorRequest(env.as("officer"), "project-1", { contextVersion: await env.context() });
    assert.equal(env.db.tables.superiors[0].status, "SENT");
    assert.equal(env.dispatched.at(-1).type, "SUPERIOR_REQUEST_SENT");
    await assert.rejects(env.closure.saveSuperiorDossier(env.as("officer"), "project-1", { checklist: [], contextVersion: await env.context() }), /trạng thái|bước/i);
    await assert.rejects(env.closure.recordSuperiorResult(env.as("officer"), "project-1", { result: "PASSED", resultDate: "2026-12-20", contextVersion: await env.context() }), /quyết định hoặc biên bản/);
    await env.closure.recordSuperiorResult(env.as("officer"), "project-1", { result: "PASSED", decisionNumber: "45/QĐ-BQP", resultDate: "2026-12-20", resultFileIds: ["file-superior-result"], contextVersion: await env.context() });
    assert.equal(env.project().status, "accepted");
    const after = await env.projects.getProject(env.as("officer"), "project-1");
    assert.ok(after.viewerAuthorization.allowedActions.includes("project.liquidation.prepare"));
    assert.equal(after.superiorAcceptance.status, "PASSED");
  });

  it("cấp Nhà nước, hoàn thiện sau hội đồng: hạn tính từ ngày chuyên viên xác nhận bản hoàn thiện; cấp trên không đạt → không đạt", async () => {
    const env = setup({ level: "national-level" });
    await toEstablishedCouncil(env);
    await env.closure.recordMinutes(env.as("officer"), "project-1", { ...passingScores, resolution: "revise", contextVersion: await env.context() });
    await env.closure.submitRevision(env.as("pi"), "project-1", { finalReportSummary: "Đã sửa", evidenceFileIds: ["file-revision"], contextVersion: await env.context() });
    await env.closure.confirmRevision(env.as("officer"), "project-1", { outcome: "accept", contextVersion: await env.context() });
    assert.equal(env.project().status, "pending_superior_acceptance");
    const superior = env.db.tables.superiors[0];
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    assert.equal(superior.facilityAcceptedOn.toISOString().slice(0, 10), today);
    assert.equal(superior.level, "national-level");
    superior.status = "SENT"; superior.letterNumber = "1"; superior.letterDate = new Date(); superior.sentAt = new Date();
    env.project().aggregateVersion += 1;
    await env.closure.recordSuperiorResult(env.as("officer"), "project-1", { result: "FAILED", resultDate: "2027-01-05", resultFileIds: ["file-superior-result"], contextVersion: await env.context() });
    assert.equal(env.project().status, "failed");
  });
});
