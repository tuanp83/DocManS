import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ApprovedProjectsService } from "../approved-projects/approved-projects.service.js";
import { isRelationshipActiveAt } from "../proposals-shared/proposal-participation.js";
import { isResearchOversightAuthority } from "../proposals-shared/proposal-access.js";
import { canReadProposalDeliverables } from "../research-proposals/proposal-deliverables.service.js";
import { HEALTH_APPLICABLE_STATUSES, localDayIndex } from "../approved-projects/project-progress.js";
import { approvedBudget, CLOSED_STATUSES, DashboardService, PENDING_STATUSES, type DashboardProposalRecord } from "./dashboard.service.js";
import { snapshotDateOf } from "./project-health-snapshot.service.js";
import {
  COMMON_FILTERS,
  DRILL_DOWN_FILTERS,
  DRILL_DOWN_METRICS,
  NO_OFFICER,
  parseDashboardQuery,
  PRODUCT_FORMS,
  PRODUCT_STATUSES,
  type DashboardFilters,
  type DrillDownMetric
} from "./dashboard-query.js";

type AnyRecord = Record<string, any>;

const DAY = 86_400_000;
const VN_OFFSET = 7 * 60 * 60 * 1000;
const DEFAULT_TREND_DAYS = 182;
const MAX_TREND_DAYS = 3 * 366;
const HEALTH_KEYS = ["green", "amber", "red", "none"] as const;
const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, none: 3 };

/** Đề tài ở dạng gọn cho thống kê: chỉ các trường người xem đã được phép thấy qua danh sách đề tài. */
export type DashboardProject = {
  id: string;
  code: string | null;
  title: string;
  status: string;
  unitId: string;
  unitName: string;
  level: string | null;
  field: string | null;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
  overdue: boolean;
  health: "green" | "amber" | "red" | "none";
  spi: number | null;
  plannedPercent: number;
  actualPercent: number;
  maxDaysOverdue: number;
  lateReports: number;
  piName: string | null;
  proposalId: string | null;
  /** Tính chất (Quân sự / Dân sự) lấy từ hồ sơ gốc. */
  militaryScope: string | null;
  officer: { id: string; name: string | null } | null;
  finance: { totalBudget: number; totalDisbursed: number; totalSettled: number } | null;
  products: Array<{ id: string; position: number; title: string; productForm: number; status: string }>;
};

