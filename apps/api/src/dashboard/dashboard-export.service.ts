import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PROPOSAL_STATUS_LABELS } from "../proposals-shared/proposal-workflow.js";
import { approvedBudget, DashboardService } from "./dashboard.service.js";
import { DashboardAnalyticsService, matchesProposal } from "./dashboard-analytics.service.js";
import { COMMON_FILTERS, parseDashboardQuery } from "./dashboard-query.js";
import { isResearchOversightAuthority } from "../proposals-shared/proposal-access.js";
import { HEALTH_LEVEL_LABELS } from "../approved-projects/project-progress.js";

type Ref = { code?: string | null; title?: string; name?: string } | null | undefined;
type DrillRow = Record<string, unknown> & { unit?: Ref; project?: Ref; proposal?: Ref };
type DrillColumn = { header: string; width: number; value: (row: DrillRow) => unknown; money?: boolean };

/** Ô Excel: số giữ nguyên, chữ giữ nguyên, còn lại để trống. */
const toCell = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value : null);

const PROJECT_STATUS_LABELS: Record<string, string> = {
  preparing: "Chuẩn bị triển khai", executing: "Đang thực hiện", paused: "Tạm dừng", pending_acceptance: "Chờ nghiệm thu cơ sở",
  pending_superior_acceptance: "Chờ cấp trên nghiệm thu", accepted: "Đã nghiệm thu", failed: "Không đạt", closed: "Đã đóng"
};
const LEVEL_LABELS: Record<string, string> = {
  "national-level": "Cấp Quốc gia", "ministry-level": "Cấp Bộ Quốc phòng", "branch-level": "Cấp Ngành / Cục",
  "academy-level": "Cấp Học viện", "grassroots-level": "Cấp Cơ sở", "student-level": "Sinh viên / Học viên NCKH"
};
const HEALTH_LABELS: Record<string, string> = { ...HEALTH_LEVEL_LABELS, none: "Không đánh giá" };
const PRODUCT_STATUS_LABELS: Record<string, string> = { PLANNED: "Chưa nộp", SUBMITTED: "Đã nộp", UNDER_REVIEW: "Đang nghiệm thu", PASSED: "Đạt", FAILED: "Không đạt" };
const SCOPE_LABELS: Record<string, string> = { military: "Quân sự", civilian: "Dân sự" };

const day = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.valueOf()) ? null : date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
};
const label = (labels: Record<string, string>, value: unknown) => (value === null || value === undefined || value === "" ? null : labels[String(value)] ?? String(value));
const withCode = (code: unknown, title: unknown) => (code ? `${code} · ${title}` : String(title ?? ""));

