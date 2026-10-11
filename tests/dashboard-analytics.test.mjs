import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { ApprovedProjectsService } from "../dist/apps/api/approved-projects/approved-projects.service.js";
import { DashboardService } from "../dist/apps/api/dashboard/dashboard.service.js";
import { DashboardAnalyticsService, toDashboardProject } from "../dist/apps/api/dashboard/dashboard-analytics.service.js";
import { ProjectHealthSnapshotService, snapshotDateOf, snapshotRow } from "../dist/apps/api/dashboard/project-health-snapshot.service.js";
import { parseDashboardQuery } from "../dist/apps/api/dashboard/dashboard-query.js";
import { ProposalReviewAccessService } from "../dist/apps/api/proposals-shared/proposal-review-access.service.js";
import { ProposalManagementOfficerService } from "../dist/apps/api/proposals-shared/proposal-management-officer.service.js";
import { ProposalParticipationService } from "../dist/apps/api/research-proposals/proposal-participation.service.js";
import { actor, createClosureDb, seedExecutingProject } from "./helpers/project-closure-prisma.mjs";

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY);
// Ngày lịch (cột DATE, 00:00Z) cách hôm nay — theo giờ Việt Nam — đúng `days` ngày; không phụ thuộc giờ chạy test.
const calendarDaysAgo = (days) => new Date((Math.floor((Date.now() + 7 * 3_600_000) / DAY) - days) * DAY);

/**
 * Hai đơn vị:
 *  - unit-1 (Khoa Nội): project-1 đang thực hiện, đúng tiến độ (mẫu chung); project-3 đã nghiệm thu, cấp Nhà nước.
 *  - unit-2 (Khoa Ngoại): project-2 cấp Bộ, quá ngày kết thúc, mốc trễ 40 ngày → Đỏ; chủ nhiệm pi2.
 * Hồ sơ: proposal-1 (unit-1, đã duyệt), proposal-3 (unit-1, đã nộp), proposal-2 (unit-2, đã duyệt).
 */