const vnYear = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : new Date(date.getTime() + VN_OFFSET).getUTCFullYear();
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const isoDay = (index: number) => new Date(index * DAY).toISOString().slice(0, 10);
const dayIndexOf = (iso: string) => Math.floor(new Date(`${iso}T00:00:00.000Z`).getTime() / DAY);
const toNumber = (value: unknown) => (typeof value === "bigint" ? Number(value) : typeof value === "number" && Number.isFinite(value) ? value : 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Chuyển bản trả về của danh sách đề tài (đã qua capability project.read và che trường) sang dạng thống kê. */
export function toDashboardProject(response: AnyRecord, now = new Date()): DashboardProject {
  const scope = (response.scope ?? {}) as AnyRecord;
  const pi = (response.members ?? []).find((member: AnyRecord) => member.participationRole === "TOPIC_PI" && isRelationshipActiveAt({ ...member, effectiveFrom: member.effectiveFrom ? new Date(member.effectiveFrom) : member.effectiveFrom, effectiveUntil: member.effectiveUntil ? new Date(member.effectiveUntil) : null }, now));
  const summary = (response.progressSummary ?? {}) as AnyRecord;
  // Mốc / kỳ báo cáo không được đóng khi nghiệm thu: số ngày trễ chỉ có nghĩa với đề tài còn thực hiện, tạm dừng.
  const tracked = HEALTH_APPLICABLE_STATUSES.includes(response.status);
  return {
    id: response.id,
    code: response.code ?? null,
    title: response.title,
    status: response.status,
    unitId: response.hostOrganizationUnitId,
    unitName: response.hostOrganizationUnit?.name ?? response.hostOrganizationUnitId,
    level: text(response.level ?? scope.proposalTypeCode),
    field: text(scope.researchFieldCode),
    year: vnYear(response.startDate),
    startDate: response.startDate ?? null,
    endDate: response.endDate ?? null,
    overdue: response.overdue === true,
    health: summary.level === "green" || summary.level === "amber" || summary.level === "red" ? summary.level : "none",
    spi: typeof summary.spi === "number" ? summary.spi : null,
    plannedPercent: toNumber(summary.plannedPercent),
    actualPercent: toNumber(summary.actualPercent),
    maxDaysOverdue: tracked ? toNumber(summary.maxDaysOverdue) : 0,
    lateReports: tracked ? toNumber(summary.lateReports) : 0,
    piName: pi ? (pi.user?.displayName ?? pi.name ?? null) : null,
    proposalId: response.proposalId ?? null,
    militaryScope: text(scope.militaryScope),
    officer: response.officer?.officerUserId ? { id: response.officer.officerUserId, name: response.officer.officerName ?? null } : null,
    finance: response.finance ? { totalBudget: toNumber(response.finance.totalBudget), totalDisbursed: toNumber(response.finance.totalDisbursed), totalSettled: toNumber(response.finance.totalSettled) } : null,
    products: (response.products ?? []).map((product: AnyRecord) => ({ id: product.id, position: product.position, title: product.title, productForm: product.productForm, status: product.status }))
  };
}

function matchesProject(project: DashboardProject, filters: DashboardFilters) {
  if (filters.unitId !== undefined && project.unitId !== filters.unitId) return false;
  if (filters.level !== undefined && project.level !== filters.level) return false;
  if (filters.field !== undefined && project.field !== filters.field) return false;
  if (filters.year !== undefined && project.year !== filters.year) return false;
  if (filters.status !== undefined && project.status !== filters.status) return false;
  if (filters.health !== undefined && project.health !== filters.health) return false;
  if (filters.overdue !== undefined && project.overdue !== filters.overdue) return false;
  if (filters.scope !== undefined && (project.militaryScope ?? "none") !== filters.scope) return false;
  if (filters.officerId !== undefined && (project.officer?.id ?? NO_OFFICER) !== filters.officerId) return false;
  return true;
}

function proposalYear(proposal: DashboardProposalRecord) {
  return vnYear(proposal.submittedAt ?? proposal.createdAt);
}

function proposalOverdue(proposal: DashboardProposalRecord, now: Date) {
  return !!proposal.endDate && proposal.endDate < now && !CLOSED_STATUSES.includes(proposal.status);
}

function matchesProposal(proposal: DashboardProposalRecord, filters: DashboardFilters, now: Date) {
  if (filters.unitId !== undefined && proposal.hostOrganizationUnitId !== filters.unitId) return false;
  if (filters.level !== undefined && (proposal.proposalTypeCode ?? null) !== filters.level) return false;
  if (filters.field !== undefined && (proposal.researchFieldCode ?? null) !== filters.field) return false;
  if (filters.year !== undefined && proposalYear(proposal) !== filters.year) return false;
  if (filters.status !== undefined && proposal.status !== filters.status) return false;
  if (filters.overdue !== undefined && proposalOverdue(proposal, now) !== filters.overdue) return false;
  if (filters.scope !== undefined && (proposal.militaryScope ?? "none") !== filters.scope) return false;
  if (filters.officerId !== undefined && (proposal.officer?.id ?? NO_OFFICER) !== filters.officerId) return false;
  return true;
}

const SCOPE_LABELS: Record<string, string> = { military: "Quân sự", civilian: "Dân sự", none: "Chưa phân loại" };

/** Gom theo tính chất; khoá "none" = chưa phân loại (khớp bộ lọc scope=none). */
function byScope<T>(rows: T[], scopeOf: (row: T) => string | null | undefined, extra?: (bucket: AnyRecord, row: T) => void) {
  return countBy(rows, (row) => scopeOf(row) ?? "none", (row) => SCOPE_LABELS[scopeOf(row) ?? "none"] ?? String(scopeOf(row)), extra);
}

/** Gom theo chuyên viên phụ trách; khoá "none" = chưa có người phụ trách. */
function byOfficer<T>(rows: T[], officerOf: (row: T) => { id: string; name: string | null } | null | undefined, extra?: (bucket: AnyRecord, row: T) => void) {
  return countBy(rows, (row) => officerOf(row)?.id ?? NO_OFFICER, (row) => (officerOf(row) ? (officerOf(row)!.name ?? officerOf(row)!.id) : "Chưa có người phụ trách"), extra);
}

/** Đề tài chậm tiến độ: sức khoẻ Vàng/Đỏ (SPI thấp, mốc hoặc báo cáo trễ). */
const isBehind = (project: DashboardProject) => project.health === "amber" || project.health === "red";

type DeliverableRow = { id: string; proposalId: string; type: string; title: string; status: string; publishedAt: Date | null; proposal: DashboardProposalRecord };

type Bucket = { key: string; label: string; count: number };

function countBy<T>(rows: T[], keyOf: (row: T) => string | null, labelOf: (row: T) => string = (row) => keyOf(row) ?? "", extra?: (bucket: AnyRecord, row: T) => void) {
  const buckets = new Map<string, AnyRecord>();
  for (const row of rows) {
    const key = keyOf(row) ?? "";
    const bucket = buckets.get(key) ?? { key, label: key ? labelOf(row) : "Chưa phân loại", count: 0 };
    bucket.count += 1;
    extra?.(bucket, row);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key))) as Array<Bucket & AnyRecord>;
}

