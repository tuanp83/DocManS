import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { REVIEW_STATUS } from "../proposals-shared/proposal-review-access.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalParticipationService } from "../research-proposals/proposal-participation.service.js";
import { DECIDABLE_STATUSES, PROPOSAL_STATUS, PROPOSAL_STATUS_LABELS } from "../proposals-shared/proposal-workflow.js";
import {
  assertApprovalAuthority,
  assertCanManageDisbursement,
  assertCanManageIRB,
  assertCanReadEvaluation,
  assertProposalStatus,
  assertScientificManagementScope,
  findEvaluationProposal,
  isTopScientificManagement,
  resolveActorConflict,
  updateProposalStatusGuarded,
  type EvaluationProposalRecord,
  type ProposalDecisionRecord
} from "./proposal-evaluation-support.js";
import { ProposalEvaluationSummaryService } from "./proposal-evaluation-summary.service.js";
import { ProposalReviewAssignmentsService } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService } from "./proposal-reviews.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

export const PROPOSAL_DECISIONS = {
  approved: "approved",
  rejected: "rejected"
} as const;

export type ProposalDecisionCode = (typeof PROPOSAL_DECISIONS)[keyof typeof PROPOSAL_DECISIONS];

const DECISION_TARGET_STATUS: Record<ProposalDecisionCode, string> = {
  approved: PROPOSAL_STATUS.approved,
  rejected: PROPOSAL_STATUS.rejected
};

const DECISION_LABELS: Record<string, string> = {
  approved: "Phê duyệt",
  rejected: "Không phê duyệt"
};

/**
 * ST-3.5 — the leadership approval decision.
 *
 * Authority, workflow state and conflict are all checked in the same service path, so no caller can
 * satisfy two of the three and skip the last (AC-ST-3.5-02, AC-ST-3.5-03, AC-ST-3.5-04). The
 * conflict check reuses the ST-3.0 primitive and additionally blocks an authority who reviewed the
 * proposal, which is a conflict the participation primitive alone cannot see.
 */