function seed() {
  const db = seedExecutingProject(createClosureDb());
  const t = db.tables;
  t.units.push({ id: "unit-2", code: "U2", name: "Khoa Ngoại", status: "active" });
  const user = (id, systemRole, unitId) => {
    t.users.push({ id, username: id, displayName: `Người ${id}`, systemRole, status: "active", unit: "x", credentialEmail: `${id}@example.test` });
    if (unitId) t.scopes.push({ id: `scope-${id}`, userId: id, organizationUnitId: unitId });
  };
  user("pi2", "RESEARCHER_INTERNAL_USER", "unit-2");
  user("staff-u2", "RESEARCH_MANAGEMENT_STAFF", "unit-2");
  const past = ago(200);

  const proposalBase = (id, unitId, unitName, ownerId, status, extra = {}) => ({
    id, code: id.toUpperCase(), title: `Hồ sơ ${id}`, ownerId, hostOrganizationUnitId: unitId, hostOrganizationUnit: { id: unitId, name: unitName },
    owner: { displayName: `Người ${ownerId}`, username: ownerId }, status, createdAt: past, submittedAt: past, endDate: null, budgetMetadata: { amount: 50_000_000 },
    researchFieldCode: "YH", proposalTypeCode: "academy-level", ...extra
  });
  Object.assign(t.proposals[0], proposalBase("proposal-1", "unit-1", "Khoa Nội", "pi", "approved", { code: "DT-01", budgetMetadata: { amount: 120_000_000 } }));
  t.proposals.push(proposalBase("proposal-2", "unit-2", "Khoa Ngoại", "pi2", "approved", { proposalTypeCode: "ministry-level" }));
  t.proposals.push(proposalBase("proposal-3", "unit-1", "Khoa Nội", "pi", "submitted", { endDate: ago(5) }));
  t.proposals.push(proposalBase("proposal-4", "unit-1", "Khoa Nội", "pi", "approved", { proposalTypeCode: "national-level" }));

  t.projects.push({ ...structuredClone(t.projects[0]), id: "project-2", code: "DT-02", proposalId: "proposal-2", hostOrganizationUnitId: "unit-2", title: "Đề tài cấp Bộ", scopeSnapshot: { proposalTypeCode: "ministry-level", researchFieldCode: "YH" }, startDate: ago(400), endDate: ago(10) });
  t.projects.push({ ...structuredClone(t.projects[0]), id: "project-3", code: "DT-03", proposalId: "proposal-4", title: "Đề tài cấp Nhà nước", scopeSnapshot: { proposalTypeCode: "national-level" }, status: "accepted" });
  t.members.push({ id: "m-pi2", projectId: "project-2", userId: "pi2", name: "Chủ nhiệm 2", role: "TOPIC_PI", participationRole: "TOPIC_PI", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.members.push({ id: "m-pi3", projectId: "project-3", userId: "pi", name: "Chủ nhiệm", role: "TOPIC_PI", participationRole: "TOPIC_PI", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.officers.push({ id: "o-2", projectId: "project-2", officerUserId: "staff-u2", assignedById: "leader", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.milestones.push({ id: "ms-2", projectId: "project-2", title: "Thử nghiệm", dueDate: calendarDaysAgo(40), status: "in_progress", position: 0, weightPercent: 100, progressPercent: 20 });
  t.products.push({ id: "prod-2", projectId: "project-2", position: 0, title: "Nội dung 1 cấp Bộ", productForm: 2, requirements: null, milestoneId: null, status: "SUBMITTED", submission: null, createdById: "staff-u2", createdAt: past, updatedAt: past });
  t.finances.push({ projectId: "project-1", totalBudget: 100_000_000n, totalDisbursed: 40_000_000n, totalSettled: 10_000_000n, settlementStatus: "PENDING", version: 1 });
  t.finances.push({ projectId: "project-2", totalBudget: 200_000_000n, totalDisbursed: 150_000_000n, totalSettled: 0n, settlementStatus: "PENDING", version: 1 });
  t.deliverables.push({ id: "d1", proposalId: "proposal-1", type: "Bài báo khoa học", title: "Bài báo 1", status: "draft", publishedAt: null });
  t.deliverables.push({ id: "d2", proposalId: "proposal-2", type: "Bằng sáng chế", title: "Bằng 1", status: "published", publishedAt: past });
  return db;
}

function services(db) {
  const projects = new ApprovedProjectsService(db, new AuditLogService(db));
  const dashboard = new DashboardService(db, new ProposalParticipationService(db), new ProposalReviewAccessService(db), new ProposalManagementOfficerService(db));
  return { analytics: new DashboardAnalyticsService(db, dashboard, projects), snapshots: new ProjectHealthSnapshotService(db) };
}

const ids = (result) => result.items.map((row) => row.id).sort();
const rejects400 = (promise, field) => assert.rejects(promise, (error) => error.constructor.name === "BadRequestException" && (!field || error.response.field === field));

describe("Dashboard: kiểm tra tham số theo danh sách trắng", () => {
  it("khoá lạ, giá trị lặp, định dạng sai đều bị từ chối; chuỗi rỗng coi như không lọc", () => {
    assert.throws(() => parseDashboardQuery({ ownerId: "pi" }, ["unitId"]), (error) => error.response.field === "ownerId");
    assert.throws(() => parseDashboardQuery({ unitId: ["unit-1", "unit-2"] }, ["unitId"]), (error) => error.response.field === "unitId");
    assert.throws(() => parseDashboardQuery({ unitId: { $ne: "x" } }, ["unitId"]));
    assert.throws(() => parseDashboardQuery({ unitId: "unit 1; drop" }, ["unitId"]));
    assert.throws(() => parseDashboardQuery({ year: "1999" }, ["year"]));
    assert.throws(() => parseDashboardQuery({ from: "2026-02-30" }, ["from"]));
    assert.throws(() => parseDashboardQuery({ health: "purple" }, ["health"]));
    assert.throws(() => parseDashboardQuery({ type: "a\u0000b" }, ["type"]));
    assert.deepEqual(parseDashboardQuery({ unitId: "", year: "2026", overdue: "false", type: "Bài báo khoa học" }, ["unitId", "year", "overdue", "type"]), { year: 2026, overdue: false, type: "Bài báo khoa học" });
  });
});

describe("Dashboard: drill-down không lọt dữ liệu", () => {
  it("người dùng không xác định: 403 ở mọi API", async () => {
    const { analytics } = services(seed());
    for (const call of [() => analytics.trends(undefined, {}), () => analytics.distribution(undefined, { subject: "projects" }), () => analytics.products(undefined, {}), () => analytics.drillDown(undefined, { metric: "projects" })]) {
      await assert.rejects(call(), (error) => error.constructor.name === "ForbiddenException");
    }
  });

  it("chuyên viên đơn vị 1 chỉ thấy đề tài đơn vị 1; lọc sang đơn vị 2 hay theo mức Đỏ cũng không mở rộng phạm vi", async () => {
    const db = seed();
    const { analytics } = services(db);
    const staff = actor(db, "staff2");
    assert.deepEqual(ids(await analytics.drillDown(staff, { metric: "projects" })), ["project-1", "project-3"]);
    assert.equal((await analytics.drillDown(staff, { metric: "projects", unitId: "unit-2" })).total, 0);
    assert.equal((await analytics.drillDown(staff, { metric: "projects", health: "red" })).total, 0);
    assert.equal((await analytics.drillDown(staff, { metric: "products", form: "2" })).total, 0);
  });

  it("người ngoài (không phạm vi, không tham gia) không thấy gì; chủ nhiệm chỉ thấy đề tài, hồ sơ, sản phẩm của mình", async () => {
    const db = seed();
    const { analytics } = services(db);
    const outsider = actor(db, "outsider");
    for (const metric of ["projects", "proposals", "products", "deliverables"]) assert.equal((await analytics.drillDown(outsider, { metric })).total, 0, metric);
    const pi2 = actor(db, "pi2");
    assert.deepEqual(ids(await analytics.drillDown(pi2, { metric: "projects" })), ["project-2"]);
    assert.deepEqual(ids(await analytics.drillDown(pi2, { metric: "proposals" })), ["proposal-2"]);
    assert.deepEqual(ids(await analytics.drillDown(pi2, { metric: "products" })), ["prod-2"]);
    assert.deepEqual(ids(await analytics.drillDown(pi2, { metric: "deliverables" })), ["d2"]);
  });

  it("lãnh đạo xem toàn Học viện: danh sách đề tài Đỏ có chủ nhiệm, số ngày trễ, liên kết; dòng chỉ chứa trường được liệt kê", async () => {
    const db = seed();
    const { analytics } = services(db);
    const result = await analytics.drillDown(actor(db, "leader"), { metric: "projects", health: "red" });
    assert.equal(result.total, 1);
    const [row] = result.items;
    assert.equal(row.id, "project-2");
    assert.equal(row.piName, "Người pi2");
    assert.equal(row.unit.name, "Khoa Ngoại");
    assert.equal(row.daysOverdue, 40);
    assert.equal(row.overdue, true);
    assert.equal(row.link, "/projects/project-2");
    assert.equal(row.totalBudget, 200_000_000);
    assert.deepEqual(Object.keys(row).sort(), ["actualPercent", "code", "daysOverdue", "startDate", "endDate", "field", "health", "id", "lateReports", "level", "link", "overdue", "piName", "plannedPercent", "spi", "status", "title", "totalBudget", "totalDisbursed", "unit"].sort());
    for (const forbidden of ["members", "reports", "requests", "history", "viewerAuthorization", "finance", "acceptances"]) assert.ok(!(forbidden in row), forbidden);
  });

  it("hồ sơ: dùng đúng bộ lọc canReadProposal (lãnh đạo không có phạm vi đơn vị thì không thấy hồ sơ); quá hạn tính như KPI cũ", async () => {
    const db = seed();
    const { analytics } = services(db);
    assert.equal((await analytics.drillDown(actor(db, "leader"), { metric: "proposals" })).total, 0);
    const head = actor(db, "head");
    assert.deepEqual(ids(await analytics.drillDown(head, { metric: "proposals" })), ["proposal-1", "proposal-3", "proposal-4"]);
    assert.deepEqual(ids(await analytics.drillDown(head, { metric: "proposals", overdue: "true" })), ["proposal-3"]);
    assert.deepEqual(ids(await analytics.drillDown(head, { metric: "proposals", level: "national-level" })), ["proposal-4"]);
    const [row] = (await analytics.drillDown(head, { metric: "proposals", status: "submitted" })).items;
    assert.deepEqual(Object.keys(row).sort(), ["code", "endDate", "field", "id", "level", "link", "overdue", "ownerName", "status", "submittedAt", "title", "unit"].sort());
  });

  it("sản phẩm đầu ra: giao của quyền đọc hồ sơ và quyền đọc sản phẩm đầu ra", async () => {
    const db = seed();
    const { analytics } = services(db);
    assert.deepEqual(ids(await analytics.drillDown(actor(db, "head"), { metric: "deliverables" })), ["d1"]);
    assert.deepEqual(ids(await analytics.drillDown(actor(db, "head"), { metric: "deliverables", type: "Bằng sáng chế" })), []);
    // Thành viên đề tài đọc được hồ sơ nhưng không phải chủ nhiệm / cán bộ quản lý: không thấy sản phẩm đầu ra.
    db.tables.proposalMembers.push({ proposalId: "proposal-1", userId: "member", participationRole: "TOPIC_MEMBER", createdAt: ago(100), status: "ACTIVE", effectiveFrom: ago(100), effectiveUntil: null });
    const member = actor(db, "member");
    assert.deepEqual(ids(await analytics.drillDown(member, { metric: "proposals" })), ["proposal-1"]);
    assert.equal((await analytics.drillDown(member, { metric: "deliverables" })).total, 0);
  });

  it("metric lạ, bộ lọc không thuộc metric, pageSize quá lớn: 400; phân trang ổn định", async () => {
    const db = seed();
    const { analytics } = services(db);
    const leader = actor(db, "leader");
    await rejects400(analytics.drillDown(leader, {}), "metric");
    await rejects400(analytics.drillDown(leader, { metric: "users" }), "metric");
    await rejects400(analytics.drillDown(leader, { metric: ["projects", "proposals"] }), "metric");
    await rejects400(analytics.drillDown(leader, { metric: "projects", form: "1" }), "form");
    await rejects400(analytics.drillDown(leader, { metric: "products", health: "red" }), "health");
    await rejects400(analytics.drillDown(leader, { metric: "projects", pageSize: "500" }), "pageSize");
    await rejects400(analytics.drillDown(leader, { metric: "projects", piUserId: "pi" }), "piUserId");
    const first = await analytics.drillDown(leader, { metric: "projects", pageSize: "2" });
    const second = await analytics.drillDown(leader, { metric: "projects", pageSize: "2", page: "2" });
    assert.equal(first.total, 3);
    assert.equal(first.items[0].id, "project-2", "đề tài trễ nhiều nhất lên đầu");
    assert.deepEqual([...first.items, ...second.items].map((row) => row.id).sort(), ["project-1", "project-2", "project-3"]);
  });
});

describe("Dashboard: phân bố và sản phẩm", () => {
  it("phân bố đề tài: lãnh đạo toàn trường, chuyên viên theo đơn vị; kinh phí chỉ cộng đề tài được xem kinh phí", async () => {
    const db = seed();
    const { analytics } = services(db);
    const all = await analytics.distribution(actor(db, "leader"), { subject: "projects" });
    assert.equal(all.totals.count, 3);
    assert.equal(all.totals.totalBudget, 300_000_000);
    assert.equal(all.totals.overdue, 1);
    assert.deepEqual(all.byUnit.map((row) => [row.key, row.count]), [["unit-1", 2], ["unit-2", 1]]);
    assert.equal(all.byUnit.find((row) => row.key === "unit-2").label, "Khoa Ngoại");
    assert.deepEqual(Object.fromEntries(all.byHealth.map((row) => [row.key, row.count])), { green: 1, amber: 0, red: 1, none: 1 });
    assert.equal(all.byYear.reduce((sum, row) => sum + row.count, 0), 3);
    assert.deepEqual(all.byUnitHealth.map((row) => [row.key, row.green, row.amber, row.red, row.none]), [["unit-1", 1, 0, 0, 1], ["unit-2", 0, 0, 1, 0]]);
    assert.deepEqual(Object.fromEntries(all.byLevel.map((row) => [row.key, row.count])), { "academy-level": 1, "ministry-level": 1, "national-level": 1 });
    const unit1 = await analytics.distribution(actor(db, "staff2"), { subject: "projects" });
    assert.equal(unit1.totals.count, 2);
    assert.equal(unit1.totals.totalBudget, 100_000_000);
    assert.ok(!unit1.byUnit.some((row) => row.key === "unit-2"));
    const filtered = await analytics.distribution(actor(db, "leader"), { subject: "projects", level: "ministry-level" });
    assert.equal(filtered.totals.count, 1);
    await rejects400(analytics.distribution(actor(db, "leader"), {}), "subject");
    await rejects400(analytics.distribution(actor(db, "leader"), { subject: "projects", health: "red" }), "health");
  });

  it("phân bố hồ sơ: số chờ xử lý, đã duyệt, kinh phí đã duyệt", async () => {
    const db = seed();
    const { analytics } = services(db);
    const result = await analytics.distribution(actor(db, "head"), { subject: "proposals" });
    assert.equal(result.totals.count, 3);
    assert.equal(result.totals.pending, 1);
    assert.equal(result.totals.approved, 2);
    assert.equal(result.totals.approvedBudget, 170_000_000);
    assert.ok(!result.byUnit.some((row) => row.key === "unit-2"));
  });

  it("đề tài không được xem kinh phí: không cộng vào tổng, dòng chi tiết để trống", () => {
    const row = toDashboardProject({ id: "p", code: "X", title: "t", status: "executing", hostOrganizationUnitId: "u", hostOrganizationUnit: { name: "U" }, scope: {}, members: [], progressSummary: { level: "amber", spi: 0.8 }, finance: null, products: [] });
    assert.equal(row.finance, null);
    assert.equal(row.health, "amber");
  });

  it("sản phẩm theo dạng 1–6 và trạng thái; sản phẩm đầu ra theo loại", async () => {
    const db = seed();
    const { analytics } = services(db);
    const all = await analytics.products(actor(db, "leader"), {});
    assert.equal(all.projectProducts.total, 2);
    assert.equal(all.projectProducts.byForm.length, 6);
    assert.deepEqual(all.projectProducts.byForm[1], { form: 2, total: 1, byStatus: { PLANNED: 0, SUBMITTED: 1, UNDER_REVIEW: 0, PASSED: 0, FAILED: 0 } });
    assert.equal(all.proposalDeliverables.total, 0, "lãnh đạo không có phạm vi đơn vị: không đọc được hồ sơ nên không đếm sản phẩm đầu ra");
    const unit1 = await analytics.products(actor(db, "staff2"), {});
    assert.equal(unit1.projectProducts.total, 1);
    assert.equal(unit1.projectProducts.byStatus.SUBMITTED, 0);
    const head = await analytics.products(actor(db, "head"), {});
    assert.deepEqual(head.proposalDeliverables.byType, [{ type: "Bài báo khoa học", total: 1, byStatus: { draft: 1 } }]);
    await rejects400(analytics.products(actor(db, "leader"), { form: "1" }), "form");
  });
});

describe("Ảnh chụp sức khoẻ hằng tuần và xu hướng", () => {
  it("ngày chụp theo giờ Việt Nam", () => {
    assert.equal(snapshotDateOf(new Date("2026-10-11T16:55:00.000Z")).toISOString(), "2026-10-11T00:00:00.000Z");
    assert.equal(snapshotDateOf(new Date("2026-10-11T17:05:00.000Z")).toISOString(), "2026-10-12T00:00:00.000Z");
  });

  it("dòng chụp: sức khoẻ, tiến độ, kinh phí; đề tài không thuộc diện đánh giá ghi not_applicable", () => {
    const db = seed();
    const now = new Date();
    const date = snapshotDateOf(now);
    const red = snapshotRow({ ...db.tables.projects[1], milestones: db.tables.milestones.filter((row) => row.projectId === "project-2"), finance: db.tables.finances[1] }, date, now);
    assert.equal(red.healthLevel, "red");
    assert.equal(red.healthSource, "computed");
    assert.equal(red.maxDaysOverdue, 40);
    assert.equal(red.level, "ministry-level");
    assert.equal(red.totalBudget, 200_000_000n);
    const accepted = snapshotRow({ ...db.tables.projects[2], milestones: [] }, date, now);
    assert.equal(accepted.healthLevel, null);
    assert.equal(accepted.healthSource, "not_applicable");
    assert.equal(accepted.totalBudget, null);
  });

  it("chạy lại cùng ngày không ghi trùng; tuần sau ghi thêm", async () => {
    const db = seed();
    const { snapshots } = services(db);
    assert.equal(await snapshots.run(ago(14)), 3);
    assert.equal(await snapshots.run(ago(14)), 0);
    assert.equal(await snapshots.run(ago(7)), 3);
    assert.equal(db.tables.snapshots.length, 6);
  });

  it("tác vụ theo lịch tắt được bằng HEALTH_SNAPSHOTS_ENABLED=false", async () => {
    const db = seed();
    const { snapshots } = services(db);
    process.env.HEALTH_SNAPSHOTS_ENABLED = "false";
    try { await snapshots.handleCron(); } finally { delete process.env.HEALTH_SNAPSHOTS_ENABLED; }
    assert.equal(db.tables.snapshots.length, 0);
  });

  it("xu hướng chỉ tính ảnh chụp của đề tài người xem đọc được hôm nay; có điểm hiện tại đánh dấu live", async () => {
    const db = seed();
    const { analytics, snapshots } = services(db);
    await snapshots.run(ago(14));
    await snapshots.run(ago(7));
    const leader = await analytics.trends(actor(db, "leader"), {});
    assert.deepEqual(leader.series.map((point) => [point.total, point.live]), [[3, false], [3, false], [3, true]]);
    assert.equal(leader.series[0].health.red, 1);
    assert.equal(leader.series[0].totalBudget, 300_000_000);
    const staff = await analytics.trends(actor(db, "staff2"), {});
    assert.deepEqual(staff.series.map((point) => point.total), [2, 2, 2]);
    assert.ok(staff.series.every((point) => point.health.red === 0 && point.totalBudget === 100_000_000));
    const crossUnit = await analytics.trends(actor(db, "staff2"), { unitId: "unit-2" });
    assert.ok(crossUnit.series.every((point) => point.total === 0));
    const outsider = await analytics.trends(actor(db, "outsider"), {});
    assert.ok(outsider.series.every((point) => point.total === 0));
    const past = await analytics.trends(actor(db, "leader"), { to: ago(10).toISOString().slice(0, 10) });
    assert.deepEqual(past.series.map((point) => point.live), [false], "khoảng thời gian trong quá khứ không có điểm hiện tại");
  });

  it("đề tài đã nghiệm thu còn mốc chưa đóng: không tính trễ, không đẩy lên đầu danh sách, không vào xu hướng", async () => {
    const db = seed();
    const { analytics, snapshots } = services(db);
    db.tables.milestones.push({ id: "ms-3", projectId: "project-3", title: "Mốc cũ", dueDate: calendarDaysAgo(90), status: "in_progress", position: 0, weightPercent: 100, progressPercent: 50 });
    db.tables.checkpoints.push({ id: "c-3", projectId: "project-3", title: "Báo cáo cũ", dueDate: calendarDaysAgo(60), status: "open" });
    const list = await analytics.drillDown(actor(db, "leader"), { metric: "projects" });
    assert.equal(list.items[0].id, "project-2");
    const accepted = list.items.find((row) => row.id === "project-3");
    assert.equal(accepted.daysOverdue, 0);
    assert.equal(accepted.lateReports, 0);
    await snapshots.run(ago(7));
    const row = db.tables.snapshots.find((item) => item.projectId === "project-3");
    assert.deepEqual([row.maxDaysOverdue, row.overdueMilestones, row.lateReports], [0, 0, 0]);
    const trend = await analytics.trends(actor(db, "leader"), {});
    assert.ok(trend.series.every((point) => point.projectsWithOverdueMilestones === 1));
  });

  it("khoảng thời gian hoàn toàn ở tương lai không có điểm hiện tại", async () => {
    const db = seed();
    const { analytics } = services(db);
    const from = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10);
    assert.deepEqual((await analytics.trends(actor(db, "leader"), { from, to })).series, []);
  });

  it("đến hạn chụp: tối Chủ nhật; ngày khác chỉ chụp bù khi lần gần nhất cũ hơn 7 ngày", async () => {
    const db = seed();
    const { snapshots } = services(db);
    const sunday = new Date("2026-10-11T16:55:00.000Z");
    const wednesday = new Date("2026-10-14T16:55:00.000Z");
    assert.equal(await snapshots.isDue(wednesday), true, "chưa có ảnh chụp nào: chụp ngay");
    await snapshots.run(sunday);
    assert.equal(await snapshots.isDue(sunday), true);
    assert.equal(await snapshots.isDue(wednesday), false);
    assert.equal(await snapshots.isDue(new Date("2026-10-18T16:55:00.000Z")), true);
    assert.equal(await snapshots.isDue(new Date("2026-10-20T16:55:00.000Z")), true, "lỡ Chủ nhật 18/10: chụp bù");
    assert.equal(await snapshots.isDue(new Date("2026-10-17T16:55:00.000Z")), false);
  });

  it("chụp theo lô: hơn 200 đề tài vẫn chụp đủ, không trùng", async () => {
    const db = seed();
    const t = db.tables;
    for (let index = 0; index < 205; index += 1) t.projects.push({ ...structuredClone(t.projects[0]), id: `bulk-${String(index).padStart(3, "0")}`, code: `B-${index}` });
    const original = db.approvedProject.findMany;
    const calls = [];
    db.approvedProject.findMany = async (args) => {
      calls.push({ take: args.take, cursor: args.cursor?.id ?? null, skip: args.skip ?? 0 });
      const all = (await original(args)).sort((a, b) => a.id.localeCompare(b.id));
      const start = args.cursor ? all.findIndex((row) => row.id === args.cursor.id) + (args.skip ?? 0) : 0;
      return all.slice(start, start + args.take);
    };
    const { snapshots } = services(db);
    assert.equal(await snapshots.run(ago(1)), 208);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].skip, 1);
    assert.equal(new Set(t.snapshots.map((row) => row.projectId)).size, 208);
  });

  it("khoảng thời gian không hợp lệ: 400", async () => {
    const db = seed();
    const { analytics } = services(db);
    const leader = actor(db, "leader");
    await rejects400(analytics.trends(leader, { from: "2026-10-10", to: "2026-10-01" }), "from");
    await rejects400(analytics.trends(leader, { from: "2020-01-01", to: "2026-10-01" }), "from");
    await rejects400(analytics.trends(leader, { health: "red" }), "health");
  });
});
