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
  assertCanReadEvaluation,
  assertProposalStatus,
  assertScientificManagementScope,
  findEvaluationProposal,
  resolveActorConflict,
  updateProposalStatusGuarded,
  type EvaluationProposalRecord,
  type ProposalDecisionRecord
} from "./proposal-evaluation-support.js";
import { ProposalEvaluationSummaryService } from "./proposal-evaluation-summary.service.js";
import { ProposalReviewAssignmentsService } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService } from "./proposal-reviews.service.js";

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
    private readonly summaries: ProposalEvaluationSummaryService
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
      let conflictReason: string | undefined = undefined;

      if (p.linkedUserId) {
        const conflict = await resolveActorConflict(
          { participation: this.participation, reviewAccess: this.reviewAccess },
          p.linkedUserId,
          proposal.id
        );
        if (conflict.conflicted) {
          isConflicted = true;
          conflictReason = conflict.reason || "Có xung đột lợi ích với đề tài";
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
}