/** Cột Excel của từng loại danh sách chi tiết: cùng nội dung với bảng trên Dashboard. */
const DRILL_COLUMNS: Record<string, { sheet: string; columns: DrillColumn[] }> = {
  projects: {
    sheet: "De_tai",
    columns: [
      { header: "Mã số", width: 16, value: (row) => row.code ?? null },
      { header: "Tên đề tài", width: 50, value: (row) => row.title },
      { header: "Cấp", width: 18, value: (row) => label(LEVEL_LABELS, row.level) },
      { header: "Đơn vị chủ trì", width: 26, value: (row) => row.unit?.name ?? null },
      { header: "Chủ nhiệm", width: 24, value: (row) => row.piName ?? null },
      { header: "Chuyên viên phụ trách", width: 22, value: (row) => row.officerName ?? null },
      { header: "Tính chất", width: 11, value: (row) => label(SCOPE_LABELS, row.militaryScope) },
      { header: "Trạng thái", width: 20, value: (row) => label(PROJECT_STATUS_LABELS, row.status) },
      { header: "Sức khoẻ", width: 15, value: (row) => label(HEALTH_LABELS, row.health) },
      { header: "Tiến độ kế hoạch (%)", width: 12, value: (row) => (row.health === "none" ? null : row.plannedPercent) },
      { header: "Tiến độ thực tế (%)", width: 12, value: (row) => (row.health === "none" ? null : row.actualPercent) },
      { header: "SPI", width: 8, value: (row) => (row.health === "none" || row.spi === null ? null : row.spi) },
      { header: "Số ngày trễ", width: 10, value: (row) => row.daysOverdue || null },
      { header: "Kỳ báo cáo trễ", width: 10, value: (row) => row.lateReports || null },
      { header: "Ngày bắt đầu", width: 12, value: (row) => day(row.startDate) },
      { header: "Ngày kết thúc", width: 12, value: (row) => day(row.endDate) },
      { header: "Quá hạn", width: 9, value: (row) => (row.overdue ? "Quá hạn" : null) },
      { header: "Kinh phí được duyệt (đồng)", width: 18, value: (row) => row.totalBudget ?? null, money: true },
      { header: "Đã cấp (đồng)", width: 18, value: (row) => row.totalDisbursed ?? null, money: true }
    ]
  },
  proposals: {
    sheet: "Ho_so",
    columns: [
      { header: "Mã số", width: 16, value: (row) => row.code ?? null },
      { header: "Tên hồ sơ", width: 50, value: (row) => row.title },
      { header: "Cấp", width: 18, value: (row) => label(LEVEL_LABELS, row.level) },
      { header: "Đơn vị chủ trì", width: 26, value: (row) => row.unit?.name ?? null },
      { header: "Chủ nhiệm", width: 24, value: (row) => row.ownerName ?? null },
      { header: "Chuyên viên phụ trách", width: 22, value: (row) => row.officerName ?? null },
      { header: "Tính chất", width: 11, value: (row) => label(SCOPE_LABELS, row.militaryScope) },
      { header: "Trạng thái", width: 22, value: (row) => label(PROPOSAL_STATUS_LABELS, row.status) },
      { header: "Ngày nộp", width: 12, value: (row) => day(row.submittedAt) },
      { header: "Hạn", width: 12, value: (row) => day(row.endDate) },
      { header: "Quá hạn", width: 9, value: (row) => (row.overdue ? "Quá hạn" : null) }
    ]
  },
  products: {
    sheet: "San_pham",
    columns: [
      { header: "Sản phẩm", width: 44, value: (row) => row.title },
      { header: "Đề tài", width: 50, value: (row) => withCode(row.project?.code, row.project?.title) },
      { header: "Đơn vị", width: 26, value: (row) => row.unit?.name ?? null },
      { header: "Dạng", width: 9, value: (row) => `Dạng ${row.productForm}` },
      { header: "Trạng thái", width: 16, value: (row) => label(PRODUCT_STATUS_LABELS, row.status) }
    ]
  },
  deliverables: {
    sheet: "San_pham_dau_ra",
    columns: [
      { header: "Sản phẩm đầu ra", width: 44, value: (row) => row.title },
      { header: "Loại", width: 18, value: (row) => row.type },
      { header: "Hồ sơ", width: 50, value: (row) => withCode(row.proposal?.code, row.proposal?.title) },
      { header: "Đơn vị", width: 26, value: (row) => row.unit?.name ?? null },
      { header: "Trạng thái", width: 16, value: (row) => row.status },
      { header: "Công bố", width: 12, value: (row) => day(row.publishedAt) }
    ]
  }
};


