import assert from "node:assert/strict";
import test from "node:test";
import {
  computeProjectProgress,
  effectiveWeights,
  resolveEffectiveHealth,
  validateDeclaredWeights,
  baselineFromMilestones
} from "../dist/apps/api/approved-projects/project-progress.js";
import { projectWorkItems, reviewWorkItems, sortWorkItems, summarizeWorkItems } from "../dist/apps/api/approved-projects/work-queue-items.js";

// Công thức tiến độ, Đợt 1 (docs/design/quan-ly-tien-do-nhiem-vu.md, mục 4 và 9).

const day = (value) => new Date(`${value}T00:00:00.000Z`);
const milestone = (id, dueDate, extra = {}) => ({ id, title: `Mốc ${id}`, dueDate, status: "open", progressPercent: 0, weightPercent: null, ...extra });
const baselineOf = (milestones, version = 1, startDate = "2031-01-01") => ({ version, startDate, endDate: "2031-12-31", milestones: baselineFromMilestones(milestones) });

test("weights: declared weights are used only when every milestone has one and they sum to 100", () => {
  assert.equal(effectiveWeights([{ id: "a", weightPercent: 20 }, { id: "b", weightPercent: 80 }]).configured, true);
  const partial = effectiveWeights([{ id: "a", weightPercent: 20 }, { id: "b", weightPercent: null }]);
  assert.equal(partial.configured, false);
  assert.equal(partial.weights.get("a"), 50);
  assert.equal(effectiveWeights([{ id: "a", weightPercent: 30 }, { id: "b", weightPercent: 30 }]).configured, false);

  assert.equal(validateDeclaredWeights([null, undefined]).ok, true);
  assert.equal(validateDeclaredWeights([20, 30, 50]).ok, true);
  assert.equal(validateDeclaredWeights([20, null]).ok, false);
  assert.equal(validateDeclaredWeights([20, 30]).ok, false);
  assert.equal(validateDeclaredWeights([20.5, 79.5]).ok, false);
  assert.equal(validateDeclaredWeights([-10, 110]).ok, false);
});

test("acceptance criterion: weights 20/30/50, first done, second at 50% → actual 35%", () => {
  const milestones = [
    milestone("m1", "2031-03-31", { weightPercent: 20, status: "completed", completedAt: "2031-03-30T08:00:00.000Z" }),
    milestone("m2", "2031-06-30", { weightPercent: 30, progressPercent: 50 }),
    milestone("m3", "2031-12-31", { weightPercent: 50 })
  ];
  const result = computeProjectProgress({ today: day("2031-05-15"), status: "executing", startDate: "2031-01-01", endDate: "2031-12-31", milestones, baseline: baselineOf(milestones) });
  assert.equal(result.actualPercent, 35);
  assert.equal(result.weightsConfigured, true);
  // Kế hoạch: m1 xong (20) + m2 đi được 45/91 ngày của cửa sổ 31/3 → 30/6 (≈14.8).
  assert.ok(result.plannedPercent > 34 && result.plannedPercent < 35.5, String(result.plannedPercent));
  assert.ok(result.spi >= 0.98 && result.spi <= 1.03, String(result.spi));
  assert.equal(result.level, "green");
  assert.deepEqual(result.reasons, []);
});

test("a milestone counts 100% only once completed; self-reported 100% is capped at 99", () => {
  const milestones = [milestone("m1", "2031-06-30", { progressPercent: 100 })];
  const result = computeProjectProgress({ today: day("2031-03-01"), status: "executing", startDate: "2031-01-01", milestones, baseline: baselineOf(milestones) });
  assert.equal(result.actualPercent, 99);
  assert.equal(result.milestones[0].progressPercent, 99);
});

test("SPI is not computed while planned progress is below 5%", () => {
  const milestones = [milestone("m1", "2031-12-31")];
  const result = computeProjectProgress({ today: day("2031-01-05"), status: "executing", startDate: "2031-01-01", milestones, baseline: baselineOf(milestones) });
  assert.equal(result.spi, null);
  assert.equal(result.level, "green");
});