function paginate<T>(rows: T[], page = 1, pageSize = 50) {
  const start = (page - 1) * pageSize;
  return { total: rows.length, page, pageSize, items: rows.slice(start, start + pageSize) };
}

/**
 * Thống kê nâng cao & drill-down (docs/design/dashboard-thong-ke-dot-1.md).
 *
 * Nguyên tắc phân quyền: mọi con số và mọi dòng chi tiết đều dựng từ đúng tập dữ liệu người xem đã đọc được
 * ở màn hình danh sách — hồ sơ qua DashboardService.findReadableProposals (canReadProposal), đề tài qua
 * ApprovedProjectsService.listProjects (capability project.read, kinh phí chỉ khi có project.finance.read).
 * Bộ lọc chỉ thu hẹp tập đó, không bao giờ mở rộng. Người dùng không xác định: 403.
 */
@Injectable()
export class DashboardAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly projects: ApprovedProjectsService
  ) {}

  private assertActor(actor: SafeUserContext | undefined): asserts actor is SafeUserContext {
    if (!actor?.id) throw new ForbiddenException({ message: "Không có quyền xem số liệu tổng hợp." });
  }

  async readableProjects(actor: SafeUserContext | undefined, now = new Date()): Promise<DashboardProject[]> {
    this.assertActor(actor);
    // Đề tài có phân công chuyên viên mâu thuẫn (409) bị bỏ qua thay vì làm hỏng toàn bộ dashboard.
    const responses = await this.projects.listProjects(actor, { skipUnresolved: true });
    const projects = await this.withMilitaryScope(responses.map((response: AnyRecord) => toDashboardProject(response, now)));
    if (!isResearchOversightAuthority(actor) || !projects.length) return projects;
    // Các Phó Giám đốc chỉ theo dõi không đọc kinh phí từng đề tài (project.finance.read), nhưng được xem báo cáo
    // kinh phí tổng hợp: nạp kinh phí để cộng vào số tổng, còn các dòng chi tiết để trống (drillDown).
    const finances = (await (this.prisma as any).approvedProject.findMany({ where: { id: { in: projects.map((project) => project.id) } }, select: { id: true, finance: true } })) as Array<{ id: string; finance: AnyRecord | null }>;
    const byId = new Map(finances.map((row) => [row.id, row.finance]));
    return projects.map((project) => {
      const finance = byId.get(project.id);
      return finance ? { ...project, finance: { totalBudget: Number(finance.totalBudget) || 0, totalDisbursed: Number(finance.totalDisbursed) || 0, totalSettled: Number(finance.totalSettled) || 0 } } : project;
    });
  }

  /** Tính chất đề tài không nằm trong ảnh chụp phạm vi: đọc từ hồ sơ gốc (một truy vấn). */
  private async withMilitaryScope(projects: DashboardProject[]) {
    const missing = projects.filter((project) => !project.militaryScope && project.proposalId);
    const client = (this.prisma as any).researchProposal;
    if (!missing.length || !client?.findMany) return projects;
    const rows = (await client.findMany({ where: { id: { in: missing.map((project) => project.proposalId) } }, select: { id: true, militaryScope: true } })) as Array<{ id: string; militaryScope: string | null }>;
    const byId = new Map(rows.map((row) => [row.id, row.militaryScope ?? null]));
    return projects.map((project) => (project.militaryScope || !project.proposalId ? project : { ...project, militaryScope: byId.get(project.proposalId) ?? null }));
  }

  async readableProposals(actor: SafeUserContext | undefined, now = new Date()) {
    this.assertActor(actor);
    return this.dashboard.findReadableProposals(actor, now);
  }

  // ---- Phân bố -----------------------------------------------------------------------------------------

  async distribution(actor: SafeUserContext | undefined, rawQuery: unknown) {
    this.assertActor(actor);
    const query = parseDashboardQuery(rawQuery, ["subject", ...COMMON_FILTERS, "status", "officerId"]);
    if (!query.subject) throw new BadRequestException({ code: "DASHBOARD_QUERY_INVALID", field: "subject", message: "Cần chọn subject=projects hoặc subject=proposals." });
    const now = new Date();
    if (query.subject === "projects") {
      const rows = (await this.readableProjects(actor, now)).filter((project) => matchesProject(project, query));
      const money = (bucket: AnyRecord, project: DashboardProject) => {
        bucket.totalBudget = (bucket.totalBudget ?? 0) + (project.finance?.totalBudget ?? 0);
        bucket.totalDisbursed = (bucket.totalDisbursed ?? 0) + (project.finance?.totalDisbursed ?? 0);
      };
      const finance = rows.filter((project) => project.finance);
      return {
        subject: "projects",
        filters: query,
        totals: {
          count: rows.length,
          financeVisibleCount: finance.length,
          totalBudget: finance.reduce((sum, project) => sum + project.finance!.totalBudget, 0),
          totalDisbursed: finance.reduce((sum, project) => sum + project.finance!.totalDisbursed, 0),
          totalSettled: finance.reduce((sum, project) => sum + project.finance!.totalSettled, 0),
          overdue: rows.filter((project) => project.overdue).length,
          behind: rows.filter(isBehind).length
        },
        byUnit: countBy(rows, (project) => project.unitId, (project) => project.unitName, money),
        byLevel: countBy(rows, (project) => project.level, undefined, money),
        byField: countBy(rows, (project) => project.field, undefined, money),
        byStatus: countBy(rows, (project) => project.status),
        byScope: byScope(rows, (project) => project.militaryScope, money),
        // Theo chuyên viên phụ trách: số đề tài, số quá hạn, số chậm tiến độ (Vàng/Đỏ), số báo cáo trễ.
        byOfficer: byOfficer(rows, (project) => project.officer, (bucket, project) => {
          bucket.overdue = (bucket.overdue ?? 0) + (project.overdue ? 1 : 0);
          bucket.behind = (bucket.behind ?? 0) + (isBehind(project) ? 1 : 0);
          bucket.lateReports = (bucket.lateReports ?? 0) + project.lateReports;
        }),
        byYear: countBy(rows, (project) => (project.year === null ? null : String(project.year))).sort((left, right) => left.key.localeCompare(right.key)),
        byHealth: HEALTH_KEYS.map((key) => ({ key, label: key, count: rows.filter((project) => project.health === key).length })),
        // Bản đồ nhiệt đơn vị × sức khoẻ.
        byUnitHealth: countBy(rows, (project) => project.unitId, (project) => project.unitName, (bucket, project) => {
          for (const key of HEALTH_KEYS) bucket[key] = bucket[key] ?? 0;
          bucket[project.health] += 1;
        })
      };
    }
    const rows = (await this.readableProposals(actor, now)).filter((proposal) => matchesProposal(proposal, query, now));
    const approvedMoney = (bucket: AnyRecord, proposal: DashboardProposalRecord) => {
      bucket.approvedBudget = (bucket.approvedBudget ?? 0) + (proposal.status === "approved" ? approvedBudget(proposal) : 0);
    };
    return {
      subject: "proposals",
      filters: query,
      totals: {
        count: rows.length,
        pending: rows.filter((proposal) => PENDING_STATUSES.includes(proposal.status)).length,
        approved: rows.filter((proposal) => proposal.status === "approved").length,
        overdue: rows.filter((proposal) => proposalOverdue(proposal, now)).length,
        approvedBudget: rows.reduce((sum, proposal) => sum + (proposal.status === "approved" ? approvedBudget(proposal) : 0), 0)
      },
      byUnit: countBy(rows, (proposal) => proposal.hostOrganizationUnitId, (proposal) => proposal.hostOrganizationUnit?.name ?? proposal.hostOrganizationUnitId, approvedMoney),
      byLevel: countBy(rows, (proposal) => proposal.proposalTypeCode ?? null, undefined, approvedMoney),
      byField: countBy(rows, (proposal) => proposal.researchFieldCode ?? null, undefined, approvedMoney),
      byStatus: countBy(rows, (proposal) => proposal.status),
      byScope: byScope(rows, (proposal) => proposal.militaryScope, approvedMoney),
      byOfficer: byOfficer(rows, (proposal) => proposal.officer, (bucket, proposal) => {
        bucket.pending = (bucket.pending ?? 0) + (PENDING_STATUSES.includes(proposal.status) ? 1 : 0);
        bucket.overdue = (bucket.overdue ?? 0) + (proposalOverdue(proposal, now) ? 1 : 0);
      }),
      byYear: countBy(rows, (proposal) => String(proposalYear(proposal) ?? "")).sort((left, right) => left.key.localeCompare(right.key))
    };
  }

  // ---- Sản phẩm -----------------------------------------------------------------------------------------

  private async readableDeliverables(actor: SafeUserContext, filters: DashboardFilters, now: Date): Promise<DeliverableRow[]> {
    // Giao của hai quyền: đọc được hồ sơ (canReadProposal) VÀ đọc được sản phẩm đầu ra của hồ sơ đó.
    const proposals = (await this.readableProposals(actor, now)).filter((proposal) => canReadProposalDeliverables(actor, proposal) && matchesProposal(proposal, { unitId: filters.unitId, level: filters.level, field: filters.field, year: filters.year, scope: filters.scope }, now));
    if (!proposals.length) return [];
    const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
    const rows = await (this.prisma as any).proposalDeliverable.findMany({
      where: { proposalId: { in: [...byId.keys()] } },
      select: { id: true, proposalId: true, type: true, title: true, status: true, publishedAt: true }
    });
    return (rows as AnyRecord[]).filter((row) => byId.has(row.proposalId)).map((row) => ({ id: row.id, proposalId: row.proposalId, type: String(row.type), title: row.title, status: String(row.status), publishedAt: row.publishedAt ?? null, proposal: byId.get(row.proposalId)! }));
  }

  async products(actor: SafeUserContext | undefined, rawQuery: unknown) {
    this.assertActor(actor);
    const query = parseDashboardQuery(rawQuery, COMMON_FILTERS);
    const now = new Date();
    const projects = (await this.readableProjects(actor, now)).filter((project) => matchesProject(project, query));
    const products = projects.flatMap((project) => project.products);
    const statusCounts = (rows: Array<{ status: string }>) => Object.fromEntries(PRODUCT_STATUSES.map((status) => [status, rows.filter((row) => row.status === status).length]));
    const deliverables = await this.readableDeliverables(actor, query, now);
    const types = [...new Set(deliverables.map((row) => String(row.type)))].sort();
    const deliverableStatuses = [...new Set(deliverables.map((row) => String(row.status)))].sort();
    return {
      filters: query,
      projectProducts: {
        total: products.length,
        byStatus: statusCounts(products),
        byForm: PRODUCT_FORMS.map((form) => {
          const rows = products.filter((product) => product.productForm === form);
          return { form, total: rows.length, byStatus: statusCounts(rows) };
        })
      },
      proposalDeliverables: {
        total: deliverables.length,
        byType: types.map((type) => {
          const rows = deliverables.filter((row) => String(row.type) === type);
          return { type, total: rows.length, byStatus: Object.fromEntries(deliverableStatuses.map((status) => [status, rows.filter((row) => String(row.status) === status).length])) };
        })
      }
    };
  }

  // ---- Xu hướng -----------------------------------------------------------------------------------------

  async trends(actor: SafeUserContext | undefined, rawQuery: unknown) {
    this.assertActor(actor);
    const query = parseDashboardQuery(rawQuery, ["from", "to", "unitId", "level", "field", "scope"]);
    const now = new Date();
    const today = localDayIndex(now);
    const toIndex = query.to ? dayIndexOf(query.to) : today;
    const fromIndex = query.from ? dayIndexOf(query.from) : toIndex - DEFAULT_TREND_DAYS;
    if (fromIndex > toIndex) throw new BadRequestException({ code: "DASHBOARD_QUERY_INVALID", field: "from", message: "Ngày bắt đầu phải trước ngày kết thúc." });
    if (toIndex - fromIndex > MAX_TREND_DAYS) throw new BadRequestException({ code: "DASHBOARD_QUERY_INVALID", field: "from", message: "Khoảng thời gian tối đa 3 năm." });

    // Tập đề tài người xem đọc được HÔM NAY quyết định ảnh chụp nào được tính (không dựa vào đơn vị trong ảnh chụp).
    const projects = await this.readableProjects(actor, now);
    const readable = new Map(projects.map((project) => [project.id, project]));
    const financeVisible = new Set(projects.filter((project) => project.finance).map((project) => project.id));
    const snapshots: AnyRecord[] = readable.size
      ? await (this.prisma as any).projectHealthSnapshot.findMany({
          where: { projectId: { in: [...readable.keys()] }, snapshotDate: { gte: new Date(fromIndex * DAY), lte: new Date(toIndex * DAY) } },
          orderBy: { snapshotDate: "asc" }
        })
      : [];

    type Point = { date: string; live: boolean; rows: Array<{ projectId: string; status: string; health: string; spi: number | null; plannedPercent: number; actualPercent: number; maxDaysOverdue: number; lateReports: number; totalBudget: number | null; totalDisbursed: number | null }> };
    const points = new Map<string, Point>();
    for (const row of snapshots) {
      if (!readable.has(row.projectId)) continue;
      if (query.unitId !== undefined && row.hostOrganizationUnitId !== query.unitId) continue;
      if (query.level !== undefined && row.level !== query.level) continue;
      if (query.field !== undefined && row.researchFieldCode !== query.field) continue;
      // Tính chất không có trong ảnh chụp: lấy theo hồ sơ gốc của đề tài.
      if (query.scope !== undefined && (readable.get(row.projectId)!.militaryScope ?? "none") !== query.scope) continue;
      const date = (row.snapshotDate instanceof Date ? row.snapshotDate : new Date(row.snapshotDate)).toISOString().slice(0, 10);
      const point = points.get(date) ?? { date, live: false, rows: [] };
      const finance = financeVisible.has(row.projectId);
      point.rows.push({ projectId: row.projectId, status: row.status, health: row.healthLevel ?? "none", spi: row.spi ?? null, plannedPercent: toNumber(row.plannedPercent), actualPercent: toNumber(row.actualPercent), maxDaysOverdue: toNumber(row.maxDaysOverdue), lateReports: toNumber(row.lateReports), totalBudget: finance && row.totalBudget !== null && row.totalBudget !== undefined ? toNumber(row.totalBudget) : null, totalDisbursed: finance && row.totalDisbursed !== null && row.totalDisbursed !== undefined ? toNumber(row.totalDisbursed) : null });
      points.set(date, point);
    }

    // Điểm "hiện tại" tính trực tiếp, để biểu đồ có số liệu ngay cả trước lần chụp đầu tiên.
    const todayIso = snapshotDateOf(now).toISOString().slice(0, 10);
    if (fromIndex <= today && today <= toIndex && !points.has(todayIso)) {
      const live = projects.filter((project) => matchesProject(project, { unitId: query.unitId, level: query.level, field: query.field, scope: query.scope }));
      points.set(todayIso, { date: todayIso, live: true, rows: live.map((project) => ({ projectId: project.id, status: project.status, health: project.health, spi: project.spi, plannedPercent: project.plannedPercent, actualPercent: project.actualPercent, maxDaysOverdue: project.maxDaysOverdue, lateReports: project.lateReports, totalBudget: project.finance?.totalBudget ?? null, totalDisbursed: project.finance?.totalDisbursed ?? null })) });
    }

    const series = [...points.values()].sort((left, right) => left.date.localeCompare(right.date)).map((point) => {
      const tracked = point.rows.filter((row) => row.health !== "none");
      const spis = tracked.map((row) => row.spi).filter((value): value is number => typeof value === "number");
      const health = Object.fromEntries(HEALTH_KEYS.map((key) => [key, point.rows.filter((row) => row.health === key).length]));
      const status: Record<string, number> = {};
      for (const row of point.rows) status[row.status] = (status[row.status] ?? 0) + 1;
      const average = (values: number[]) => (values.length ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
      return {
        date: point.date,
        live: point.live,
        total: point.rows.length,
        health,
        status,
        averageSpi: average(spis),
        averagePlannedPercent: average(tracked.map((row) => row.plannedPercent)),
        averageActualPercent: average(tracked.map((row) => row.actualPercent)),
        projectsWithOverdueMilestones: point.rows.filter((row) => row.maxDaysOverdue > 0).length,
        lateReports: point.rows.reduce((sum, row) => sum + row.lateReports, 0),
        totalBudget: point.rows.reduce((sum, row) => sum + (row.totalBudget ?? 0), 0),
        totalDisbursed: point.rows.reduce((sum, row) => sum + (row.totalDisbursed ?? 0), 0)
      };
    });
    return { from: isoDay(fromIndex), to: isoDay(toIndex), filters: { unitId: query.unitId, level: query.level, field: query.field, scope: query.scope }, series };
  }

  // ---- Danh sách chi tiết --------------------------------------------------------------------------------

  async drillDown(actor: SafeUserContext | undefined, rawQuery: unknown) {
    this.assertActor(actor);
    const raw = (rawQuery && typeof rawQuery === "object" ? rawQuery : {}) as Record<string, unknown>;
    const metric = raw.metric as DrillDownMetric;
    if (typeof metric !== "string" || !DRILL_DOWN_METRICS.includes(metric)) throw new BadRequestException({ code: "DASHBOARD_QUERY_INVALID", field: "metric", message: `metric phải là một trong: ${DRILL_DOWN_METRICS.join(", ")}.` });
    const query = parseDashboardQuery(rawQuery, ["metric", "page", "pageSize", ...DRILL_DOWN_FILTERS[metric]]);
    const filters: DashboardFilters = Object.fromEntries(DRILL_DOWN_FILTERS[metric].filter((key) => (query as AnyRecord)[key] !== undefined).map((key) => [key, (query as AnyRecord)[key]]));
    const now = new Date();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    if (metric === "projects") {
      const hideFinanceRows = isResearchOversightAuthority(actor);
      const rows = (await this.readableProjects(actor, now))
        .filter((project) => matchesProject(project, filters))
        .sort((left, right) => right.maxDaysOverdue - left.maxDaysOverdue || HEALTH_RANK[left.health] - HEALTH_RANK[right.health] || String(left.code ?? left.id).localeCompare(String(right.code ?? right.id)))
        .map((project) => ({
          id: project.id, code: project.code, title: project.title, unit: { id: project.unitId, name: project.unitName }, piName: project.piName,
          status: project.status, level: project.level, field: project.field, health: project.health, spi: project.spi,
          plannedPercent: project.plannedPercent, actualPercent: project.actualPercent, daysOverdue: project.maxDaysOverdue, lateReports: project.lateReports,
          overdue: project.overdue, startDate: project.startDate, endDate: project.endDate, militaryScope: project.militaryScope, officerName: project.officer?.name ?? null,
          totalBudget: hideFinanceRows ? null : project.finance?.totalBudget ?? null, totalDisbursed: hideFinanceRows ? null : project.finance?.totalDisbursed ?? null,
          link: `/projects/${encodeURIComponent(project.id)}`
        }));
      return { metric, filters, ...paginate(rows, page, pageSize) };
    }

    if (metric === "proposals") {
      const rows = (await this.readableProposals(actor, now))
        .filter((proposal) => matchesProposal(proposal, filters, now))
        .sort((left, right) => (right.submittedAt?.getTime?.() ?? 0) - (left.submittedAt?.getTime?.() ?? 0) || left.id.localeCompare(right.id))
        .map((proposal) => ({
          id: proposal.id, code: proposal.code ?? null, title: proposal.title, unit: { id: proposal.hostOrganizationUnitId, name: proposal.hostOrganizationUnit?.name ?? proposal.hostOrganizationUnitId },
          ownerName: proposal.owner?.displayName ?? proposal.owner?.username ?? null, status: proposal.status, level: proposal.proposalTypeCode ?? null, field: proposal.researchFieldCode ?? null,
          submittedAt: proposal.submittedAt?.toISOString?.() ?? null, endDate: proposal.endDate?.toISOString?.() ?? null, overdue: proposalOverdue(proposal, now),
          militaryScope: proposal.militaryScope ?? null, officerName: proposal.officer?.name ?? null,
          link: `/proposals/${encodeURIComponent(proposal.id)}`
        }));
      return { metric, filters, ...paginate(rows, page, pageSize) };
    }

    if (metric === "products") {
      const rows = (await this.readableProjects(actor, now))
        .filter((project) => matchesProject(project, { unitId: filters.unitId, level: filters.level, field: filters.field, year: filters.year, scope: filters.scope }))
        .flatMap((project) => project.products.map((product) => ({ project, product })))
        .filter(({ product }) => (filters.form === undefined || product.productForm === filters.form) && (filters.productStatus === undefined || product.status === filters.productStatus))
        .sort((left, right) => String(left.project.code ?? left.project.id).localeCompare(String(right.project.code ?? right.project.id)) || left.product.position - right.product.position)
        .map(({ project, product }) => ({
          id: product.id, title: product.title, productForm: product.productForm, status: product.status, position: product.position,
          project: { id: project.id, code: project.code, title: project.title }, unit: { id: project.unitId, name: project.unitName },
          link: `/projects/${encodeURIComponent(project.id)}`
        }));
      return { metric, filters, ...paginate(rows, page, pageSize) };
    }

    const rows = (await this.readableDeliverables(actor, filters, now))
      .filter((row) => (filters.type === undefined || row.type === filters.type) && (filters.deliverableStatus === undefined || row.status === filters.deliverableStatus))
      .sort((left, right) => String(left.proposal.code ?? left.proposalId).localeCompare(String(right.proposal.code ?? right.proposalId)) || String(left.id).localeCompare(String(right.id)))
      .map((row) => ({
        id: row.id, type: row.type, title: row.title, status: row.status, publishedAt: row.publishedAt?.toISOString?.() ?? null,
        proposal: { id: row.proposalId, code: row.proposal.code ?? null, title: row.proposal.title }, unit: { id: row.proposal.hostOrganizationUnitId, name: row.proposal.hostOrganizationUnit?.name ?? row.proposal.hostOrganizationUnitId },
        link: `/proposals/${encodeURIComponent(row.proposalId)}`
      }));
    return { metric, filters, ...paginate(rows, page, pageSize) };
  }
}
