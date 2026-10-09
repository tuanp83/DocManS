import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { canReadProposal } from "../proposals-shared/proposal-access.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalManagementOfficerService } from "../proposals-shared/proposal-management-officer.service.js";
import { ProposalParticipationService } from "../research-proposals/proposal-participation.service.js";

export type DashboardProposalRecord = {
  id: string;
  ownerId: string;
  createdAt: Date;
  hostOrganizationUnitId: string;
  status: string;
  title: string;
  endDate: Date | null;
  submittedAt: Date | null;
  budgetMetadata: unknown;
  owner: { displayName: string | null; username: string | null } | null;
  hostOrganizationUnit: { id: string; name: string } | null;
};

const PENDING_STATUSES = ["submitted", "under_review", "checked", "review_in_progress"];
const CLOSED_STATUSES = ["approved", "rejected", "completed", "draft"];

function approvedBudget(record: DashboardProposalRecord) {
  const meta = record.budgetMetadata as { amount?: unknown } | null;
  return meta && typeof meta.amount === "number" ? meta.amount : 0;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participation: ProposalParticipationService,
    private readonly reviewAccess: ProposalReviewAccessService,
    private readonly managementOfficers: ProposalManagementOfficerService
  ) {}

  /**
   * Dashboard totals and exports use the same visibility filter as the proposal list
   * (`canReadProposal`): authorization baseline §4.5 "Search/count/facet/export dùng cùng filter".
   * An actor without a resolvable scope or relationship sees nothing (fail closed).
   */
  async findReadableProposals(actor: SafeUserContext | undefined, asOf = new Date()): Promise<DashboardProposalRecord[]> {
    if (!actor?.id) {
      throw new ForbiddenException({ message: "Không có quyền xem số liệu tổng hợp." });
    }

    const records = (await this.prisma.researchProposal.findMany({
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        hostOrganizationUnitId: true,
        status: true,
        title: true,
        endDate: true,
        submittedAt: true,
        budgetMetadata: true,
        owner: { select: { displayName: true, username: true } },
        hostOrganizationUnit: { select: { id: true, name: true } }
      }
    })) as DashboardProposalRecord[];

    const [participationByProposal, reviewAccessByProposal, managementOfficerByProposal] = await Promise.all([
      this.participation.resolveForProposals(actor.id, records, asOf),
      this.reviewAccess.resolveForProposals(actor.id, records.map((record) => record.id), asOf),
      this.managementOfficers.resolveForProposals(records.map((record) => record.id), asOf)
    ]);

    return records.filter((record) =>
      canReadProposal(actor, record, participationByProposal.get(record.id), reviewAccessByProposal.get(record.id), managementOfficerByProposal.get(record.id))
    );
  }

  async getStats(actor: SafeUserContext | undefined) {
    const now = new Date();
    const proposals = await this.findReadableProposals(actor, now);

    // 1. Phân loại theo đơn vị
    const byUnit = new Map<string, { unit: string; count: number }>();
    for (const proposal of proposals) {
      const entry = byUnit.get(proposal.hostOrganizationUnitId) ?? {
        unit: proposal.hostOrganizationUnit?.name || proposal.hostOrganizationUnitId,
        count: 0
      };
      entry.count += 1;
      byUnit.set(proposal.hostOrganizationUnitId, entry);
    }

    // 2. Phân loại theo trạng thái
    const byStatus = new Map<string, number>();
    for (const proposal of proposals) {
      byStatus.set(proposal.status, (byStatus.get(proposal.status) ?? 0) + 1);
    }

    // 3. KPI thực tế (chỉ trên các hồ sơ người dùng được phép xem)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const approved = proposals.filter((proposal) => proposal.status === "approved");
    const total = proposals.length;

    return {
      totalProposals: total,
      proposalsByUnit: [...byUnit.values()],
      proposalsByStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      kpis: {
        total,
        // Hồ sơ chờ xử lý
        pending: proposals.filter((proposal) => PENDING_STATUSES.includes(proposal.status)).length,
        // Hồ sơ đã duyệt
        approved: approved.length,
        // Hồ sơ quá hạn (endDate đã qua nhưng status chưa hoàn tất)
        overdue: proposals.filter((proposal) => proposal.endDate && proposal.endDate < now && !CLOSED_STATUSES.includes(proposal.status)).length,
        // Tổng kinh phí đã duyệt (từ budgetMetadata JSON)
        totalApprovedBudget: approved.reduce((sum, proposal) => sum + approvedBudget(proposal), 0),
        // Hồ sơ nộp mới tháng này
        submittedThisMonth: proposals.filter((proposal) => proposal.submittedAt && proposal.submittedAt >= startOfMonth).length
      }
    };
  }
}
