import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    // 1. Phân loại theo đơn vị
    const byUnitId = await this.prisma.researchProposal.groupBy({
      by: ["hostOrganizationUnitId"],
      _count: {
        id: true
      }
    });

    const unitIds = byUnitId.map((u: any) => u.hostOrganizationUnitId);
    const units = await this.prisma.organizationUnit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, name: true }
    });
    const unitMap = new Map(units.map((u: any) => [u.id, u.name]));

    const byUnit = byUnitId.map((item: any) => ({
      unit: unitMap.get(item.hostOrganizationUnitId) || item.hostOrganizationUnitId,
      _count: item._count
    }));

    // 2. Phân loại theo trạng thái
    const byStatus = await this.prisma.researchProposal.groupBy({
      by: ["status"],
      _count: {
        id: true
      }
    });

    const total = byStatus.reduce((acc: number, curr: any) => acc + curr._count.id, 0);

    // 3. KPI thực tế
    const now = new Date();

    // Hồ sơ chờ xử lý (submitted, under_review, pending variants)
    const pendingStatuses = ["submitted", "under_review", "checked", "review_in_progress"];
    const pendingCount = await this.prisma.researchProposal.count({
      where: { status: { in: pendingStatuses } }
    });

    // Hồ sơ đã duyệt
    const approvedCount = await this.prisma.researchProposal.count({
      where: { status: "approved" }
    });

    // Hồ sơ quá hạn (endDate đã qua nhưng status chưa hoàn tất)
    const overdueCount = await this.prisma.researchProposal.count({
      where: {
        endDate: { lt: now },
        status: { notIn: ["approved", "rejected", "completed", "draft"] }
      }
    });

    // Tổng kinh phí đã duyệt (từ budgetMetadata JSON)
    const approvedProposals = await this.prisma.researchProposal.findMany({
      where: { status: "approved" },
      select: { budgetMetadata: true }
    });
    let totalApprovedBudget = 0;
    for (const p of approvedProposals) {
      const meta = p.budgetMetadata as any;
      if (meta && typeof meta.amount === "number") {
        totalApprovedBudget += meta.amount;
      }
    }

    // Hồ sơ nộp mới tháng này
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const submittedThisMonth = await this.prisma.researchProposal.count({
      where: {
        submittedAt: { gte: startOfMonth }
      }
    });

    return {
      totalProposals: total,
      proposalsByUnit: byUnit.map((item: any) => ({
        unit: item.unit,
        count: item._count.id
      })),
      proposalsByStatus: byStatus.map((item: any) => ({
        status: item.status,
        count: item._count.id
      })),
      kpis: {
        total,
        pending: pendingCount,
        approved: approvedCount,
        overdue: overdueCount,
        totalApprovedBudget,
        submittedThisMonth
      }
    };
  }
}
