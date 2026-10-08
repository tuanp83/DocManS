import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { DashboardExportService } from "../dist/apps/api/dashboard/dashboard-export.service.js";
import { DashboardService } from "../dist/apps/api/dashboard/dashboard.service.js";
import { ProposalReviewAccessService } from "../dist/apps/api/proposals-shared/proposal-review-access.service.js";
import { ProposalParticipationService } from "../dist/apps/api/research-proposals/proposal-participation.service.js";

const past = new Date("2024-01-01T00:00:00.000Z");
const unitA = { id: "unit-a", name: "Đơn vị A" };
const unitB = { id: "unit-b", name: "Đơn vị B" };

function proposal(id, unit, ownerId, status, extra = {}) {
  return {
    id,
    ownerId,
    createdAt: past,
    hostOrganizationUnitId: unit.id,
    hostOrganizationUnit: unit,
    status,
    title: `Đề tài ${id}`,
    endDate: null,
    submittedAt: status === "draft" ? null : past,
    budgetMetadata: null,
    owner: { displayName: `Chủ nhiệm ${ownerId}`, username: ownerId },
    ...extra
  };
}

function createPrisma() {
  const proposals = [
    proposal("p1", unitA, "r1", "approved", { budgetMetadata: { amount: 100 } }),
    proposal("p2", unitA, "r2", "submitted"),
    proposal("p3", unitA, "r1", "draft"),
    proposal("p4", unitB, "r3", "approved", { budgetMetadata: { amount: 999 } }),
    proposal("p5", unitB, "r3", "submitted")
  ];
  const members = [
    { proposalId: "p1", userId: "r2", participationRole: "TOPIC_MEMBER", createdAt: past, status: "ACTIVE", effectiveFrom: past, effectiveUntil: null }
  ];
  const assignments = [
    { id: "a1", proposalId: "p2", reviewerUserId: "reviewer", status: "assigned", assignmentRole: "reviewer", assignedAt: past, effectiveFrom: past, effectiveUntil: null }
  ];
  const auditLogs = [];
  const inScope = (rows, where) => rows.filter((row) => where.proposalId.in.includes(row.proposalId));
  return {
    auditLogs,
    researchProposal: { findMany: async () => proposals.map((row) => ({ ...row })) },
    proposalMember: { findMany: async ({ where }) => inScope(members, where).filter((row) => !where.userId || row.userId === where.userId) },
    proposalReviewAssignment: { findMany: async ({ where }) => inScope(assignments, where).filter((row) => row.reviewerUserId === where.reviewerUserId) },
    auditLog: {
      create: async ({ data }) => {
        const row = { id: `audit-${auditLogs.length + 1}`, timestamp: new Date(), ...data };
        auditLogs.push(row);
        return row;
      }
    }
  };
}

function services() {
  const prisma = createPrisma();
  const dashboard = new DashboardService(prisma, new ProposalParticipationService(prisma), new ProposalReviewAccessService(prisma));
  const exporter = new DashboardExportService(dashboard, new AuditLogService(prisma));
  return { prisma, dashboard, exporter };
}

function actor(id, systemRole, scopes = [unitA]) {
  return { id, username: id, displayName: id, systemRole, organizationScopes: scopes.map((unit) => ({ id: unit.id, code: unit.id, name: unit.name })) };
}

const staffA = actor("staff-a", "SCIENTIFIC_MANAGEMENT_STAFF");
const leaderA = actor("leader-a", "LEADERSHIP_APPROVAL_AUTHORITY");
const ownerR1 = actor("r1", "RESEARCHER_INTERNAL_USER");
const memberR2 = actor("r2", "RESEARCHER_INTERNAL_USER");
const reviewer = actor("reviewer", "EXTERNAL_RESEARCHER_USER");
const outsiderB = actor("outsider", "EXTERNAL_RESEARCHER_USER", [unitB]);
const adminAB = actor("admin", "SYSTEM_ADMIN", [unitA, unitB]);
const staffNoScope = actor("staff-none", "SCIENTIFIC_MANAGEMENT_STAFF", []);

