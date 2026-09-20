import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

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

    return {
      totalProposals: total,
      proposalsByUnit: byUnit.map((item: any) => ({
        unit: item.unit,
        count: item._count.id
      })),
      proposalsByStatus: byStatus.map((item: any) => ({
        status: item.status,
        count: item._count.id
      }))
    };
  }
}
