import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { isInternalResearcherEligible } from "../proposals-shared/proposal-access.js";
import { runProposalMutation } from "../proposals-shared/proposal-mutation.js";
import type { DeliverableInput } from "./proposal-deliverables.dto.js";
import { ProposalParticipationService } from "./proposal-participation.service.js";
import { ResearchProposalsService } from "./research-proposals.service.js";

/**
 * Quyền xem sản phẩm đầu ra của hồ sơ: chủ nhiệm, hoặc cán bộ quản lý KH / lãnh đạo có phạm vi đơn vị chủ trì.
 * Dashboard dùng đúng hàm này để số đếm sản phẩm đầu ra không rộng hơn màn hình chi tiết.
 */
export function canReadProposalDeliverables(actor: SafeUserContext | undefined, proposal: { ownerId: string; hostOrganizationUnitId: string }) {
  if (!actor?.id) return false;
  const hasOrgScope = (actor.organizationScopes ?? []).some((scope: { id: string }) => scope.id === proposal.hostOrganizationUnitId);
  const isOwner = proposal.ownerId === actor.id;
  const isStaff = ["RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_BOARD_HEAD", "SYSTEM_ADMIN", "LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_OVERSIGHT_AUTHORITY"].includes(actor.systemRole);
  return isOwner || (isStaff && hasOrgScope);
}

/** Sản phẩm dự kiến là một phần nội dung đề xuất: chỉ sửa khi hồ sơ còn nháp hoặc đang được yêu cầu bổ sung. */
const EDITABLE_STATUSES = ["draft", "supplement_requested"];

type DeliverableRecord = { id: string; proposalId: string; type: string; title: string; description: string | null; status: string; createdById: string; createdAt: Date; updatedAt: Date };

/**
 * Sản phẩm dự kiến của hồ sơ đề xuất (giai đoạn đề xuất). Sản phẩm hoàn thành và việc nghiệm thu từng sản phẩm
 * thuộc đề tài sau khi hồ sơ được duyệt (approved-projects / project-closure).
 */
@Injectable()
export class ProposalDeliverablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposals: ResearchProposalsService,
    private readonly auditLog: AuditLogService
  ) {}

  /** Ai đọc được hồ sơ thì xem được sản phẩm dự kiến (kể cả phản biện: đây là nội dung được thẩm định). */
  async getDeliverables(proposalId: string, actor: SafeUserContext) {
    const proposal = await this.proposals.getProposal(actor, proposalId);
    const items = (await this.prisma.proposalDeliverable.findMany({ where: { proposalId }, orderBy: { createdAt: "asc" } })) as DeliverableRecord[];
    const editor = proposal.ownerId === actor.id || proposal.viewerParticipation?.role === "TOPIC_SECRETARY";
    return {
      deliverables: items.map(toResponse),
      canEdit: EDITABLE_STATUSES.includes(proposal.status) && isInternalResearcherEligible(actor) && editor
    };
  }

  async createDeliverable(proposalId: string, input: DeliverableInput, actor: SafeUserContext) {
    return this.mutate(actor, proposalId, async (tx, currentActor) => {
      const created = (await tx.proposalDeliverable.create({
        data: { proposalId, type: input.type!, title: input.title!, description: input.description ?? null, createdById: currentActor.id }
      })) as DeliverableRecord;
      await this.audit(tx, currentActor, "create-proposal-deliverable", proposalId, { after: toResponse(created) });
      return toResponse(created);
    });
  }

  async updateDeliverable(proposalId: string, deliverableId: string, input: DeliverableInput, actor: SafeUserContext) {
    return this.mutate(actor, proposalId, async (tx, currentActor) => {
      const current = await this.findDeliverable(tx, proposalId, deliverableId);
      const updated = (await tx.proposalDeliverable.update({ where: { id: deliverableId }, data: input })) as DeliverableRecord;
      await this.audit(tx, currentActor, "update-proposal-deliverable", proposalId, { before: toResponse(current), after: toResponse(updated) });
      return toResponse(updated);
    });
  }

  async deleteDeliverable(proposalId: string, deliverableId: string, actor: SafeUserContext) {
    return this.mutate(actor, proposalId, async (tx, currentActor) => {
      const current = await this.findDeliverable(tx, proposalId, deliverableId);
      await tx.proposalDeliverable.delete({ where: { id: deliverableId } });
      await this.audit(tx, currentActor, "delete-proposal-deliverable", proposalId, { before: toResponse(current) });
      return { success: true, id: deliverableId };
    });
  }

  /** Khoá hồ sơ, đọc lại người dùng, rồi kiểm tra trạng thái và vai trò (chủ nhiệm hoặc thư ký) ngay trong giao dịch. */
  private mutate<T>(actor: SafeUserContext, proposalId: string, work: (tx: PrismaService, actor: SafeUserContext) => Promise<T>) {
    return runProposalMutation(this.prisma, actor, proposalId, undefined, async (tx, currentActor) => {
      const proposal = await tx.researchProposal.findUnique({ where: { id: proposalId } });
      if (!proposal) throw new NotFoundException({ message: "Không tìm thấy hồ sơ đề xuất." });
      if (!EDITABLE_STATUSES.includes(proposal.status)) {
        throw new ForbiddenException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ khai báo sản phẩm dự kiến khi hồ sơ còn nháp hoặc đang được yêu cầu bổ sung." });
      }
      const isOwner = proposal.ownerId === currentActor.id;
      const isSecretary = !isOwner && (await new ProposalParticipationService(tx).resolveForProposal(currentActor.id, proposal)).roles.includes("TOPIC_SECRETARY");
      if (!isInternalResearcherEligible(currentActor) || (!isOwner && !isSecretary)) {
        throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chủ nhiệm hoặc thư ký đề tài được khai báo sản phẩm dự kiến." });
      }
      return work(tx, currentActor);
    });
  }

  private async findDeliverable(tx: PrismaService, proposalId: string, deliverableId: string) {
    const item = (await tx.proposalDeliverable.findFirst({ where: { id: deliverableId, proposalId } })) as DeliverableRecord | null;
    if (!item) throw new NotFoundException({ message: "Không tìm thấy sản phẩm dự kiến." });
    return item;
  }

  private audit(tx: PrismaService, actor: SafeUserContext, action: string, proposalId: string, facts: { before?: unknown; after?: unknown }) {
    const auditLog = this.auditLog instanceof AuditLogService ? new AuditLogService(tx) : this.auditLog;
    return auditLog.record({ action: action as never, result: "success", actorId: actor.id, targetEntity: "research-proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify(facts) });
  }
}

function toResponse(item: DeliverableRecord) {
  return { id: item.id, proposalId: item.proposalId, type: item.type, title: item.title, description: item.description, status: item.status, createdById: item.createdById, createdAt: item.createdAt, updatedAt: item.updatedAt };
}