@Injectable()
export class DashboardExportService {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly auditLog: AuditLogService,
    private readonly analytics: DashboardAnalyticsService
  ) {}

  /**
   * Toàn bộ danh sách chi tiết đang mở trên Dashboard (mọi trang): cùng phân quyền, bộ lọc và thứ tự với
   * /dashboard/drill-down; kinh phí từng đề tài để trống khi người xem không được xem (như trên bảng).
   */
  async exportDrillDownToExcel(actor: SafeUserContext | undefined, rawQuery?: unknown) {
    const { metric, filters, rows } = await this.analytics.drillDownRows(actor, rawQuery);
    const layout = DRILL_COLUMNS[metric];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DocManS";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(layout.sheet, { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    sheet.columns = [{ header: "STT", key: "stt", width: 6 }, ...layout.columns.map((column, index) => ({ header: column.header, key: `c${index}`, width: column.width }))];
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    rows.forEach((row, index) => sheet.addRow([index + 1, ...layout.columns.map((column) => toCell(column.value(row as DrillRow)))]));
    layout.columns.forEach((column, index) => {
      const target = sheet.getColumn(index + 2);
      target.alignment = { vertical: "top", wrapText: true };
      if (column.money) target.numFmt = "#,##0";
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: layout.columns.length + 1 } };

    const buffer = await workbook.xlsx.writeBuffer();
    await this.auditLog.record({
      action: "export-drill-down",
      result: "success",
      actorId: actor!.id,
      username: actor!.username,
      targetEntity: "dashboard-drill-down-export",
      afterFacts: { format: "xlsx", metric, rowCount: rows.length, filters }
    });
    return { buffer: Buffer.from(buffer), fileName: `Chi_tiet_${layout.sheet}.xlsx` };
  }

  /** `rawQuery`: cùng bộ lọc đang chọn trên Dashboard (năm, đơn vị, cấp, lĩnh vực, tính chất). */
  async exportProposalsToExcel(actor: SafeUserContext | undefined, rawQuery?: unknown): Promise<Buffer> {
    const filters = parseDashboardQuery(rawQuery, COMMON_FILTERS);
    const now = new Date();
    // Same visibility filter as the proposal list and dashboard totals; fails closed without an actor.
    const proposals = (await this.dashboard.findReadableProposals(actor, now)).filter((proposal) => matchesProposal(proposal, filters, now));
    const hideBudget = isResearchOversightAuthority(actor);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DocManS";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Danh_sach_de_tai");

    sheet.columns = [
      { header: "STT", key: "stt", width: 5 },
      { header: "Tên đề tài", key: "title", width: 50 },
      { header: "Chủ nhiệm đề tài", key: "owner", width: 25 },
      { header: "Đơn vị chủ trì", key: "unit", width: 30 },
      { header: "Tính chất", key: "scope", width: 12 },
      { header: "Chuyên viên phụ trách", key: "officer", width: 25 },
      { header: "Kinh phí duyệt (VNĐ)", key: "budget", width: 20 },
      { header: "Trạng thái", key: "status", width: 20 },
      { header: "Ngày nộp", key: "submittedAt", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9D9D9" }
    };

    proposals.forEach((p, index) => {
      const budget = approvedBudget(p);

      sheet.addRow({
        stt: index + 1,
        title: p.title,
        owner: p.owner?.displayName || p.owner?.username || "—",
        unit: p.hostOrganizationUnit?.name || "—",
        scope: p.militaryScope === "military" ? "Quân sự" : p.militaryScope === "civilian" ? "Dân sự" : "—",
        officer: p.officer?.name || "—",
        // Các Phó Giám đốc chỉ theo dõi không xem kinh phí từng đề tài.
        budget: hideBudget ? "—" : budget,
        status: PROPOSAL_STATUS_LABELS[p.status] ?? p.status,
        submittedAt: p.submittedAt ? new Intl.DateTimeFormat("vi-VN").format(p.submittedAt) : "—"
      });
    });

    sheet.getColumn("budget").numFmt = "#,##0";

    const buffer = await workbook.xlsx.writeBuffer();
    await this.auditLog.record({
      action: "export-proposals",
      result: "success",
      actorId: actor!.id,
      username: actor!.username,
      targetEntity: "research-proposal-export",
      afterFacts: { format: "xlsx", rowCount: proposals.length, filters }
    });
    return Buffer.from(buffer);
  }
}