@Injectable()
export class ProposalDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly participation: ProposalParticipationService,
    private readonly reviewAccess: ProposalReviewAccessService,
    private readonly assignments: ProposalReviewAssignmentsService,
    private readonly reviews: ProposalReviewsService,
    private readonly summaries: ProposalEvaluationSummaryService,
    private readonly notifications: NotificationsService
  ) {}

  /** AC-ST-3.5-01 — everything the authority needs in one authority-scoped read model. */
  async getDecisionPackage(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);
    // Same workflow gate as `canReadProposal`: a draft belongs to its owner, so the decision package
    // must not become a side channel that reports an unsubmitted proposal's existence.
    assertCanReadEvaluation(actor, proposal);

    const [assignmentRecords, reviewRecords, summary, decisions, attachments, history] = await Promise.all([
      this.assignments.findAssignments(proposalId),
      this.assignments.findReviews(proposalId),
      this.summaries.findSummary(proposalId),
      this.findDecisions(proposalId),
      this.prisma.fileRecord.findMany({
        where: { relatedEntityType: "research_proposal", relatedEntityId: proposalId, status: "active", deletedAt: null },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.proposalSubmissionEvent.findMany({
        where: { proposalId },
        orderBy: { submittedAt: "asc" },
        include: { actor: { select: { displayName: true } } }
      })
    ]);

    const conflict = await this.resolveDecisionConflict(actor, proposal);

    return {
      proposalId,
      proposalStatus: proposal.status,
      proposalStatusLabel: PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status,
      title: proposal.title,
      code: proposal.code,
      proposalTypeCode: proposal.proposalTypeCode,
      researchFieldCode: proposal.researchFieldCode,
      budgetMetadata: proposal.budgetMetadata,
      canDecide: (DECIDABLE_STATUSES as string[]).includes(proposal.status) && !conflict.conflicted,
      conflict,
      progress: this.summaries.summarizeProgress(assignmentRecords, reviewRecords),
      reviews: reviewRecords
        .filter((review) => review.status === REVIEW_STATUS.submitted)
        .map((review) => this.reviews.toSubmittedReviewResponse(review)),
      evaluationSummary: this.summaries.toSummaryResponse(summary),
      decisions: decisions.map((decision) => this.toDecisionResponse(decision)),
      attachmentCount: (attachments as unknown[]).length,
      history: (
        history as Array<{
          id: string;
          fromStatus: string;
          toStatus: string;
          submittedAt: Date;
          note: string | null;
          actor?: { displayName: string } | null;
        }>
      ).map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        submittedAt: event.submittedAt.toISOString(),
        actorDisplayName: event.actor?.displayName ?? "",
        note: event.note ?? ""
      }))
    };
  }

  /** AC-ST-3.5-02. Status, decision record, history and audit are written in one transaction. */
  async decide(actor: SafeUserContext, proposalId: string, decision: ProposalDecisionCode, input: Record<string, unknown> = {}) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);
    assertProposalStatus(proposal, DECIDABLE_STATUSES, "Chỉ hồ sơ ở trạng thái chờ phê duyệt mới được quyết định.");

    const conflict = await this.resolveDecisionConflict(actor, proposal);
    if (conflict.conflicted) {
      await this.auditLog.record({
        action: decision === PROPOSAL_DECISIONS.approved ? "approve-proposal" : "reject-proposal",
        result: "failure",
        actorId: actor.id,
        targetEntity: "proposal-decision",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, reasonCode: conflict.reasonCode, reason: conflict.reason })
      });

      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }

    const note = this.readNote(input.note, { required: decision === PROPOSAL_DECISIONS.rejected });
    const toStatus = DECISION_TARGET_STATUS[decision];
    const decidedAt = new Date();

    const created = (await this.prisma.$transaction(async (tx) => {
      // Conditional on the status we validated, so two authorities deciding at once cannot both win.
      await updateProposalStatusGuarded(tx, proposalId, proposal.status, toStatus);

      // If approved, leadership can specify or adjust the approved budget
      if (decision === PROPOSAL_DECISIONS.approved && input.approvedBudget !== undefined && input.approvedBudget !== null && input.approvedBudget !== "") {
        const approvedAmount = Number(input.approvedBudget);
        if (!isNaN(approvedAmount) && approvedAmount >= 0) {
          const currentBudget = (proposal.budgetMetadata as Record<string, unknown>) || {};
          const updatedBudget = {
            ...currentBudget,
            amount: approvedAmount,
            approvedAmount,
            note: typeof input.budgetNote === "string" && input.budgetNote.trim() ? input.budgetNote.trim() : (currentBudget.note as string)
          };
          await tx.researchProposal.update({
            where: { id: proposalId },
            data: { budgetMetadata: updatedBudget }
          });
        }
      }

      const record = (await tx.proposalDecision.create({
        data: {
          proposalId,
          decision,
          note,
          decidedById: actor.id,
          decidedAt,
          fromStatus: proposal.status,
          toStatus
        } as never,
        // Included so the response names the deciding authority, matching what `findDecisions`
        // returns on a later read of the same record.
        include: { decidedBy: { select: { displayName: true } } }
      })) as ProposalDecisionRecord;

      await tx.proposalSubmissionEvent.create({
        data: {
          proposalId,
          actorId: actor.id,
          fromStatus: proposal.status,
          toStatus,
          submittedAt: decidedAt,
          note: decision === PROPOSAL_DECISIONS.approved ? "Lãnh đạo phê duyệt hồ sơ" : "Lãnh đạo không phê duyệt hồ sơ"
        } as never
      });

      await tx.auditLog.create({
        data: {
          action: decision === PROPOSAL_DECISIONS.approved ? "approve-proposal" : "reject-proposal",
          result: "success",
          actorId: actor.id,
          targetEntity: "proposal-decision",
          targetEntityId: record.id,
          username: actor.username,
          reason: JSON.stringify({ proposalId, decision, fromStatus: proposal.status, toStatus, hasNote: Boolean(note) })
        }
      });

      return record;
    })) as unknown as ProposalDecisionRecord;

    return {
      decision: this.toDecisionResponse(created),
      proposalStatus: toStatus,
      proposalStatusLabel: PROPOSAL_STATUS_LABELS[toStatus] ?? toStatus
    };
  }

  async findDecisions(proposalId: string) {
    return (await this.prisma.proposalDecision.findMany({
      where: { proposalId },
      orderBy: { decidedAt: "asc" },
      include: { decidedBy: { select: { displayName: true } } }
    })) as ProposalDecisionRecord[];
  }

  /** Leadership specifically approves or updates the proposal budget allocation */
  async approveBudget(
    actor: SafeUserContext,
    proposalId: string,
    input: { approvedBudget: number; budgetNote?: string }
  ) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);

    const approvedAmount = Number(input.approvedBudget);
    if (isNaN(approvedAmount) || approvedAmount < 0) {
      throw new BadRequestException({ message: "Mức kinh phí phê duyệt không hợp lệ." });
    }

    const currentBudget = (proposal.budgetMetadata as Record<string, unknown>) || {};
    const updatedBudget = {
      ...currentBudget,
      amount: approvedAmount,
      approvedAmount,
      note: typeof input.budgetNote === "string" && input.budgetNote.trim() ? input.budgetNote.trim() : (currentBudget.note as string)
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { budgetMetadata: updatedBudget }
    });

    await this.auditLog.record({
      action: "approve-proposal-budget",
      result: "success",
      actorId: actor.id,
      targetEntity: "research-proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, approvedAmount, budgetNote: input.budgetNote })
    });

    return {
      success: true,
      proposalId,
      approvedAmount,
      budgetMetadata: updatedBudget
    };
  }

  /**
   * Stage 1: Scientific management staff (Trưởng phòng KHQS) creates and submits a proposal for Council formation.
   * Enforces fail-closed Conflict-of-Interest (COI) check for all council candidates.
   */
  async proposeCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertScientificManagementScope(actor, proposal);

    const conflict = await this.resolveDecisionConflict(actor, proposal);
    if (conflict.conflicted) {
      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }

    const members = Array.isArray(input.members) ? (input.members as Array<Record<string, unknown>>) : [];
    // Validate COI for each member
    for (const member of members) {
      const userId = typeof member.userId === "string" ? member.userId : "";
      if (userId) {
        const memConflict = await resolveActorConflict({ participation: this.participation, reviewAccess: this.reviewAccess }, userId, proposal.id);
        if (memConflict.conflicted) {
          throw new BadRequestException({
            message: `Thành viên ${member.displayName || userId} có xung đột lợi ích (${memConflict.reason}), không thể tham gia Hội đồng.`
          });
        }
      }
    }

    const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
    const isDirectSubmit = input.submitToLeadership === true || input.status === "submitted";
    const updatedCouncil = {
      ...currentCouncil,
      status: isDirectSubmit ? "submitted" : (input.status as string) || "draft",
      proposedAt: new Date().toISOString(),
      proposedById: actor.id,
      proposedByName: actor.displayName,
      meetingDate: typeof input.meetingDate === "string" ? input.meetingDate : (currentCouncil.meetingDate as string) || "",
      meetingLocation: typeof input.meetingLocation === "string" ? input.meetingLocation : (currentCouncil.meetingLocation as string) || "",
      tentativeAgenda: typeof input.tentativeAgenda === "string" ? input.tentativeAgenda : (currentCouncil.tentativeAgenda as string) || "",
      members
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await this.auditLog.record({
      action: "propose-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "research-proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, memberCount: members.length, status: updatedCouncil.status })
    });

    return {
      success: true,
      proposalId,
      councilMetadata: updatedCouncil
    };
  }

  /**
   * Stage 1: Retrieve eligible scientists and candidate profiles for Council formation.
   * Evaluates Conflict of Interest (COI) for each scientist against the proposal.
   */
  async getCouncilCandidates(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertCanReadEvaluation(actor, proposal);

    const [proposalMembers, hostOrgUnit] = await Promise.all([
      this.prisma.proposalMember.findMany({
        where: { proposalId }
      }).catch(() => []),
      proposal.hostOrganizationUnitId
        ? this.prisma.organizationUnit.findUnique({
            where: { id: proposal.hostOrganizationUnitId }
          }).catch(() => null)
        : null
    ]);

    const profiles = await this.prisma.researcherProfile.findMany({
      where: {
        status: "ACTIVE"
      },
      include: {
        academicRankCatalogItem: true,
        academicDegreeCatalogItem: true,
        managementOrganizationUnit: true,
        linkedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            systemRole: true,
            unit: true
          }
        }
      },
      orderBy: { fullName: "asc" }
    });

    const candidates = [];
    for (const p of profiles) {
      let isConflicted = false;
      let isWarning = false;
      let coiStatus: "CLEAN" | "WARNING_SAME_UNIT" | "BLOCKED_DIRECT_PARTICIPANT" = "CLEAN";
      let conflictReason: string | undefined = undefined;

      // 1. Kiểm tra nếu là Chủ nhiệm đề tài (PI)
      if (p.linkedUserId && p.linkedUserId === proposal.ownerId) {
        isConflicted = true;
        coiStatus = "BLOCKED_DIRECT_PARTICIPANT";
        conflictReason = "Là Chủ nhiệm đề tài (xung đột trực tiếp, không được tham gia Hội đồng)";
      }
      // 2. Kiểm tra nếu là thành viên tham gia nghiên cứu đề tài
      else if (
        proposalMembers.some(
          (m) => (p.linkedUserId && m.userId === p.linkedUserId) || (m.name && m.name.toLowerCase() === p.fullName.toLowerCase())
        )
      ) {
        isConflicted = true;
        coiStatus = "BLOCKED_DIRECT_PARTICIPANT";
        conflictReason = "Là thành viên trong nhóm nghiên cứu đề tài (xung đột trực tiếp)";
      }
      // 3. Kiểm tra nếu đã được phân công phản biện vòng độc lập
      else if (p.linkedUserId) {
        const conflict = await resolveActorConflict(
          { participation: this.participation, reviewAccess: this.reviewAccess },
          p.linkedUserId,
          proposal.id
        );
        if (conflict.conflicted) {
          isConflicted = true;
          coiStatus = "BLOCKED_DIRECT_PARTICIPANT";
          conflictReason = conflict.reason || "Có xung đột lợi ích với đề tài";
        }
      }

      // 4. Kiểm tra nếu cùng đơn vị chủ trì (Khoa/Bộ môn) với đề tài
      if (!isConflicted) {
        const candUnitId = p.managementOrganizationUnitId;
        const hostUnitName = hostOrgUnit?.name;
        const candUnitName = p.managementOrganizationUnit?.name || p.linkedUser?.unit;
        const isSameUnit =
          (candUnitId && candUnitId === proposal.hostOrganizationUnitId) ||
          (hostUnitName && candUnitName && hostUnitName === candUnitName);

        if (isSameUnit) {
          isWarning = true;
          coiStatus = "WARNING_SAME_UNIT";
          conflictReason = `Cùng đơn vị với chủ nhiệm đề tài (${hostUnitName || "đơn vị chủ trì"}) - cần cân nhắc tính khách quan`;
        }
      }

      const academicTitle = p.title || p.academicRankCatalogItem?.name || p.academicDegreeCatalogItem?.name || "Nhà khoa học";
      const unit = p.managementOrganizationUnit?.name || p.linkedUser?.unit || (p.profileType === "EXTERNAL" ? "Đơn vị ngoài" : "Học viện Quân y");

      candidates.push({
        id: p.id,
        userId: p.linkedUserId,
        fullName: p.fullName,
        username: p.linkedUser?.username || "",
        systemRole: p.linkedUser?.systemRole || "",
        academicTitle,
        unit,
        militaryRank: p.militaryRank || "",
        position: p.position || "",
        profileType: p.profileType,
        isConflicted,
        isWarning,
        coiStatus,
        conflictReason
      });
    }

    return {
      proposalId,
      candidates
    };
  }



  /**
   * Stage 1: Leadership approves Council proposal and signs the official Council Establishment Decision.
   * Atomically transitions proposal to under_review and activates reviewer assignments.
   */
  async approveCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);

    const conflict = await this.resolveDecisionConflict(actor, proposal);
    if (conflict.conflicted) {
      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }

    const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
    const proposalCode = proposal.code || proposal.id.slice(0, 8).toUpperCase();
    const decisionNumber = (typeof input.decisionNumber === "string" && input.decisionNumber.trim())
      ? input.decisionNumber.trim()
      : `QĐ-TLHĐ-${proposalCode.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;

    const members = Array.isArray(input.members)
      ? (input.members as Array<Record<string, unknown>>)
      : (Array.isArray(currentCouncil.members) ? (currentCouncil.members as Array<Record<string, unknown>>) : []);

    const updatedCouncil: Record<string, unknown> = {
      ...currentCouncil,
      status: "approved",
      decisionNumber,
      decidedAt: new Date().toISOString(),
      decidedById: actor.id,
      decidedByName: actor.displayName,
      approvalNote: typeof input.approvalNote === "string" ? input.approvalNote.trim() : "",
      members
    };

    await this.prisma.$transaction(async (tx) => {
      // If proposal is in submitted state, move to under_review
      if (proposal.status === "submitted" || proposal.status === "resubmitted") {
        await tx.researchProposal.update({
          where: { id: proposalId },
          data: {
            status: "under_review",
            councilMetadata: updatedCouncil as any
          }
        });
      } else {
        await tx.researchProposal.update({
          where: { id: proposalId },
          data: { councilMetadata: updatedCouncil as any }
        });
      }

      // Automatically create ProposalReviewAssignment for council members with userId
      for (const m of members) {
        const userId = typeof m.userId === "string" ? m.userId : "";
        if (userId) {
          const role = (m.role === "reviewer_1" || m.role === "reviewer_2") ? "reviewer" : "committee_member";
          const existing = await tx.proposalReviewAssignment.findFirst({
            where: {
              proposalId,
              reviewerUserId: userId
            }
          });

          if (!existing) {
            await tx.proposalReviewAssignment.create({
              data: {
                proposalId,
                reviewerUserId: userId,
                assignmentRole: role,
                status: "assigned",
                assignedById: actor.id,
                assignedAt: new Date(),
                effectiveFrom: new Date(),
                dueDate: updatedCouncil.meetingDate ? new Date(updatedCouncil.meetingDate as string) : null
              }
            });
          }
        }
      }
    });

    await this.auditLog.record({
      action: "approve-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "research-proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, decisionNumber, approvalNote: input.approvalNote })
    });

    return {
      success: true,
      proposalId,
      councilMetadata: updatedCouncil
    };
  }

  /**
   * Stage 1: Leadership requests adjustments or returns Council proposal to staff.
   */
  async rejectCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);

    const conflict = await this.resolveDecisionConflict(actor, proposal);
    if (conflict.conflicted) {
      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }

    const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
    const rejectionReason = typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim()
      : "Lãnh đạo yêu cầu điều chỉnh cơ cấu nhân sự Hội đồng.";

    const updatedCouncil = {
      ...currentCouncil,
      status: "rejected",
      rejectionReason,
      rejectedAt: new Date().toISOString(),
      rejectedById: actor.id,
      rejectedByName: actor.displayName
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await this.auditLog.record({
      action: "reject-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "research-proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, rejectionReason })
    });

    return {
      success: true,
      proposalId,
      councilMetadata: updatedCouncil
    };
  }

  /**
   * Stage 2: Staff or Council Secretary records the official evaluation minutes & conclusion.
   */
  async recordCouncilMinutes(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertScientificManagementScope(actor, proposal);

    const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
    const conclusion = (typeof input.conclusion === "string" ? input.conclusion : "approved") as "approved" | "revision_required" | "rejected";
    const conclusionLabel = conclusion === "approved"
      ? "Đạt yêu cầu (Đề nghị phê duyệt)"
      : conclusion === "revision_required"
      ? "Đạt nhưng cần chỉnh sửa bổ sung"
      : "Không đạt yêu cầu";

    const councilMinutes = {
      meetingConductedAt: typeof input.meetingConductedAt === "string" ? input.meetingConductedAt : new Date().toISOString(),
      attendance: Array.isArray(input.attendance) ? input.attendance : [],
      conclusion,
      conclusionLabel,
      averageScore: Number(input.averageScore) || 0,
      summaryComments: typeof input.summaryComments === "string" ? input.summaryComments.trim() : "",
      modificationsRequired: typeof input.modificationsRequired === "string" ? input.modificationsRequired.trim() : "",
      minutesAttachment: input.minutesAttachment || null,
      recordedById: actor.id,
      recordedByName: actor.displayName,
      recordedAt: new Date().toISOString()
    };

    const updatedCouncil = {
      ...currentCouncil,
      councilMinutes
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await this.auditLog.record({
      action: "record-council-minutes",
      result: "success",
      actorId: actor.id,
      targetEntity: "research-proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, conclusion, averageScore: input.averageScore })
    });

    return {
      success: true,
      proposalId,
      councilMetadata: updatedCouncil
    };
  }

  /**
   * Evaluates role and assignment conflicts. An authority cannot decide a proposal they own or participate in, or
   * otherwise be judging their own review. Shared with ST-3.4 consolidation.
   */
  private resolveDecisionConflict(actor: SafeUserContext, proposal: EvaluationProposalRecord) {
    return resolveActorConflict({ participation: this.participation, reviewAccess: this.reviewAccess }, actor?.id, proposal.id);
  }

  private readNote(value: unknown, options: { required: boolean }) {
    const note = typeof value === "string" ? value.trim() : "";

    if (!note) {
      if (options.required) {
        throw new BadRequestException({ message: "Nhập lý do khi không phê duyệt hồ sơ." });
      }
      return null;
    }

    if (note.length > 2000) {
      throw new BadRequestException({ message: "Ý kiến quyết định không được vượt quá 2000 ký tự." });
    }

    return note;
  }

  private toDecisionResponse(decision: ProposalDecisionRecord) {
    return {
      id: decision.id,
      proposalId: decision.proposalId,
      decision: decision.decision,
      decisionLabel: DECISION_LABELS[decision.decision] ?? decision.decision,
      note: decision.note ?? "",
      decidedById: decision.decidedById,
      decidedByDisplayName: decision.decidedBy?.displayName ?? "",
      decidedAt: decision.decidedAt.toISOString(),
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus
    };
  }

  // =========================================================================================
  // PHÂN HỆ HỘI ĐỒNG NGHIỆM THU & ĐÁNH GIÁ KẾT QUẢ
  // =========================================================================================

  async proposeAcceptanceCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertScientificManagementScope(actor, proposal);

    const members = (input.members as Array<any>) || [];
    if (members.length === 0) {
      throw new BadRequestException({ message: "Hội đồng nghiệm thu cần ít nhất 3 thành viên (Chủ tịch, Phản biện, Thư ký)." });
    }

    const acceptanceCouncil = {
      status: "proposed",
      proposedAt: new Date().toISOString(),
      proposedById: actor.id,
      proposedByName: actor.displayName || actor.username,
      acceptanceType: (input.acceptanceType as string) || "official", // "grassroots" | "official"
      meetingDate: (input.meetingDate as string) || null,
      meetingLocation: (input.meetingLocation as string) || "Phòng họp Trung tâm - Học viện Quân y",
      tentativeAgenda: (input.tentativeAgenda as string) || "Hội đồng đánh giá nghiệm thu kết quả thực hiện nhiệm vụ KH&CN cấp Học viện",
      members
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: {
        acceptanceCouncilMetadata: acceptanceCouncil
      }
    });

    await this.auditLog.record({
      action: "propose-acceptance-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, acceptanceCouncil };
  }

  async approveAcceptanceCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);

    const current = (proposal.acceptanceCouncilMetadata as Record<string, unknown>) || {};
    const count = await this.prisma.researchProposal.count({ where: { status: "approved" } });
    const decisionNumber = (input.decisionNumber as string) || `${count + 45}/QĐ-HVQY`;

    const updated = {
      ...current,
      status: "approved",
      approvedAt: new Date().toISOString(),
      approvedById: actor.id,
      approvedByName: actor.displayName || actor.username,
      decisionNumber,
      decisionDate: (input.decisionDate as string) || new Date().toISOString()
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: {
        acceptanceCouncilMetadata: updated
      }
    });

    await this.auditLog.record({
      action: "approve-acceptance-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, acceptanceCouncil: updated };
  }

  async recordAcceptanceMinutes(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertScientificManagementScope(actor, proposal);

    const current = (proposal.acceptanceCouncilMetadata as Record<string, unknown>) || {};

    const reportScore = Number(input.reportScore ?? 28);
    const productScore = Number(input.productScore ?? 27);
    const trainingScore = Number(input.trainingScore ?? 14);
    const applicationScore = Number(input.applicationScore ?? 23);
    const totalScore = Math.min(100, Math.max(0, reportScore + productScore + trainingScore + applicationScore));

    const classification = (input.classification as string) || (totalScore >= 90 ? "XUẤT SẮC" : totalScore >= 70 ? "ĐẠT" : "KHÔNG ĐẠT");
    const resolution = (input.resolution as string) || "approved";

    const updated = {
      ...current,
      status: "completed",
      completedAt: new Date().toISOString(),
      completedById: actor.id,
      completedByName: actor.displayName || actor.username,
      scores: {
        reportScore,
        productScore,
        trainingScore,
        applicationScore,
        totalScore,
        classification
      },
      resolution,
      conclusions: (input.conclusions as string) || "Hội đồng nhất trí nghiệm thu kết quả nghiên cứu của đề tài đạt yêu cầu chất lượng.",
      modificationsRequired: (input.modificationsRequired as string) || "",
      minutesSummary: (input.minutesSummary as string) || "Biên bản họp Hội đồng đánh giá nghiệm thu chính thức."
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: {
        acceptanceCouncilMetadata: updated
      }
    });

    await this.auditLog.record({
      action: "record-acceptance-minutes",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, acceptanceCouncil: updated };
  }

  // =========================================================================================
  // MODULE GIÁM SÁT GIẢI NGÂN & QUYẾT TOÁN THEO MỐC (Strict RBAC)
  // =========================================================================================

  async getDisbursement(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertCanReadEvaluation(actor, proposal);

    const totalAmount = Number((proposal.budgetMetadata as any)?.amount ?? 850000000);
    const existing = proposal.disbursementMetadata as Record<string, unknown> | null;

    if (existing) {
      return { proposalId, disbursement: existing };
    }

    const defaultData = {
      totalBudget: totalAmount,
      totalDisbursed: Math.round(totalAmount * 0.4),
      totalSettled: 0,
      milestones: [
        {
          id: "ms-1",
          name: "Đợt 1: Tạm ứng kinh phí sau ký hợp đồng / phê duyệt",
          percentage: 40,
          plannedAmount: Math.round(totalAmount * 0.4),
          disbursedAmount: Math.round(totalAmount * 0.4),
          disbursedDate: "2026-05-15",
          receiptNumber: "UNC-2026-0412",
          status: "disbursed",
          note: "Đã giải ngân tạm ứng đợt 1 vào tài khoản cơ quan chủ trì"
        },
        {
          id: "ms-2",
          name: "Đợt 2: Giải ngân giai đoạn 2 sau báo cáo tiến độ giữa kỳ đạt",
          percentage: 40,
          plannedAmount: Math.round(totalAmount * 0.4),
          disbursedAmount: 0,
          disbursedDate: null,
          receiptNumber: null,
          status: "pending",
          note: "Chờ thẩm định báo cáo tiến độ 6 tháng"
        },
        {
          id: "ms-3",
          name: "Đợt 3: Thanh quyết toán kinh phí còn lại sau nghiệm thu chính thức",
          percentage: 20,
          plannedAmount: totalAmount - Math.round(totalAmount * 0.8),
          disbursedAmount: 0,
          disbursedDate: null,
          receiptNumber: null,
          status: "pending",
          note: "Quyết toán sau khi có Quyết định công nhận kết quả nghiệm thu"
        }
      ],
      expenseCategories: [
        { code: "cat_1", name: "Thù lao nghiên cứu trực tiếp cho các nhà khoa học", plannedAmount: Math.round(totalAmount * 0.35), actualAmount: Math.round(totalAmount * 0.15) },
        { code: "cat_2", name: "Thuê khoán chuyên môn & kiểm nghiệm độc lập", plannedAmount: Math.round(totalAmount * 0.15), actualAmount: Math.round(totalAmount * 0.05) },
        { code: "cat_3", name: "Hóa chất, sinh phẩm, vật tư tiêu hao, động vật thí nghiệm", plannedAmount: Math.round(totalAmount * 0.30), actualAmount: Math.round(totalAmount * 0.15) },
        { code: "cat_4", name: "Hội nghị, hội thảo khoa học & đi thực địa/dã chiến", plannedAmount: Math.round(totalAmount * 0.10), actualAmount: Math.round(totalAmount * 0.03) },
        { code: "cat_5", name: "Xuất bản bài báo, công bố quốc tế & đăng ký SHTT", plannedAmount: Math.round(totalAmount * 0.10), actualAmount: Math.round(totalAmount * 0.02) }
      ],
      updatedAt: new Date().toISOString()
    };

    return { proposalId, disbursement: defaultData };
  }

  async updateDisbursement(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    // PHÂN QUYỀN ĐẶC BIỆT: Chỉ Trưởng phòng KHQS, Giám Đốc và Trưởng Ban QLKH
    assertCanManageDisbursement(actor);

    const payload = {
      ...input,
      updatedAt: new Date().toISOString(),
      updatedById: actor.id,
      updatedByName: actor.displayName || actor.username
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: {
        disbursementMetadata: payload
      }
    });

    await this.notifications.createNotification({
      userId: proposal.ownerId,
      title: "Cập nhật giải ngân",
      message: `Thông tin giải ngân của đề tài ${proposal.code || proposal.title} vừa được cập nhật.`,
      type: "DISBURSEMENT_UPDATE",
      link: `/research-proposals/${proposalId}?tab=progress`,
      metadata: { proposalId }
    });

    await this.auditLog.record({
      action: "update-disbursement",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, disbursement: payload };
  }

  // =========================================================================================
  // PHÊ DUYỆT HỘI ĐỒNG ĐẠO ĐỨC Y SINH (IRB) (Strict RBAC)
  // =========================================================================================

  async getIRBInfo(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertCanReadEvaluation(actor, proposal);

    const existing = proposal.irbMetadata as Record<string, unknown> | null;
    if (existing) {
      return { proposalId, irb: existing };
    }

    const defaultIrb = {
      council: {
        status: "draft",
        members: []
      },
      reviews: [],
      certificate: null
    };

    return { proposalId, irb: defaultIrb };
  }

  async proposeIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertScientificManagementScope(actor, proposal);

    const members = Array.isArray(input.members) ? (input.members as Array<Record<string, unknown>>) : [];
    
    // Check conflicts
    for (const member of members) {
      const userId = typeof member.userId === "string" ? member.userId : "";
      if (userId) {
        const memConflict = await resolveActorConflict({ participation: this.participation, reviewAccess: this.reviewAccess }, userId, proposal.id);
        if (memConflict.conflicted) {
          throw new BadRequestException({
            message: `Thành viên ${member.displayName || userId} có xung đột lợi ích (${memConflict.reason}), không thể tham gia Hội đồng IRB.`
          });
        }
      }
    }

    const current = (proposal.irbMetadata as Record<string, unknown>) || {};
    const updated = {
      ...current,
      council: {
        ...(current.council as any || {}),
        status: "submitted",
        members,
        proposedAt: new Date().toISOString(),
        proposedById: actor.id,
        proposedByName: actor.displayName || actor.username,
        meetingDate: input.meetingDate || ""
      }
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await this.auditLog.record({
      action: "propose-irb-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
  }

  async approveIrbCouncil(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);

    const current = (proposal.irbMetadata as Record<string, unknown>) || {};
    const currentCouncil = (current.council as Record<string, unknown>) || {};

    if (currentCouncil.status !== "submitted") {
      throw new BadRequestException({ message: "Không thể phê duyệt hội đồng IRB chưa được trình." });
    }

    const updated = {
      ...current,
      council: {
        ...currentCouncil,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedById: actor.id,
        approvedByName: actor.displayName || actor.username
      }
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await this.auditLog.record({
      action: "approve-irb-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
  }

  async submitIrbReview(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    
    const current = (proposal.irbMetadata as Record<string, unknown>) || {};
    const council = (current.council as Record<string, unknown>) || {};
    const members = (council.members as Array<Record<string, unknown>>) || [];
    
    const isMember = members.some((m) => m.userId === actor.id);
    if (!isMember) {
      throw new BadRequestException({ message: "Bạn không phải là thành viên của Hội đồng IRB này." });
    }

    if (council.status !== "approved") {
      throw new BadRequestException({ message: "Hội đồng IRB chưa được phê duyệt, chưa thể nhận xét." });
    }

    const currentReviews = (current.reviews as Array<Record<string, unknown>>) || [];
    const existingReviewIndex = currentReviews.findIndex((r) => r.reviewerId === actor.id);

    const newReview = {
      reviewerId: actor.id,
      reviewerName: actor.displayName || actor.username,
      status: "submitted",
      comment: input.comment || "",
      recommendation: input.recommendation || "",
      submittedAt: new Date().toISOString()
    };

    if (existingReviewIndex >= 0) {
      currentReviews[existingReviewIndex] = newReview;
    } else {
      currentReviews.push(newReview);
    }

    const updated = {
      ...current,
      reviews: currentReviews
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await this.auditLog.record({
      action: "submit-irb-review",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
  }

  async updateIRBStatus(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    // PHÂN QUYỀN ĐẶC BIỆT: Chỉ Trưởng phòng KHQS, Giám Đốc và Trưởng Ban QLKH
    assertCanManageIRB(actor);

    const status = (input.status as string) || "APPROVED";
    const count = await this.prisma.researchProposal.count();
    const certificateNumber = (input.certificateNumber as string) || (status === "APPROVED" ? `IRB-HVQY-2026-${String(count + 20).padStart(3, "0")}` : null);

    const current = (proposal.irbMetadata as Record<string, unknown>) || {};

    const certificate = {
      status,
      certificateNumber,
      decisionDate: (input.decisionDate as string) || new Date().toISOString(),
      validUntil: (input.validUntil as string) || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      riskLevel: (input.riskLevel as string) || "CONTROLLED",
      targetSubjects: (input.targetSubjects as string) || "Bệnh nhân và đối tượng can thiệp y học",
      ethicsNotes: (input.ethicsNotes as string) || "Hội đồng Đạo đức trong nghiên cứu Y sinh học thông qua đề cương nghiên cứu.",
      approvedById: actor.id,
      approvedByName: actor.displayName || actor.username,
      updatedAt: new Date().toISOString()
    };

    const updated = {
      ...current,
      certificate
    };

    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await this.notifications.createNotification({
      userId: proposal.ownerId,
      title: "Hội đồng Y đức (IRB)",
      message: `Hồ sơ đạo đức của đề tài ${proposal.code || proposal.title} đã được cấp Giấy chứng nhận: ${status === "APPROVED" ? "Đã phê duyệt" : "Chưa phê duyệt"}.`,
      type: "IRB_UPDATE",
      link: `/research-proposals/${proposalId}?tab=irb`,
      metadata: { proposalId, status, certificateNumber }
    });

    await this.auditLog.record({
      action: "update-irb-status",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
  }
}
