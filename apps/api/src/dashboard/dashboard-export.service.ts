import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import ExcelJS from "exceljs";

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
  constructor(private readonly prisma: PrismaService) {}

  async exportProposalsToExcel(): Promise<Buffer> {
    const proposals = await this.prisma.researchProposal.findMany({
      include: {
        hostOrganizationUnit: true,
        owner: true
      },
      orderBy: { submittedAt: "desc" }
    });

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
    return buffer as unknown as Buffer;
  }
}
