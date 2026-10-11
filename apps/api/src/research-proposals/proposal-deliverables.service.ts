import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";

const VALID_DELIVERABLE_TYPES = [
  "Bài báo khoa học",
  "Bằng sáng chế",
  "Sản phẩm công nghệ",
  "Sách chuyên khảo"
] as const;

/**
 * Quyền xem sản phẩm đầu ra của hồ sơ: chủ nhiệm, hoặc cán bộ quản lý KH / lãnh đạo có phạm vi đơn vị chủ trì.
 * Dashboard dùng đúng hàm này để số đếm sản phẩm đầu ra không rộng hơn màn hình chi tiết.
 */
export function canReadProposalDeliverables(actor: SafeUserContext | undefined, proposal: { ownerId: string; hostOrganizationUnitId: string }) {
  if (!actor?.id) return false;
  const hasOrgScope = (actor.organizationScopes ?? []).some((scope: { id: string }) => scope.id === proposal.hostOrganizationUnitId);
  const isOwner = proposal.ownerId === actor.id;
  const isStaff = actor.systemRole === "RESEARCH_MANAGEMENT_STAFF" || actor.systemRole === "RESEARCH_MANAGEMENT_HEAD" || actor.systemRole === "SYSTEM_ADMIN" || actor.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY";
  return isOwner || (isStaff && hasOrgScope);
}

@Injectable()
export class ProposalDeliverablesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify the proposal exists and the user has at least read access (owner or scientific management).
   * Returns the proposal record for further checks.
   */
  private async assertProposalAccess(proposalId: string, actor: SafeUserContext) {
    const proposal = await this.prisma.researchProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, ownerId: true, hostOrganizationUnitId: true, status: true }
    });

    if (!proposal) {
      throw new NotFoundException({ message: "Không tìm thấy đề tài." });
    }

    if (!canReadProposalDeliverables(actor, proposal)) {
      throw new ForbiddenException({ message: "Không có quyền truy cập sản phẩm đầu ra của đề tài này." });
    }

    return proposal;
  }

  async getDeliverables(proposalId: string, actor: SafeUserContext) {
    await this.assertProposalAccess(proposalId, actor);

    return this.prisma.proposalDeliverable.findMany({
      where: { proposalId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createDeliverable(
    proposalId: string,
    data: {
      type: string;
      title: string;
      description?: string;
      proofFileName?: string;
      proofStorageKey?: string;
      publishedAt?: string;
    },
    actor: SafeUserContext
  ) {
    const proposal = await this.assertProposalAccess(proposalId, actor);

    // Only the owner can create deliverables
    if (proposal.ownerId !== actor.id) {
      throw new ForbiddenException({ message: "Chỉ chủ nhiệm đề tài mới có thể khai báo sản phẩm đầu ra." });
    }

    // Validate required fields
    const title = data.title?.trim();
    if (!title) {
      throw new BadRequestException({ message: "Tên sản phẩm không được để trống." });
    }

    const type = data.type?.trim();
    if (!type) {
      throw new BadRequestException({ message: "Loại sản phẩm không được để trống." });
    }

    return this.prisma.proposalDeliverable.create({
      data: {
        proposalId,
        type,
        title,
        description: data.description?.trim() || null,
        proofFileName: data.proofFileName?.trim() || null,
        proofStorageKey: data.proofStorageKey?.trim() || null,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        createdById: actor.id
      }
    });
  }
}