test("thresholds: amber and red by SPI, overdue days, late reports and end date", () => {
  const base = { status: "executing", startDate: "2031-01-01", endDate: "2031-12-31" };
  const behind = [milestone("m1", "2031-07-01", { progressPercent: 20 }), milestone("m2", "2031-12-31")];
  const red = computeProjectProgress({ ...base, today: day("2031-06-01"), milestones: behind, baseline: baselineOf(behind) });
  assert.equal(red.level, "red");
  assert.ok(red.reasons.some((reason) => reason.startsWith("Chỉ số tiến độ")));

  const late = [milestone("m1", "2031-05-01", { progressPercent: 90 }), milestone("m2", "2031-12-31", { progressPercent: 30 })];
  const amber = computeProjectProgress({ ...base, today: day("2031-05-12"), milestones: late, baseline: baselineOf(late) });
  assert.equal(amber.maxDaysOverdue, 11);
  assert.equal(amber.overdueMilestones, 1);
  assert.equal(amber.level, "amber");

  const reports = computeProjectProgress({ ...base, today: day("2031-05-12"), milestones: late, baseline: baselineOf(late), checkpoints: [{ id: "c1", dueDate: "2031-04-01", status: "open" }, { id: "c2", dueDate: "2031-05-01", status: "open" }] });
  assert.equal(reports.lateReports, 2);
  assert.equal(reports.level, "red");

  const ended = computeProjectProgress({ ...base, endDate: "2031-06-30", today: day("2031-07-02"), milestones: [milestone("m1", "2031-06-30", { status: "completed" })], baseline: null });
  assert.equal(ended.endDatePassed, true);
  assert.equal(ended.level, "red");
});

test("a checkpoint whose report is submitted or under review is not counted late", () => {
  const milestones = [milestone("m1", "2031-12-31")];
  const checkpoints = [{ id: "c1", dueDate: "2031-04-01", status: "open" }, { id: "c2", dueDate: "2031-05-01", status: "open" }];
  const result = computeProjectProgress({ today: day("2031-05-12"), status: "executing", startDate: "2031-01-01", milestones, baseline: baselineOf(milestones), checkpoints, reports: [{ checkpointId: "c1", status: "under_review" }, { checkpointId: "c2", status: "supplement_requested" }] });
  assert.equal(result.lateReports, 1);
});

test("days are counted in Vietnam time: a milestone due today is not overdue at 01:00 local", () => {
  const milestones = [milestone("m1", "2031-05-12")];
  // 2031-05-12 01:00 tại Việt Nam = 2031-05-11 18:00 UTC.
  const sameDay = computeProjectProgress({ today: new Date("2031-05-11T18:00:00.000Z"), status: "executing", startDate: "2031-01-01", milestones, baseline: baselineOf(milestones) });
  assert.equal(sameDay.maxDaysOverdue, 0);
  // 2031-05-13 06:00 tại Việt Nam = 2031-05-12 23:00 UTC: quá hạn 1 ngày, dù theo UTC vẫn là ngày 12.
  const nextDay = computeProjectProgress({ today: new Date("2031-05-12T23:00:00.000Z"), status: "executing", startDate: "2031-01-01", milestones, baseline: baselineOf(milestones) });
  assert.equal(nextDay.maxDaysOverdue, 1);
  // Hoàn thành lúc 03:00 ngày 11 (giờ VN) = 20:00 UTC ngày 10: tính là ngày 11.
  const done = [milestone("m1", "2031-05-10", { status: "completed", completedAt: "2031-05-10T20:00:00.000Z" })];
  const slip = computeProjectProgress({ today: day("2031-06-01"), status: "executing", startDate: "2031-01-01", milestones: done, baseline: baselineOf(done) });
  assert.equal(slip.milestones[0].slipDays, 1);
});

test("health is not applicable before execution or after closure", () => {
  const milestones = [milestone("m1", "2031-06-30")];
  for (const status of ["preparing", "pending_acceptance", "accepted", "closed"]) {
    const result = computeProjectProgress({ today: day("2031-09-01"), status, startDate: "2031-01-01", milestones });
    assert.equal(result.level, null, status);
    assert.equal(result.applicable, false, status);
  }
});

