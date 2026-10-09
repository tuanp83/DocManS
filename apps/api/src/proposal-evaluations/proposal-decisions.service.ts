import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { proposalContextVersion, runProposalMutation } from "../proposals-shared/proposal-mutation.js";
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
  resolveActorConflict,
  updateProposalStatusGuarded,
  type EvaluationProposalRecord,
  type ProposalDecisionRecord
} from "./proposal-evaluation-support.js";
import { ProposalEvaluationSummaryService } from "./proposal-evaluation-summary.service.js";
import { ProposalReviewAssignmentsService } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService } from "./proposal-reviews.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ACCEPTANCE_ELIGIBLE_PROPOSAL_STATUSES, assertAcceptanceStatus, readAcceptanceMembers, readAcceptanceScores, readAcceptanceStatus, readCouncilType, readOptionalDateText, readOptionalText, readResolution, type AcceptanceMemberInput } from "./acceptance-council.js";
import { computeDisbursementTotals, emptyDisbursement, readApprovedBudget, readDisbursementInput, stampMilestoneDates, type DisbursementRecord } from "./disbursement.js";

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

  /**
   * Council, acceptance-council and IRB data are read-modify-write JSON on the proposal row. Each write
   * runs in one serializable transaction with that row locked (`runProposalMutation`): the caller's
   * contextVersion is verified when sent, the proposal and the caller's account are re-read inside the
   * lock, and metadata plus audit commit together. Concurrent writers therefore serialize instead of
   * silently overwriting each other. The response carries the proposal's new contextVersion.
   */
  private async mutateEvaluationMetadata<T extends Record<string, unknown>>(
    actor: SafeUserContext,
    proposalId: string,
    input: Record<string, unknown> | undefined,
    work: (context: { tx: PrismaService; actor: SafeUserContext; proposal: EvaluationProposalRecord; auditLog: AuditLogService }) => Promise<T>
  ) {
    // A serialization conflict (another writer committed first) is retried up to 3 times. Each retry
    // re-checks the caller's contextVersion: a client that sent one and whose record really changed
    // still gets 409 and must reload; a client that sent none, or whose conflict was only on a shared
    // counter row, succeeds without seeing the conflict. The work is fully transactional, so a retry
    // never repeats a side effect.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await runProposalMutation(this.prisma, actor, proposalId, input?.contextVersion, async (tx, currentActor) => {
          const proposal = await findEvaluationProposal(tx, proposalId);
          const auditLog = this.auditLog instanceof AuditLogService ? new AuditLogService(tx) : this.auditLog;
          const result = await work({ tx, actor: currentActor, proposal, auditLog });
          const updated = await findEvaluationProposal(tx, proposalId);
          return { ...result, contextVersion: proposalContextVersion(updated as never) };
        });
      } catch (error) {
        if (!(error as { serializationFailure?: boolean }).serializationFailure || attempt >= MAX_SERIALIZATION_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 40) * (attempt + 1)));
      }
    }
  }

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
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await auditLog.record({
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
    });
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
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    {
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
    }

    await auditLog.record({
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
    });
  }

  /**
   * Stage 1: Leadership requests adjustments or returns Council proposal to staff.
   */
  async rejectCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await auditLog.record({
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
    });
  }

  /**
   * Stage 2: Staff or Council Secretary records the official evaluation minutes & conclusion.
   */
  async recordCouncilMinutes(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { councilMetadata: updatedCouncil as any }
    });

    await auditLog.record({
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
    });
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
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      assertScientificManagementScope(actor, proposal);
      assertProposalStatus(proposal, ACCEPTANCE_ELIGIBLE_PROPOSAL_STATUSES, "Chỉ đề tài đã được phê duyệt và đang thực hiện mới được lập hội đồng nghiệm thu.");
      const current = (proposal.acceptanceCouncilMetadata as Record<string, unknown> | null) ?? null;
      // Được đề xuất lại (sửa danh sách) khi hội đồng chưa được lãnh đạo thành lập.
      assertAcceptanceStatus(readAcceptanceStatus(current), ["NONE", "PROPOSED"], "đề xuất hội đồng nghiệm thu");

      const requested = readAcceptanceMembers(input.members);
      const members = await this.resolveAcceptanceMembers(tx, proposal, requested);

      const acceptanceCouncil = {
        status: "PROPOSED" as const,
        councilType: readCouncilType(input.councilType ?? input.acceptanceType),
        proposedAt: new Date().toISOString(),
        proposedById: actor.id,
        proposedByName: actor.displayName || actor.username,
        meetingDate: readOptionalDateText(input.meetingDate, "Ngày họp"),
        meetingLocation: readOptionalText(input.meetingLocation, "Địa điểm họp", 300),
        tentativeAgenda: readOptionalText(input.tentativeAgenda, "Chương trình dự kiến", 2000),
        members
      };

      await tx.researchProposal.update({
        where: { id: proposalId },
        data: { acceptanceCouncilMetadata: acceptanceCouncil as never }
      });

      await auditLog.record({
        action: "propose-acceptance-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        beforeFacts: current ? { acceptanceCouncil: current } : undefined,
        afterFacts: { acceptanceCouncil }
      });

      return { success: true, acceptanceCouncil };
    });
  }

  /**
   * Thành viên hội đồng được xác định từ hồ sơ nhà khoa học trong cơ sở dữ liệu (tên, học hàm, đơn vị
   * lấy từ hồ sơ, không tin dữ liệu hiển thị do trình duyệt gửi). Hồ sơ phải đang hoạt động, và chủ
   * nhiệm hoặc thành viên đề tài không được ngồi trong hội đồng nghiệm thu chính đề tài đó.
   */
  private async resolveAcceptanceMembers(tx: PrismaService, proposal: { id: string; ownerId: string }, requested: AcceptanceMemberInput[]) {
    const profiles = (await tx.researcherProfile.findMany({
      where: { id: { in: requested.map((member) => member.profileId) } },
      select: { id: true, fullName: true, title: true, status: true, linkedUserId: true, managementOrganizationUnit: { select: { name: true } } }
    } as never)) as unknown as Array<{ id: string; fullName: string; title: string | null; status: string; linkedUserId: string | null; managementOrganizationUnit: { name: string } | null }>;
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));

    const teamUserIds = new Set<string>([proposal.ownerId]);
    const team = (await tx.proposalMember.findMany({ where: { proposalId: proposal.id, status: "ACTIVE" }, select: { userId: true } } as never)) as unknown as Array<{ userId: string | null }>;
    for (const member of team) if (member.userId) teamUserIds.add(member.userId);

    return requested.map((member) => {
      const profile = byId.get(member.profileId);
      if (!profile || profile.status !== "ACTIVE") {
        throw new BadRequestException({ code: "ACCEPTANCE_INVALID", message: "Có thành viên hội đồng không tồn tại hoặc hồ sơ đã ngừng hoạt động." });
      }
      if (profile.linkedUserId && teamUserIds.has(profile.linkedUserId)) {
        throw new ForbiddenException({ code: "CONFLICT_DENIED", message: `${profile.fullName} là chủ nhiệm hoặc thành viên đề tài nên không thể tham gia hội đồng nghiệm thu.` });
      }
      return {
        profileId: profile.id,
        fullName: profile.fullName,
        academicTitle: profile.title ?? undefined,
        unit: profile.managementOrganizationUnit?.name ?? undefined,
        userId: profile.linkedUserId ?? undefined,
        role: member.role
      };
    });
  }

  async approveAcceptanceCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    try {
      return await this.approveAcceptanceCouncilInTransaction(actor, proposalId, input);
    } catch (error) {
      // The partial unique index is the backstop if two proposals race for the same manual number.
      if ((error as { code?: string }).code === "P2002") throw documentNumberTaken(ACCEPTANCE_DECISION_NUMBER);
      throw error;
    }
  }

  private async approveAcceptanceCouncilInTransaction(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
    assertApprovalAuthority(actor);

    const current = (proposal.acceptanceCouncilMetadata as Record<string, unknown>) || {};
    // Chỉ thành lập hội đồng đã được đề xuất (hoặc ký lại quyết định của hội đồng đã thành lập, giữ
    // nguyên số); không thành lập lại khi hội đồng đã họp và có kết quả nghiệm thu.
    assertAcceptanceStatus(readAcceptanceStatus(current), ["PROPOSED", "ESTABLISHED"], "thành lập hội đồng nghiệm thu");
    const requestedNumber = typeof input.decisionNumber === "string" ? input.decisionNumber.trim() : "";
    if (requestedNumber.length > 100) {
      throw new BadRequestException({ message: "Số quyết định không được vượt quá 100 ký tự." });
    }
    const decisionDate = (input.decisionDate as string) || new Date().toISOString();
    const decisionNumber = await this.resolveDocumentNumber(tx, ACCEPTANCE_DECISION_NUMBER, proposalId, {
      requested: requestedNumber,
      previous: typeof current.decisionNumber === "string" ? current.decisionNumber : "",
      decisionDate
    });

    const updated = {
      ...current,
      status: "ESTABLISHED",
      approvedAt: new Date().toISOString(),
      approvedById: actor.id,
      approvedByName: actor.displayName || actor.username,
      decisionNumber,
      decisionDate
    };

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: {
        acceptanceCouncilMetadata: updated
      }
    });

    await auditLog.record({
      action: "approve-acceptance-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username,
      reason: JSON.stringify({ proposalId, decisionNumber })
    });

    return { success: true, acceptanceCouncil: updated };
    });
  }

  async recordAcceptanceMinutes(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      assertScientificManagementScope(actor, proposal);

      const current = (proposal.acceptanceCouncilMetadata as Record<string, unknown>) || {};
      // Biên bản chỉ ghi cho hội đồng đã được thành lập, và chỉ một lần: kết quả đã có không bị ghi đè.
      assertAcceptanceStatus(readAcceptanceStatus(current), ["ESTABLISHED"], "ghi biên bản nghiệm thu");

      // Điểm là bắt buộc — không còn điểm mặc định (trước đây thiếu điểm sẽ tự thành 93 "Xuất sắc").
      const evaluationResult = {
        ...readAcceptanceScores(input),
        assessmentComments: readOptionalText(input.assessmentComments, "Nhận xét của hội đồng", 4000)
      };

      const updated = {
        ...current,
        status: "EVALUATED",
        completedAt: new Date().toISOString(),
        completedById: actor.id,
        completedByName: actor.displayName || actor.username,
        meetingDate: readOptionalDateText(input.meetingDate, "Ngày họp") ?? current.meetingDate ?? null,
        meetingLocation: readOptionalText(input.meetingLocation, "Địa điểm họp", 300) || current.meetingLocation || "",
        evaluationResult,
        resolution: readResolution(input.resolution, evaluationResult.classification),
        minutesNotes: readOptionalText(input.minutesNotes, "Ghi chú biên bản", 4000)
      };

      await tx.researchProposal.update({
        where: { id: proposalId },
        data: { acceptanceCouncilMetadata: updated as never }
      });

      await auditLog.record({
        action: "record-acceptance-minutes",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        afterFacts: { evaluationResult, resolution: updated.resolution }
      });

      return { success: true, acceptanceCouncil: updated };
    });
  }

  // =========================================================================================
  // MODULE GIÁM SÁT GIẢI NGÂN & QUYẾT TOÁN THEO MỐC (Strict RBAC)
  // =========================================================================================

  async getDisbursement(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertCanReadEvaluation(actor, proposal);

    const totalBudget = readApprovedBudget(proposal.budgetMetadata);
    const existing = proposal.disbursementMetadata as Record<string, unknown> | null;
    // Chưa có dữ liệu thì trả về bản trống (không bịa mốc hay số tiền mặc định).
    const disbursement = existing ? { ...emptyDisbursement(totalBudget), ...existing, totalBudget } : emptyDisbursement(totalBudget);
    return { success: true, proposalId, disbursement, contextVersion: proposalContextVersion(proposal as never) };
  }

  /**
   * Cập nhật giải ngân & quyết toán. Chỉ các trường đã kiểm tra (readDisbursementInput) được lưu; tổng
   * tiền do máy chủ tính. Ghi trong transaction có contextVersion như các thao tác hội đồng/IRB, và mỗi
   * lần ghi để lại bản trước/sau trong audit log (append-only) nên không mất lịch sử khi ghi đè JSON.
   */
  async updateDisbursement(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    let notice: { ownerId: string; label: string } | null = null;

    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      // Lãnh đạo Học viện, hoặc cán bộ QLKH có phạm vi đơn vị chủ trì của hồ sơ.
      assertCanManageDisbursement(actor, proposal);

      const totalBudget = readApprovedBudget(proposal.budgetMetadata);
      const previous = (proposal.disbursementMetadata as Record<string, unknown> | null) ?? null;
      const accepted = readDisbursementInput(input, totalBudget);
      const milestones = stampMilestoneDates(accepted.milestones, previous);
      const totals = computeDisbursementTotals(milestones, accepted.costItems);

      const disbursement: DisbursementRecord = {
        ...accepted,
        milestones,
        totalBudget,
        ...totals,
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedById: actor.id,
        lastUpdatedBy: actor.displayName || actor.username
      };

      await tx.researchProposal.update({
        where: { id: proposalId },
        data: { disbursementMetadata: disbursement as never }
      });

      await auditLog.record({
        action: "update-disbursement",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        beforeFacts: previous ? { disbursement: previous } : undefined,
        afterFacts: { disbursement }
      });

      notice = { ownerId: proposal.ownerId, label: proposal.code || proposal.title };
      return { success: true, proposalId, disbursement };
    });

    // Thông báo chỉ gửi sau khi dữ liệu đã commit.
    const committed = notice as { ownerId: string; label: string } | null;
    if (committed) {
      await this.notifications.createNotification({
        userId: committed.ownerId,
        title: "Cập nhật giải ngân",
        message: `Thông tin giải ngân của đề tài ${committed.label} vừa được cập nhật.`,
        type: "DISBURSEMENT_UPDATE",
        link: `/research-proposals/${proposalId}?tab=progress`,
        metadata: { proposalId }
      });
    }

    return result;
  }

  // =========================================================================================
  // PHÊ DUYỆT HỘI ĐỒNG ĐẠO ĐỨC Y SINH (IRB) (Strict RBAC)
  // =========================================================================================

  async getIRBInfo(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertCanReadEvaluation(actor, proposal);

    const existing = proposal.irbMetadata as Record<string, unknown> | null;
    const contextVersion = proposalContextVersion(proposal as never);
    if (existing) {
      return { proposalId, irb: existing, contextVersion };
    }

    const defaultIrb = {
      council: {
        status: "draft",
        members: []
      },
      reviews: [],
      certificate: null
    };

    return { proposalId, irb: defaultIrb, contextVersion };
  }

  async proposeIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await auditLog.record({
      action: "propose-irb-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
    });
  }

  async approveIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await auditLog.record({
      action: "approve-irb-council",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
    });
  }

  async submitIrbReview(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
    const current = (proposal.irbMetadata as Record<string, unknown>) || {};
    const council = (current.council as Record<string, unknown>) || {};
    const members = (council.members as Array<Record<string, unknown>>) || [];
    
    const isMember = members.some((m) => m.userId === actor.id);
    if (!isMember) {
      // Authority failure, not invalid input: only members of this IRB council may review.
      throw new ForbiddenException({ message: "Bạn không phải là thành viên của Hội đồng IRB này." });
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

    await tx.researchProposal.update({
      where: { id: proposalId },
      data: { irbMetadata: updated as any }
    });

    await auditLog.record({
      action: "submit-irb-review",
      result: "success",
      actorId: actor.id,
      targetEntity: "proposal",
      targetEntityId: proposalId,
      username: actor.username
    });

    return { success: true, irb: updated };
    });
  }

  async updateIRBStatus(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const status = typeof input.status === "string" && input.status ? input.status : "APPROVED";
    if (status !== "APPROVED" && status !== "REJECTED") {
      throw new BadRequestException({ message: "Trạng thái chứng nhận IRB không hợp lệ." });
    }
    const requestedNumber = typeof input.certificateNumber === "string" ? input.certificateNumber.trim() : "";
    if (requestedNumber.length > 100) {
      throw new BadRequestException({ message: "Số giấy chứng nhận IRB không được vượt quá 100 ký tự." });
    }

    let notice: { ownerId: string; label: string; certificateNumber: string | null } | null = null;
    let result;
    try {
      result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
        // Lãnh đạo Học viện, hoặc cán bộ QLKH có phạm vi đơn vị chủ trì của hồ sơ.
        assertCanManageIRB(actor, proposal);

        const current = (proposal.irbMetadata as Record<string, unknown>) || {};
        const previous = (current.certificate as Record<string, unknown> | null | undefined) ?? null;
        const decisionDate = (input.decisionDate as string) || new Date().toISOString();
        // Re-issuing an approval keeps the proposal's number; a rejection without a number stores none.
        const certificateNumber = await this.resolveDocumentNumber(tx, IRB_CERTIFICATE_NUMBER, proposalId, {
          requested: requestedNumber,
          previous: status === "APPROVED" && typeof previous?.certificateNumber === "string" ? previous.certificateNumber : "",
          decisionDate,
          generate: status === "APPROVED"
        });

        const certificate = {
          status,
          certificateNumber,
          decisionDate,
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

        await tx.researchProposal.update({
          where: { id: proposalId },
          data: { irbMetadata: updated as any }
        });

        await auditLog.record({
          action: "update-irb-status",
          result: "success",
          actorId: actor.id,
          targetEntity: "proposal",
          targetEntityId: proposalId,
          username: actor.username,
          reason: JSON.stringify({ proposalId, status, certificateNumber })
        });

        notice = { ownerId: proposal.ownerId, label: proposal.code || proposal.title, certificateNumber };
        return { success: true, irb: updated };
      });
    } catch (error) {
      // The partial unique index is the backstop if two proposals race for the same manual number.
      if ((error as { code?: string }).code === "P2002") throw documentNumberTaken(IRB_CERTIFICATE_NUMBER);
      throw error;
    }

    // Notify only after the certificate is committed, never for a rolled-back attempt.
    const committed = notice as { ownerId: string; label: string; certificateNumber: string | null } | null;
    if (committed) {
      await this.notifications.createNotification({
        userId: committed.ownerId,
        title: "Hội đồng Y đức (IRB)",
        message: `Hồ sơ đạo đức của đề tài ${committed.label} đã được cấp Giấy chứng nhận: ${status === "APPROVED" ? "Đã phê duyệt" : "Chưa phê duyệt"}.`,
        type: "IRB_UPDATE",
        link: `/research-proposals/${proposalId}?tab=irb`,
        metadata: { proposalId, status, certificateNumber: committed.certificateNumber }
      });
    }

    return result;
  }

  /**
   * System-issued document numbers are unique across proposals. An explicitly entered number, or the
   * proposal's own previous number, must not belong to another proposal (409). Otherwise the next
   * number of the decision year is taken from `document_number_counters` inside this transaction —
   * never from a row count, which repeats — so numbering restarts at 001 each year and a rolled-back
   * write leaves no gap or duplicate. The partial unique indexes are the final backstop.
   */
  private async resolveDocumentNumber(
    tx: PrismaService,
    kind: DocumentNumberKind,
    proposalId: string,
    options: { requested: string; previous: string; decisionDate: string; generate?: boolean }
  ): Promise<string | null> {
    const chosen = options.requested || options.previous.trim();
    if (chosen) {
      if (await this.isDocumentNumberTaken(tx, kind, proposalId, chosen)) throw documentNumberTaken(kind);
      return chosen;
    }
    if (options.generate === false) return null;

    const parsed = new Date(options.decisionDate);
    const year = Number.isNaN(parsed.valueOf()) ? new Date().getFullYear() : parsed.getFullYear();
    // A manually entered number may already occupy the next slot; skip past it.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [row] = await tx.$queryRaw<Array<{ value: number }>>`
        INSERT INTO document_number_counters (scope, year, last_value) VALUES (${kind.scope}, ${year}, 1)
        ON CONFLICT (scope, year) DO UPDATE SET last_value = document_number_counters.last_value + 1
        RETURNING last_value AS value`;
      const candidate = kind.format(year, String(row.value).padStart(3, "0"));
      if (!(await this.isDocumentNumberTaken(tx, kind, proposalId, candidate))) return candidate;
    }
    throw documentNumberTaken(kind);
  }

  private async isDocumentNumberTaken(tx: PrismaService, kind: DocumentNumberKind, proposalId: string, number: string) {
    const rows = kind === IRB_CERTIFICATE_NUMBER
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM research_proposals
          WHERE id <> ${proposalId} AND irb_metadata->'certificate'->>'certificateNumber' = ${number}
          LIMIT 1`
      : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM research_proposals
          WHERE id <> ${proposalId} AND acceptance_council_metadata->>'decisionNumber' = ${number}
          LIMIT 1`;
    return rows.length > 0;
  }
}

type DocumentNumberKind = { scope: string; format: (year: number, sequence: string) => string; takenCode: string; takenMessage: string };

const MAX_SERIALIZATION_RETRIES = 3;

const IRB_CERTIFICATE_NUMBER: DocumentNumberKind = {
  scope: "irb-certificate",
  format: (year, sequence) => `IRB-HVQY-${year}-${sequence}`,
  takenCode: "IRB_CERTIFICATE_NUMBER_TAKEN",
  takenMessage: "Số giấy chứng nhận IRB đã được dùng cho hồ sơ khác."
};

const ACCEPTANCE_DECISION_NUMBER: DocumentNumberKind = {
  scope: "acceptance-council-decision",
  format: (year, sequence) => `${sequence}/QĐ-HVQY-NT/${year}`,
  takenCode: "ACCEPTANCE_DECISION_NUMBER_TAKEN",
  takenMessage: "Số quyết định thành lập Hội đồng nghiệm thu đã được dùng cho hồ sơ khác."
};

function documentNumberTaken(kind: DocumentNumberKind) {
  return new ConflictException({ code: kind.takenCode, message: kind.takenMessage });
}