async function readableIds(dashboard, user) {
  return (await dashboard.findReadableProposals(user)).map((row) => row.id).sort();
}

async function exportedTitles(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Danh_sach_de_tai");
  const titles = [];
  sheet.eachRow((row, index) => { if (index > 1) titles.push(row.getCell(2).value); });
  return titles.sort();
}

describe("Dashboard and Excel export follow the proposal list visibility filter", () => {
  it("each actor sees exactly the proposals the list policy lets them read", async () => {
    const { dashboard } = services();
    assert.deepEqual(await readableIds(dashboard, staffA), ["p1", "p2", "p3"], "staff: own organization scope only");
    assert.deepEqual(await readableIds(dashboard, leaderA), ["p1", "p2"], "leadership: scoped, no drafts");
    assert.deepEqual(await readableIds(dashboard, ownerR1), ["p1", "p3"], "PI: own proposals");
    assert.deepEqual(await readableIds(dashboard, memberR2), ["p1", "p2"], "topic member: participating + own");
    assert.deepEqual(await readableIds(dashboard, reviewer), ["p2"], "reviewer: assigned only");
    assert.deepEqual(await readableIds(dashboard, outsiderB), [], "no relationship: nothing, even in scope");
    assert.deepEqual(await readableIds(dashboard, adminAB), [], "system role alone grants no record access");
    assert.deepEqual(await readableIds(dashboard, staffNoScope), [], "missing scope fails closed");
  });

  it("stats aggregate only readable proposals and never leak other units", async () => {
    const { dashboard } = services();
    const stats = await dashboard.getStats(staffA);
    assert.equal(stats.totalProposals, 3);
    assert.deepEqual(stats.proposalsByUnit, [{ unit: "Đơn vị A", count: 3 }]);
    assert.deepEqual(Object.fromEntries(stats.proposalsByStatus.map((row) => [row.status, row.count])), { approved: 1, submitted: 1, draft: 1 });
    assert.deepEqual(stats.kpis, { total: 3, pending: 1, approved: 1, overdue: 0, totalApprovedBudget: 100, submittedThisMonth: 0 });

    const outsider = await dashboard.getStats(outsiderB);
    assert.equal(outsider.totalProposals, 0);
    assert.deepEqual(outsider.proposalsByUnit, []);
    assert.equal(outsider.kpis.totalApprovedBudget, 0, "budget of unit B is not disclosed to an unrelated account");
  });

  it("missing session context is rejected", async () => {
    const { dashboard, exporter, prisma } = services();
    await assert.rejects(() => dashboard.getStats(undefined), ForbiddenException);
    await assert.rejects(() => exporter.exportProposalsToExcel(undefined), ForbiddenException);
    assert.equal(prisma.auditLogs.length, 0);
  });

  it("export contains only readable rows and is audited without row data", async () => {
    const { exporter, prisma } = services();
    const staffTitles = await exportedTitles(await exporter.exportProposalsToExcel(staffA));
    assert.deepEqual(staffTitles, ["Đề tài p1", "Đề tài p2", "Đề tài p3"]);

    const outsiderTitles = await exportedTitles(await exporter.exportProposalsToExcel(outsiderB));
    assert.deepEqual(outsiderTitles, []);

    assert.equal(prisma.auditLogs.length, 2);
    const [first, second] = prisma.auditLogs;
    assert.equal(first.action, "export-proposals");
    assert.equal(first.result, "success");
    assert.equal(first.actorId, "staff-a");
    assert.deepEqual(first.afterFacts, { format: "xlsx", rowCount: 3 });
    assert.equal(second.actorId, "outsider");
    assert.deepEqual(second.afterFacts, { format: "xlsx", rowCount: 0 });
  });
});