test("slip is measured against the ORIGINAL baseline even after an approved re-plan", () => {
  const original = [milestone("m1", "2031-06-30")];
  const replanned = [milestone("m1", "2031-09-30")];
  const result = computeProjectProgress({
    today: day("2031-07-15"), status: "executing", startDate: "2031-01-01", endDate: "2031-12-31",
    milestones: replanned, baseline: baselineOf(replanned, 2), originalBaseline: baselineOf(original, 1)
  });
  assert.equal(result.baselineVersion, 2);
  assert.equal(result.milestones[0].originalDueDate, "2031-06-30");
  assert.equal(result.milestones[0].baselineDueDate, "2031-09-30");
  assert.equal(result.milestones[0].slipDays, 92);
  assert.equal(result.milestones[0].overdueDays, 0, "not overdue against the approved plan");
});

test("without a baseline the current milestones stand in, flagged as missing", () => {
  const milestones = [milestone("m1", "2031-06-30")];
  const result = computeProjectProgress({ today: day("2031-04-01"), status: "executing", startDate: "2031-01-01", milestones });
  assert.equal(result.baselineMissing, true);
  assert.equal(result.baselineVersion, null);
  assert.ok(result.plannedPercent > 0);
});

test("an officer assessment holds only while the computed level is unchanged", () => {
  const assessment = { id: "a1", level: "green", computedLevel: "amber", reason: "Đã có kế hoạch bù", createdAt: "2031-05-01T00:00:00.000Z" };
  assert.deepEqual(resolveEffectiveHealth("amber", assessment).level, "green");
  assert.equal(resolveEffectiveHealth("amber", assessment).source, "assessment");
  const stale = resolveEffectiveHealth("red", assessment);
  assert.equal(stale.level, "red");
  assert.equal(stale.needsReassessment, true);
  assert.equal(resolveEffectiveHealth(null, assessment).source, "not_applicable");
  assert.equal(resolveEffectiveHealth("green", null).source, "computed");
});

// ---- "Việc của tôi" ---------------------------------------------------------------------------------

const today = day("2031-05-20");
const capability = (actions) => ({ allowedActions: actions });
const project = (overrides = {}) => ({
  id: "p1", title: "Đề tài A", status: "executing", startDate: "2031-01-01T00:00:00.000Z", officer: { officerUserId: "staff" },
  members: [{ id: "mem-pi", userId: "pi", participationRole: "TOPIC_PI", status: "ACTIVE" }, { id: "mem-1", userId: "member", participationRole: "TOPIC_MEMBER", status: "ACTIVE" }],
  milestones: [
    { id: "m1", title: "Khảo sát", dueDate: "2031-05-25T00:00:00.000Z", status: "open", responsibleMemberId: "mem-1" },
    { id: "m2", title: "Thử nghiệm", dueDate: "2031-11-30T00:00:00.000Z", status: "open", responsibleMemberId: "mem-1" }
  ],
  checkpoints: [{ id: "c1", title: "Báo cáo kỳ 1", dueDate: "2031-05-10T00:00:00.000Z", status: "open" }],
  reports: [], requests: [],
  progressSummary: { computedLevel: "green", levelSource: "computed", needsReassessment: false },
  viewerAuthorization: capability([]),
  ...overrides
});

test("PI sees an overdue report, near milestones, and supplement requests; far milestones are hidden", () => {
  const items = projectWorkItems(project({ viewerAuthorization: capability(["project.read", "project.report.draft", "project.progress.update"]), reports: [{ id: "r1", revision: 2, status: "supplement_requested", responseDeadline: "2031-05-30T00:00:00.000Z" }] }), { id: "pi" }, today);
  const kinds = items.map((item) => item.kind).sort();
  assert.deepEqual(kinds, ["milestone_progress", "report_due", "report_supplement"]);
  const due = items.find((item) => item.kind === "report_due");
  assert.equal(due.overdue, true);
  assert.equal(due.daysLeft, -10);
});

