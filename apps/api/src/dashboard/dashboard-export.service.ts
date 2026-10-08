import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { DashboardService } from "./dashboard.service.js";

const STATUS_MAP: Record<string, string> = {
  draft: "Bản nháp",
  submitted: "Đã nộp",
  checked: "Đã kiểm tra",
  review_in_progress: "Đang đánh giá",
  under_review: "Đang phản biện",
  ready_for_approval: "Chờ phê duyệt",
  approved: "Đã duyệt",
  "needs-supplement": "Cần bổ sung",
  rejected: "Từ chối",
  completed: "Đã nghiệm thu",
};

@Injectable()
export class DashboardExportService {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly auditLog: AuditLogService
  ) {}

  async exportProposalsToExcel(actor: SafeUserContext | undefined): Promise<Buffer> {
    // Same visibility filter as the proposal list and dashboard totals; fails closed without an actor.
    const proposals = await this.dashboard.findReadableProposals(actor);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DocManS";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Danh_sach_de_tai");

    sheet.columns = [
      { header: "STT", key: "stt", width: 5 },
      { header: "Tên đề tài", key: "title", width: 50 },
      { header: "Chủ nhiệm đề tài", key: "owner", width: 25 },
      { header: "Đơn vị chủ trì", key: "unit", width: 30 },
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
      let budget = 0;
      if (p.budgetMetadata && typeof (p.budgetMetadata as any).amount === "number") {
        budget = (p.budgetMetadata as any).amount;
      }

      sheet.addRow({
        stt: index + 1,
        title: p.title,
        owner: p.owner?.displayName || p.owner?.username || "—",
        unit: p.hostOrganizationUnit?.name || "—",
        budget: budget,
        status: STATUS_MAP[p.status] || p.status,
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
      afterFacts: { format: "xlsx", rowCount: proposals.length }
    });
    return buffer as unknown as Buffer;
  }
}