test("a supplement request disappears once the PI has created a newer revision", () => {
  const items = projectWorkItems(project({ viewerAuthorization: capability(["project.report.draft"]), reports: [
    { id: "r1", revision: 1, status: "supplement_requested", checkpointId: "c1", responseDeadline: "2031-05-01T00:00:00.000Z" },
    { id: "r2", revision: 2, status: "submitted", checkpointId: "c1" }
  ] }), { id: "pi" }, today);
  assert.equal(items.some((item) => item.kind === "report_supplement"), false);
});

test("a submitted report clears the report-due item", () => {
  const items = projectWorkItems(project({ viewerAuthorization: capability(["project.report.draft"]), reports: [{ id: "r1", revision: 1, status: "submitted", checkpointId: "c1" }] }), { id: "pi" }, today);
  assert.equal(items.some((item) => item.kind === "report_due"), false);
});

test("a member only gets milestones they are responsible for, and nothing without the capability", () => {
  const member = projectWorkItems(project({ viewerAuthorization: capability(["project.read", "project.progress.update", "project.evidence.contribute"]) }), { id: "member" }, today);
  assert.deepEqual(member.map((item) => item.id), ["p1:milestone:m1"]);
  const blocked = projectWorkItems(project({ viewerAuthorization: capability(["project.read"]) }), { id: "member" }, today);
  assert.deepEqual(blocked, []);
});

test("officer gets review items and a health assessment when the project is red without an assessment", () => {
  const items = projectWorkItems(project({
    viewerAuthorization: capability(["project.read", "project.report.review", "project.adjustment.review", "project.extension.validate", "project.health.assess"]),
    reports: [{ id: "r1", revision: 3, status: "submitted" }],
    requests: [{ id: "q1", requestType: "adjustment", status: "submitted" }, { id: "q2", requestType: "extension", status: "under_staff_validation" }],
    progressSummary: { computedLevel: "red", levelSource: "computed", needsReassessment: false }
  }), { id: "staff", systemRole: "RESEARCH_MANAGEMENT_STAFF" }, today);
  assert.deepEqual(items.map((item) => item.kind).sort(), ["adjustment_review", "extension_validation", "health_assess", "report_review"]);
});

test("leadership gets extension decisions; officer assignment only for head and leadership", () => {
  const leader = projectWorkItems(project({ status: "preparing", officer: null, viewerAuthorization: capability(["project.read", "project.officer.assign", "project.extension.approve"]), requests: [{ id: "q", requestType: "extension", status: "ready_for_head_decision" }] }), { id: "leader", systemRole: "LEADERSHIP_APPROVAL_AUTHORITY" }, today);
  assert.deepEqual(leader.map((item) => item.kind).sort(), ["extension_decision", "officer_assign"]);
  const staff = projectWorkItems(project({ status: "preparing", officer: null, viewerAuthorization: capability(["project.read", "project.officer.assign"]) }), { id: "s", systemRole: "RESEARCH_MANAGEMENT_STAFF" }, today);
  assert.deepEqual(staff, []);
});

test("review assignments: pending only, sorted overdue first, summary counts", () => {
  const reviews = reviewWorkItems([
    { id: "a1", status: "assigned", proposal: { id: "x", title: "Hồ sơ X" }, dueDate: "2031-05-22T00:00:00.000Z" },
    { id: "a2", status: "assigned", proposal: { id: "y", title: "Hồ sơ Y" }, dueDate: "2031-05-18T00:00:00.000Z" },
    { id: "a3", status: "assigned", proposal: { id: "z", title: "Hồ sơ Z" }, review: { status: "submitted" } },
    { id: "a4", status: "revoked", proposal: { id: "w", title: "Hồ sơ W" } }
  ], today);
  const sorted = sortWorkItems([...reviews, { id: "n", kind: "report_review", title: "Không hạn", context: { type: "project", id: "p", title: "P" }, href: "/", dueDate: null, overdue: false, daysLeft: null }]);
  assert.deepEqual(sorted.map((item) => item.id), ["review:a2", "review:a1", "n"]);
  assert.deepEqual(summarizeWorkItems(sorted), { total: 3, overdue: 1, dueWithin7Days: 1 });
});
