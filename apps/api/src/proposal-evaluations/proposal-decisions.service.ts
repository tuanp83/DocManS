import { assertCurrentCompletenessEvidence, currentRoundAssignments, currentRoundReviews, sameEvidenceIds } from "../proposals-shared/submission-evidence.js";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { councilCompositionProblems, councilMetadataProblems, councilMetadataRoleToAssignmentRole, councilRoleOf } from "../proposals-shared/evaluation-council-rules.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { proposalContextVersion, runProposalMutation } from "../proposals-shared/proposal-mutation.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalParticipationService } from "../research-proposals/proposal-participation.service.js";
import { DECIDABLE_STATUSES, PROPOSAL_STATUS, PROPOSAL_STATUS_LABELS } from "../proposals-shared/proposal-workflow.js";
import {
  assertApprovalAuthority,
  assertCouncilSigningAuthority,
  assertCanReadEvaluation,
  assertEvaluationCoordinator,
  isEvaluationCoordinator,
  assertProposalStatus,
  findEvaluationProposal,
  resolveActorConflict,
  updateProposalStatusGuarded,
  type EvaluationProposalRecord,
  type ProposalDecisionRecord
} from "./proposal-evaluation-support.js";
import { ProposalEvaluationSummaryService } from "./proposal-evaluation-summary.service.js";
import { ProposalReviewAssignmentsService, retireStaleOpenAssignments } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService, REVIEW_SUBMITTED_NOTE } from "./proposal-reviews.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { label, NOTIFICATION_TYPES, proposalLink, researchManagersInScope, type WorkflowEvent } from "../notifications/workflow-events.js";
import { councilEstablishedEvent, irbCouncilEstablishedEvent, irbInvitationEvent, irbInvitationResponseEvent, irbStaffEvent, reviewInvitationEvent } from "./evaluation-notifications.js";
import {
  IRB_DECISIONS,
  IRB_MEMBER_STATUS,
  IRB_MEMBER_STATUS_LABELS,
  IRB_RECOMMENDATION_LABELS,
  IRB_RISK_LEVELS,
  IRB_ROLE_LABELS,
  irbCompositionProblems,
  readIrbConclusionInput,
  readIrbMembers,
  readIrbReasonInput,
  readIrbReviewInput,
  readIrbSignInput,
  readProposeIrbCouncilInput,
  type IrbMemberInput,
  type IrbMemberRole
} from "./irb-council.js";
import { isAcademyLeadership } from "../proposals-shared/proposal-access.js";
import { APPROVAL_KINDS, assertReadyForLeadership, boardReviewEvent, closeApprovalSubmission, openApprovalSubmission } from "../proposals-shared/approval-routing.js";
import { readApproveCouncilInput, readCouncilMembers, readCouncilMinutesInput, readProposeCouncilInput, readRejectCouncilInput, type CouncilMemberInput } from "./council-input.js";
import { isRoundActiveStatus } from "../proposals-shared/proposal-review-access.js";
import { positionDisplay } from "../organization/unit-positions.js";

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
/** Hồ sơ được duyệt/điều chỉnh kinh phí ở các trạng thái này (đã duyệt: chỉ khi chưa lập đề tài). */
const BUDGET_APPROVABLE_STATUSES: string[] = [PROPOSAL_STATUS.readyForApproval, PROPOSAL_STATUS.approved];
/** Trần hạn mức kinh phí một đề tài (VND), chặn số nhập nhầm. */
const MAX_APPROVED_BUDGET_VND = 1_000_000_000_000;

function readApprovedBudget(value: unknown) {
  const amount = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_APPROVED_BUDGET_VND) {
    throw new BadRequestException({ message: "Mức kinh phí phê duyệt phải là số nguyên VND từ 0 đến 1.000 tỷ." });
  }
  return amount;
}

function readIsoDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException({ message: `${field} không phải ngày hợp lệ.` });
  }
  return new Date(value).toISOString();
}

function readOptionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new BadRequestException({ message: `${field} phải là văn bản tối đa ${maxLength} ký tự.` });
  }
  return value.trim() || null;
}

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
    private readonly notifications?: NotificationsService
  ) {}

  /** Thông báo sau khi giao dịch đã commit; lỗi thông báo không làm hỏng thao tác. */
  private async notifyAfterCommit(build: () => Promise<WorkflowEvent[]> | WorkflowEvent[]) {
    if (!this.notifications) return;
    try {
      await this.notifications.dispatch(await build());
    } catch {
      // Thông báo là phụ trợ.
    }
  }

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

  /**
   * AC-ST-3.5-01 — everything the authority needs in one authority-scoped read model.
   * Lãnh đạo nhận bản tổng hợp đã trình và số liệu chung của vòng đánh giá; danh tính người phản biện, điểm và
   * nhận xét từng phiếu được bảo mật (mang từ thanhdotien278/DocManS). `packageRevision` là phiên bản gói phải
   * gửi kèm khi quyết định.
   */
  async getDecisionPackage(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    assertApprovalAuthority(actor);
    // Same workflow gate as `canReadProposal`: a draft belongs to its owner, so the decision package
    // must not become a side channel that reports an unsubmitted proposal's existence.
    await assertCanReadEvaluation(this.prisma, actor, proposal);

    const [round, summary, decisions, attachments, history] = await Promise.all([
      this.assignments.findCurrentRound(proposal),
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
    const { pendingReviewers: _pendingReviewers, ...progress } = this.summaries.summarizeProgress(round.assignments, round.reviews);
    const reviewerIds = new Set(round.allAssignments.map((assignment) => assignment.reviewerUserId));

    return {
      proposalId,
      proposalStatus: proposal.status,
      proposalStatusLabel: PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status,
      title: proposal.title,
      code: proposal.code,
      proposalTypeCode: proposal.proposalTypeCode,
      researchFieldCode: proposal.researchFieldCode,
      budgetMetadata: proposal.budgetMetadata,
      canDecide: (DECIDABLE_STATUSES as string[]).includes(proposal.status) && !conflict.conflicted && summary?.status === "ready_for_approval",
      conflict,
      progress,
      reviews: [],
      disclosure: { protectedReviewData: "REDACTED" },
      evaluationSummary: this.summaries.toSummaryResponse(summary),
      packageRevision: summary?.revision ?? 0,
      decisions: decisions.map((decision) => this.toDecisionResponse(decision)),
      attachmentCount: (attachments as unknown[]).length,
      history: (
        history as Array<{
          id: string;
          actorId?: string | null;
          fromStatus: string;
          toStatus: string;
          submittedAt: Date;
          note: string | null;
          snapshot?: unknown;
          actor?: { displayName: string } | null;
        }>
      ).filter((event) => !(event.snapshot as { backfilledFrom?: unknown } | null | undefined)?.backfilledFrom).map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        submittedAt: event.submittedAt.toISOString(),
        // Không lộ danh tính người phản biện qua lịch sử gửi phiếu.
        actorDisplayName: event.note === REVIEW_SUBMITTED_NOTE && event.actorId && reviewerIds.has(event.actorId) ? "Người đánh giá" : event.actor?.displayName ?? "",
        note: event.note ?? ""
      }))
    };
  }

  /**
   * AC-ST-3.5-02. Status, decision record, history and audit are written in one transaction.
   * Khoá phiên bản gói: quyết định chỉ hợp lệ khi bản tổng hợp đã trình còn đúng `packageRevision` lãnh đạo đã xem,
   * bằng chứng gói (đã chốt) vẫn khớp lần nộp, danh sách phân công và phiếu hiện tại.
   */
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

    const packageRevision = Number(input.packageRevision);
    if (!Number.isInteger(packageRevision) || packageRevision < 1) {
      throw new BadRequestException({ code: "PACKAGE_CONTEXT_MISMATCH", message: "Thiếu phiên bản gói đánh giá. Vui lòng tải lại trước khi quyết định." });
    }
    const note = this.readNote(input.note, { required: decision === PROPOSAL_DECISIONS.rejected });
    const hasBudget = decision === PROPOSAL_DECISIONS.approved && input.approvedBudget !== undefined && input.approvedBudget !== null && input.approvedBudget !== "";
    const decidedBudget = hasBudget ? readApprovedBudget(input.approvedBudget) : null;
    const toStatus = DECISION_TARGET_STATUS[decision];
    const decidedAt = new Date();

    const created = (await this.prisma.$transaction(async (tx) => {
      // Khoá hồ sơ rồi đối chiếu gói trong cùng giao dịch: không ai sửa, mở lại hay trình lại gói giữa lúc kiểm tra và ghi.
      await tx.$queryRaw`SELECT id FROM research_proposals WHERE id = ${proposalId} FOR UPDATE`;
      const packageSnapshot = await this.assertDecidablePackage(tx as unknown as PrismaService, proposal, packageRevision);
      // Gói phê duyệt phải đã qua Trưởng ban QLKH và Trưởng phòng KHQS (trừ gói trình trước khi có luồng này).
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.decisionPackage, subjectType: "proposal", subjectId: proposalId });

      // Conditional on the status we validated, so two authorities deciding at once cannot both win.
      await updateProposalStatusGuarded(tx, proposalId, proposal.status, toStatus);
      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.decisionPackage, subjectType: "proposal", subjectId: proposalId }, decision === PROPOSAL_DECISIONS.approved ? "APPROVED" : "REJECTED");

      // If approved, leadership can specify or adjust the approved budget
      if (decidedBudget !== null) {
        const currentBudget = (proposal.budgetMetadata as Record<string, unknown>) || {};
        const updatedBudget = {
          ...currentBudget,
          amount: decidedBudget,
          approvedAmount: decidedBudget,
          note: typeof input.budgetNote === "string" && input.budgetNote.trim() ? input.budgetNote.trim() : (currentBudget.note as string)
        };
        await tx.researchProposal.update({
          where: { id: proposalId },
          data: { budgetMetadata: updatedBudget }
        });
      }

      const record = (await tx.proposalDecision.create({
        data: {
          proposalId,
          decision,
          note,
          decidedById: actor.id,
          decidedAt,
          fromStatus: proposal.status,
          toStatus,
          packageRevision,
          contextVersion: (input.contextVersion ?? null) as never,
          packageSnapshot: packageSnapshot as never
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
          snapshot: { kind: "proposal_decision", schemaVersion: "proposal-decision-evidence.v1", decision, packageRevision, packageSnapshot },
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
          reason: JSON.stringify({ proposalId, decision, fromStatus: proposal.status, toStatus, packageRevision, hasNote: Boolean(note) })
        }
      });

      return record;
    })) as unknown as ProposalDecisionRecord;

    await this.notifyAfterCommit(async () => {
      const members = (await this.prisma.proposalMember.findMany({ where: { proposalId, status: "ACTIVE" }, select: { userId: true } } as never).catch(() => [])) as unknown as Array<{ userId: string | null }>;
      const approved = decision === PROPOSAL_DECISIONS.approved;
      const managers = approved ? await researchManagersInScope(this.prisma as never, proposal.hostOrganizationUnitId) : [];
      const name = label(proposal);
      return [
        {
          type: NOTIFICATION_TYPES.proposalDecision,
          userIds: [proposal.ownerId, ...members.map((member) => member.userId)],
          excludeUserIds: [actor.id],
          title: approved ? `Đề tài được phê duyệt: ${proposal.title}` : `Đề tài không được phê duyệt: ${proposal.title}`,
          message: approved
            ? `Lãnh đạo Học viện đã phê duyệt hồ sơ ${name}. Phòng Quản lý khoa học sẽ lập đề tài và phân công chuyên viên phụ trách.`
            : `Lãnh đạo Học viện không phê duyệt hồ sơ ${name}.${note ? ` Lý do: ${note}` : ""}`,
          link: proposalLink(proposalId),
          metadata: { proposalId, decision, decisionId: created.id }
        },
        ...(approved ? [{
          type: NOTIFICATION_TYPES.proposalDecision,
          userIds: managers,
          excludeUserIds: [actor.id, proposal.ownerId],
          title: `Cần lập đề tài: ${proposal.title}`,
          message: `Hồ sơ ${name} đã được phê duyệt. Vui lòng lập đề tài thực hiện; Trưởng phòng hoặc Trưởng ban QLKH giao chuyên viên phụ trách.`,
          link: proposalLink(proposalId),
          metadata: { proposalId, decision, decisionId: created.id }
        }] : [])
      ];
    });

    return {
      decision: this.toDecisionResponse(created),
      proposalStatus: toStatus,
      proposalStatusLabel: PROPOSAL_STATUS_LABELS[toStatus] ?? toStatus
    };
  }

  /** Gói đánh giá đủ điều kiện quyết định trên đúng phiên bản; trả về bản chụp bằng chứng để lưu cùng quyết định. */
  private async assertDecidablePackage(client: PrismaService, proposal: EvaluationProposalRecord, packageRevision: number) {
    const mismatch = () => new BadRequestException({ code: "PACKAGE_CONTEXT_MISMATCH", message: "Gói đánh giá đã thay đổi so với bản bạn đang xem. Vui lòng tải lại trước khi quyết định." });
    const summary = (await client.proposalEvaluationSummary.findFirst({ where: { proposalId: proposal.id } })) as { status: string; revision?: number; evidenceSnapshot?: unknown } | null;
    if (!summary || summary.status !== "ready_for_approval") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hồ sơ chưa có gói đánh giá đã trình lãnh đạo." });
    if ((summary.revision ?? 0) !== packageRevision) throw mismatch();
    const evidence = await assertCurrentCompletenessEvidence(client, proposal);
    const snapshot = summary.evidenceSnapshot as Record<string, unknown> | null | undefined;
    const assignments = await client.proposalReviewAssignment.findMany({ where: { proposalId: proposal.id } });
    const reviews = await client.proposalReview.findMany({ where: { proposalId: proposal.id } });
    const roundAssignments = currentRoundAssignments(assignments as never[], evidence.eventId) as unknown as Parameters<ProposalEvaluationSummaryService["summarizeProgress"]>[0];
    const roundReviews = currentRoundReviews(reviews as never[], roundAssignments as never[], evidence.eventId) as unknown as Parameters<ProposalEvaluationSummaryService["summarizeProgress"]>[1];
    if (!snapshot || snapshot.lifecycle !== "finalized" || snapshot.submissionEventId !== evidence.eventId || !sameEvidenceIds(snapshot, roundAssignments, roundReviews)) throw mismatch();
    // Gói được migration tạo cho hồ sơ đã trình theo quy định cũ (backfilled) không bị chặn bởi quy tắc thành phần
    // hội đồng mới; gói mới luôn đã qua kiểm tra này khi chốt và khi trình.
    if (snapshot.backfilled !== true && !this.summaries.summarizeProgress(roundAssignments, roundReviews).allReviewsSubmitted) throw mismatch();
    return snapshot;
  }

  async findDecisions(proposalId: string) {
    return (await this.prisma.proposalDecision.findMany({
      where: { proposalId },
      orderBy: { decidedAt: "asc" },
      include: { decidedBy: { select: { displayName: true } } }
    })) as ProposalDecisionRecord[];
  }

  /**
   * Lãnh đạo duyệt hoặc điều chỉnh hạn mức kinh phí. Chỉ khi hồ sơ đang chờ phê duyệt, hoặc đã được phê
   * duyệt nhưng chưa lập đề tài (sau đó kinh phí quản lý trong mục Kinh phí của đề tài). Ghi trong giao dịch
   * có khoá hồ sơ (kiểm tra contextVersion nếu gửi kèm); người có xung đột lợi ích không được duyệt.
   */
  async approveBudget(
    actor: SafeUserContext,
    proposalId: string,
    input: { approvedBudget: number; budgetNote?: string; contextVersion?: unknown }
  ) {
    const approvedAmount = readApprovedBudget(input.approvedBudget);
    return this.mutateEvaluationMetadata(actor, proposalId, input as Record<string, unknown>, async ({ tx, actor, proposal, auditLog }) => {
      assertApprovalAuthority(actor);
      if (!BUDGET_APPROVABLE_STATUSES.includes(proposal.status)) {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ duyệt kinh phí khi hồ sơ đang chờ phê duyệt hoặc đã được phê duyệt." });
      }
      // Khi hồ sơ còn chờ phê duyệt, gói phải đã qua Phòng KHQS (Trưởng ban, Trưởng phòng) mới được duyệt kinh phí.
      if (proposal.status === PROPOSAL_STATUS.readyForApproval) {
        await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.decisionPackage, subjectType: "proposal", subjectId: proposalId });
      }
      const projects = (tx as unknown as { approvedProject?: { findFirst: (args: unknown) => Promise<unknown> } }).approvedProject;
      if (proposal.status === PROPOSAL_STATUS.approved && projects && (await projects.findFirst({ where: { proposalId }, select: { id: true } }))) {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Đề tài đã được lập; kinh phí được quản lý trong mục Kinh phí của đề tài." });
      }
      const conflict = await this.resolveDecisionConflict(actor, proposal);
      if (conflict.conflicted) {
        throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
      }

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

      await auditLog.record({
        action: "approve-proposal-budget",
        result: "success",
        actorId: actor.id,
        targetEntity: "research-proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, approvedAmount, previousAmount: currentBudget.approvedAmount ?? currentBudget.amount ?? null, budgetNote: input.budgetNote })
      });

      return {
        success: true,
        proposalId,
        approvedAmount,
        budgetMetadata: updatedBudget
      };
    });
  }

  /**
   * Stage 1: Chuyên viên/Trưởng phòng QLKH lập tờ trình thành lập hội đồng.
   *   - save: lưu nháp, chưa mời ai.
   *   - invite: lưu và gửi lời mời cho thành viên chưa được mời; thành viên đồng ý/từ chối như lời mời phản biện.
   *   - submit: trình lãnh đạo; chỉ được khi đủ thành phần và mọi thành viên đã nhận lời, nên quyết định thành lập
   *     chỉ gồm người đã đồng ý.
   * Chỉ loại người tham gia đề tài (chủ nhiệm, thành viên, thư ký) — không giới hạn đơn vị.
   */
  async proposeCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    let invitedNow: CouncilInvitee[] = [];
    let invitedFor: { code: string | null; title: string } = { code: null, title: "" };
    let routing: WorkflowEvent | null = null;
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      invitedNow = [];
      routing = null;
      invitedFor = { code: proposal.code ?? null, title: proposal.title };
      await assertEvaluationCoordinator(tx, actor, proposal);
      await this.assertNoDecisionConflict(actor, proposal);
      const { action, members, meetingDate, meetingLocation, tentativeAgenda } = readProposeCouncilInput(input);
      assertProposalStatus(proposal, ["submitted", "resubmitted", "under_review"], "Chỉ lập tờ trình hội đồng khi hồ sơ đã nộp hoặc đang đánh giá.");

      const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
      if (currentCouncil.status === "approved") {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hội đồng đã được lãnh đạo duyệt, không thể sửa tờ trình." });
      }
      if (currentCouncil.status === "submitted") {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Tờ trình đang chờ lãnh đạo duyệt; chỉ sửa được sau khi lãnh đạo trả lại." });
      }

      for (const member of members) {
        if (!member.userId) continue;
        const memberConflict = await this.participation.evaluateConflict(member.userId, proposal.id);
        if (memberConflict.conflicted) {
          throw new BadRequestException({ message: `Thành viên ${member.displayName} là người tham gia đề tài (${memberConflict.reason}), không thể tham gia Hội đồng.` });
        }
      }

      // Thành phần: 2–3 phản biện, 3–5 thành viên (chủ tịch, phó chủ tịch, uỷ viên), 1 thư ký. Nháp và gửi lời mời
      // chỉ bị chặn khi vượt mức; khi trình lãnh đạo phải đủ và mọi người phải gắn tài khoản.
      const compositionProblems = councilMetadataProblems(members, action === "submit");
      if (compositionProblems.length) {
        throw new BadRequestException({ message: `Thành phần hội đồng chưa đúng quy định: ${compositionProblems.join(" ")}` });
      }

      const now = new Date();
      if (action !== "save") {
        const evidence = await assertCurrentCompletenessEvidence(tx, proposal);
        invitedNow = await syncCouncilInvitations(tx, actor, proposal.id, members, evidence.eventId, meetingDate ? new Date(meetingDate) : null, now);
        if (action === "submit") {
          const problems = await councilAcceptanceProblems(tx, proposal.id, members, evidence.eventId);
          if (problems.length) throw new BadRequestException({ code: "COUNCIL_NOT_ACCEPTED", message: `Chưa trình được: ${problems.join(" ")}` });
        }
      }

      const updatedCouncil = {
        ...currentCouncil,
        status: action === "submit" ? "submitted" : "draft",
        proposedAt: now.toISOString(),
        proposedById: actor.id,
        proposedByName: actor.displayName,
        meetingDate,
        meetingLocation,
        tentativeAgenda,
        members,
        // Đánh dấu tờ trình theo quy trình mời trước: lúc duyệt, mọi thành viên phải đã nhận lời.
        invitationsSentAt: action === "save" ? currentCouncil.invitationsSentAt : now.toISOString()
      };

      await tx.researchProposal.update({ where: { id: proposalId }, data: { councilMetadata: updatedCouncil as never } });
      if (action === "submit") {
        // Tờ trình đi qua Trưởng ban QLKH và Trưởng phòng KHQS trước khi tới Ban giám đốc.
        const submission = await openApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.evaluationCouncil, subjectType: "proposal", subjectId: proposalId }, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
        routing = (await boardReviewEvent(tx, submission)) as WorkflowEvent;
      }
      await auditLog.record({
        action: "propose-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "research-proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, memberCount: members.length, status: updatedCouncil.status, councilAction: action, invited: invitedNow.map((item) => item.userId) })
      });

      return { success: true, proposalId, councilMetadata: updatedCouncil };
    });
    await this.notifyAfterCommit(() => [...invitedNow.map((item) => reviewInvitationEvent(proposalId, invitedFor, item.userId, item.role, item.dueDate)), ...(routing ? [routing] : [])]);
    return result;
  }

  /**
   * Stage 1: danh sách nhà khoa học để chọn vào hội đồng (một truy vấn, lọc ở CSDL). Chỉ người có tài khoản
   * mới nhận và trả lời được lời mời. Chặn người tham gia đề tài theo tài khoản; trùng tên với người tham gia
   * chưa gắn tài khoản và cùng đơn vị chủ trì chỉ là cảnh báo.
   */
  async getCouncilCandidates(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    await assertCanReadEvaluation(this.prisma, actor, proposal);

    const [proposalMembers, hostOrgUnit] = await Promise.all([
      this.prisma.proposalMember.findMany({ where: { proposalId } }).catch(() => []) as Promise<Array<{ userId?: string | null; name?: string | null; status?: string | null; participationRole?: string | null }>>,
      proposal.hostOrganizationUnitId ? this.prisma.organizationUnit.findUnique({ where: { id: proposal.hostOrganizationUnitId } }).catch(() => null) : null
    ]);
    const activeMembers = proposalMembers.filter((member) => !member.status || member.status === "ACTIVE");
    const participantIds = new Set(activeMembers.map((member) => member.userId).filter((id): id is string => Boolean(id)));
    const unlinkedNames = new Set(activeMembers.filter((member) => !member.userId && member.name).map((member) => member.name!.trim().toLowerCase()));

    const profiles = (await this.prisma.researcherProfile.findMany({
      where: { status: "ACTIVE", linkedUserId: { not: null }, linkedUser: { is: { status: "active" } } },
      include: {
        academicRankCatalogItem: true,
        academicDegreeCatalogItem: true,
        managementOrganizationUnit: true,
        linkedUser: { select: { id: true, username: true, displayName: true, systemRole: true, unit: true, unitPositions: { select: { positionCode: true, organizationUnit: { select: { name: true, unitType: true, status: true } } }, orderBy: { createdAt: "asc" } } } }
      },
      orderBy: { fullName: "asc" },
      take: 1000
    } as never)) as unknown as Array<{
      id: string; linkedUserId: string | null; fullName: string; title?: string | null; militaryRank?: string | null; position?: string | null; profileType?: string | null;
      managementOrganizationUnitId?: string | null; managementOrganizationUnit?: { name: string } | null;
      academicRankCatalogItem?: { name: string } | null; academicDegreeCatalogItem?: { name: string } | null;
      linkedUser?: { username: string | null; systemRole: string | null; unit: string | null; unitPositions?: Array<{ positionCode: string; organizationUnit: { name: string; unitType: string; status: string } }> } | null;
    }>;

    const candidates = profiles.map((p) => {
      let isConflicted = false;
      let isWarning = false;
      let coiStatus: "CLEAN" | "WARNING_SAME_UNIT" | "WARNING_NAME_MATCH" | "BLOCKED_DIRECT_PARTICIPANT" = "CLEAN";
      let conflictReason: string | undefined;
      if (p.linkedUserId && p.linkedUserId === proposal.ownerId) {
        isConflicted = true;
        coiStatus = "BLOCKED_DIRECT_PARTICIPANT";
        conflictReason = "Là Chủ nhiệm đề tài (xung đột trực tiếp, không được tham gia Hội đồng)";
      } else if (p.linkedUserId && participantIds.has(p.linkedUserId)) {
        isConflicted = true;
        coiStatus = "BLOCKED_DIRECT_PARTICIPANT";
        conflictReason = "Là thành viên hoặc thư ký đề tài (xung đột trực tiếp)";
      } else if (unlinkedNames.has(p.fullName.trim().toLowerCase())) {
        isWarning = true;
        coiStatus = "WARNING_NAME_MATCH";
        conflictReason = "Trùng tên với người trong nhóm nghiên cứu (chưa gắn tài khoản) — kiểm tra lại trước khi mời";
      } else {
        const hostUnitName = hostOrgUnit?.name;
        const candUnitName = p.managementOrganizationUnit?.name || p.linkedUser?.unit;
        const isSameUnit = (p.managementOrganizationUnitId && p.managementOrganizationUnitId === proposal.hostOrganizationUnitId) || (hostUnitName && candUnitName && hostUnitName === candUnitName);
        if (isSameUnit) {
          isWarning = true;
          coiStatus = "WARNING_SAME_UNIT";
          conflictReason = `Cùng đơn vị với chủ nhiệm đề tài (${hostUnitName || "đơn vị chủ trì"}) - cần cân nhắc tính khách quan`;
        }
      }
      return {
        id: p.id,
        userId: p.linkedUserId,
        fullName: p.fullName,
        username: p.linkedUser?.username || "",
        systemRole: p.linkedUser?.systemRole || "",
        academicTitle: p.title || p.academicRankCatalogItem?.name || p.academicDegreeCatalogItem?.name || "Nhà khoa học",
        unit: p.managementOrganizationUnit?.name || p.linkedUser?.unit || (p.profileType === "EXTERNAL" ? "Đơn vị ngoài" : "Học viện Quân y"),
        militaryRank: p.militaryRank || "",
        position: p.position || "",
        // Chức danh tại đơn vị của tài khoản (chỉ để hiển thị khi chọn thành viên hội đồng).
        unitPositions: (p.linkedUser?.unitPositions ?? []).filter((item) => item.organizationUnit.status === "active").map((item) => positionDisplay(item.organizationUnit.unitType, item.positionCode, item.organizationUnit.name)),
        profileType: p.profileType,
        isConflicted,
        isWarning,
        coiStatus,
        conflictReason
      };
    });

    return { proposalId, candidates };
  }

  /**
   * Stage 1: Lãnh đạo duyệt tờ trình và ký quyết định thành lập hội đồng. Lời mời đã được nhận lời chuyển thành
   * phân công có hiệu lực (giữ thời điểm nhận lời, không phải đồng ý lại); hồ sơ chuyển sang "Đang đánh giá" qua
   * bước kiểm tra trạng thái và có ghi vào dòng thời gian.
   */
  async approveCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    // Người cần thông báo theo lần thử thành công cuối cùng (giao dịch có thể được thử lại).
    let invited: CouncilInvitee[] = [];
    let established: string[] = [];
    let notifyFor: { code: string | null; title: string; decisionNumber: string } = { code: null, title: "", decisionNumber: "" };
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      invited = [];
      established = [];
      assertCouncilSigningAuthority(actor);
      await this.assertNoDecisionConflict(actor, proposal);

      const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
      // Duyệt hội đồng chỉ cho tờ trình đã gửi, khi hồ sơ còn trong bước đánh giá và gói đánh giá chưa chốt/trình:
      // thêm phân công sau khi gói đã chốt sẽ làm gói không còn khớp vòng đánh giá.
      assertProposalStatus(proposal, ["submitted", "resubmitted", "under_review"], "Chỉ duyệt hội đồng khi hồ sơ đã nộp hoặc đang đánh giá.");
      if (currentCouncil.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ duyệt được tờ trình hội đồng đã gửi lãnh đạo." });
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.evaluationCouncil, subjectType: "proposal", subjectId: proposalId });
      const existingSummary = (await tx.proposalEvaluationSummary.findFirst({ where: { proposalId } })) as { status: string } | null;
      if (existingSummary && existingSummary.status !== "draft") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Bản tổng hợp đánh giá đã chốt hoặc đã trình; không thay đổi hội đồng được nữa." });

      const { decisionNumber: requestedNumber, approvalNote } = readApproveCouncilInput(input);
      const proposalCode = proposal.code || proposal.id.slice(0, 8).toUpperCase();
      const decisionNumber = requestedNumber || `QĐ-TLHĐ-${proposalCode.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;
      notifyFor = { code: proposal.code ?? null, title: proposal.title, decisionNumber };

      // Lãnh đạo duyệt đúng danh sách đã trình (những người đã nhận lời), không thay danh sách ở bước này.
      const members = readCouncilMembers(currentCouncil.members);
      const compositionProblems = councilMetadataProblems(members, true);
      if (compositionProblems.length) {
        throw new BadRequestException({ message: `Thành phần hội đồng chưa đúng quy định: ${compositionProblems.join(" ")}` });
      }

      const evidence = await assertCurrentCompletenessEvidence(tx, proposal);
      const now = new Date();
      const dueDate = typeof currentCouncil.meetingDate === "string" && currentCouncil.meetingDate ? new Date(currentCouncil.meetingDate) : null;
      const rows = (await tx.proposalReviewAssignment.findMany({
        where: { proposalId, reviewedSubmissionEventId: evidence.eventId, status: { in: ["assigned", "completed", "invited"] } }
      })) as Array<{ id: string; reviewerUserId: string; assignmentRole: string; status: string; acceptedAt?: Date | null }>;
      // Tờ trình lập trước quy trình mời (chưa gửi lời mời): giữ cách cũ — tạo phân công kèm lời mời sau khi duyệt.
      const legacy = !currentCouncil.invitationsSentAt;
      const live = rows.filter((row) => isRoundActiveStatus(row.status));
      const toActivate: typeof rows = [];
      const toCreate: CouncilInvitee[] = [];
      for (const member of members) {
        const userId = member.userId!;
        const role = councilMetadataRoleToAssignmentRole(member.role);
        const memberConflict = await this.participation.evaluateConflict(userId, proposalId);
        if (memberConflict.conflicted) {
          throw new BadRequestException({ message: `Thành viên ${member.displayName} là người tham gia đề tài (${memberConflict.reason}), không thể tham gia Hội đồng.` });
        }
        const existing = live.find((row) => row.reviewerUserId === userId);
        if (existing) {
          if (councilRoleOf(existing.assignmentRole) !== role) {
            throw new BadRequestException({ message: `${member.displayName} đang được phân công với vai trò khác trong vòng đánh giá; cần thu hồi phân công cũ trước khi duyệt hội đồng.` });
          }
          continue;
        }
        const invitation = rows.find((row) => row.status === "invited" && row.reviewerUserId === userId && councilRoleOf(row.assignmentRole) === role);
        if (invitation?.acceptedAt) toActivate.push(invitation);
        else if (legacy && !invitation) toCreate.push({ userId, role, dueDate });
        else throw new BadRequestException({ code: "COUNCIL_NOT_ACCEPTED", message: `${member.displayName} chưa nhận lời tham gia hội đồng; trả lại tờ trình để chuyên viên hoàn tất lời mời.` });
      }
      const roster = [
        ...live,
        ...toActivate.map((row) => ({ ...row, status: "assigned" })),
        ...toCreate.map((item, index) => ({ id: `new-${index}`, reviewerUserId: item.userId, assignmentRole: item.role, status: "assigned" }))
      ];
      const rosterProblems = councilCompositionProblems(roster, false);
      if (rosterProblems.length) {
        throw new BadRequestException({ message: `Phân công sau khi duyệt hội đồng sẽ vượt quy định: ${rosterProblems.join(" ")}` });
      }

      for (const invitation of toActivate) {
        await retireStaleOpenAssignments(tx, proposalId, invitation.reviewerUserId, evidence.eventId, now);
        await tx.proposalReviewAssignment.update({ where: { id: invitation.id }, data: { status: "assigned", effectiveFrom: now, dueDate } as never });
        established.push(invitation.reviewerUserId);
      }
      for (const item of toCreate) {
        await retireStaleOpenAssignments(tx, proposalId, item.userId, evidence.eventId, now);
        await tx.proposalReviewAssignment.create({
          data: { proposalId, reviewedSubmissionEventId: evidence.eventId, reviewerUserId: item.userId, assignmentRole: item.role, status: "assigned", assignedById: actor.id, assignedAt: now, effectiveFrom: now, dueDate } as never
        });
        invited.push(item);
      }
      // Lời mời còn lại của vòng không thuộc hội đồng được duyệt thì thu hồi.
      await tx.proposalReviewAssignment.updateMany({
        where: { proposalId, reviewedSubmissionEventId: evidence.eventId, status: "invited" },
        data: { status: "revoked", revokedAt: now, effectiveUntil: now } as never
      });

      const updatedCouncil: Record<string, unknown> = {
        ...currentCouncil,
        status: "approved",
        decisionNumber,
        decidedAt: now.toISOString(),
        decidedById: actor.id,
        decidedByName: actor.displayName,
        // Văn bản in "GIÁM ĐỐC" hoặc "KT. GIÁM ĐỐC – PHÓ GIÁM ĐỐC" theo người ký thật.
        decidedByRole: actor.systemRole,
        approvalNote,
        members
      };
      await tx.researchProposal.update({
        where: { id: proposalId },
        data: {
          councilMetadata: updatedCouncil as never,
          // Quyền xem hồ sơ của các thành viên thay đổi.
          authorizationRelationshipVersion: { increment: 1 },
          authorizationDelegationVersion: { increment: 1 },
          authorizationContextUpdatedAt: now
        } as never
      });
      // Hồ sơ mới nộp chuyển sang "Đang đánh giá" qua kiểm tra trạng thái, có dòng thời gian như mọi chuyển trạng thái.
      if (proposal.status === PROPOSAL_STATUS.submitted || proposal.status === PROPOSAL_STATUS.resubmitted) {
        await updateProposalStatusGuarded(tx as never, proposalId, proposal.status, PROPOSAL_STATUS.underReview);
        await tx.proposalSubmissionEvent.create({
          data: { proposalId, actorId: actor.id, fromStatus: proposal.status, toStatus: PROPOSAL_STATUS.underReview, submittedAt: now, note: `Lãnh đạo duyệt hội đồng (${decisionNumber}), mở vòng đánh giá` } as never
        });
      }

      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.evaluationCouncil, subjectType: "proposal", subjectId: proposalId }, "APPROVED", approvalNote || undefined);
      await auditLog.record({
        action: "approve-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "research-proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, decisionNumber, approvalNote, activated: established, createdInvitations: invited.map((item) => item.userId) })
      });

      return { success: true, proposalId, councilMetadata: updatedCouncil };
    });
    await this.notifyAfterCommit(() => [
      ...invited.map((item) => reviewInvitationEvent(proposalId, notifyFor, item.userId, item.role, item.dueDate)),
      ...(established.length ? [councilEstablishedEvent(proposalId, notifyFor, established, notifyFor.decisionNumber)] : [])
    ]);
    return result;
  }

  /**
   * Stage 1: Lãnh đạo trả lại tờ trình để điều chỉnh. Chỉ tờ trình đang chờ duyệt; hội đồng đã duyệt (đã có
   * phân công hiệu lực) không trả lại được. Lời mời đã nhận lời được giữ để chuyên viên trình lại.
   */
  async rejectCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      assertCouncilSigningAuthority(actor);
      await this.assertNoDecisionConflict(actor, proposal);

      const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
      if (currentCouncil.status !== "submitted") {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ trả lại được tờ trình hội đồng đang chờ duyệt." });
      }
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.evaluationCouncil, subjectType: "proposal", subjectId: proposalId });
      const { reason } = readRejectCouncilInput(input);
      const rejectionReason = reason || "Lãnh đạo yêu cầu điều chỉnh cơ cấu nhân sự Hội đồng.";
      const updatedCouncil = {
        ...currentCouncil,
        status: "rejected",
        rejectionReason,
        rejectedAt: new Date().toISOString(),
        rejectedById: actor.id,
        rejectedByName: actor.displayName
      };

      await tx.researchProposal.update({ where: { id: proposalId }, data: { councilMetadata: updatedCouncil as never } });
      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.evaluationCouncil, subjectType: "proposal", subjectId: proposalId }, "REJECTED", rejectionReason);
      await auditLog.record({
        action: "reject-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "research-proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, rejectionReason })
      });

      return { success: true, proposalId, councilMetadata: updatedCouncil };
    });
  }

  /**
   * Stage 2: chuyên viên QLKH phụ trách hoặc thư ký hội đồng của chính hồ sơ ghi biên bản và kết luận phiên họp,
   * sau khi hội đồng đã được thành lập.
   */
  async recordCouncilMinutes(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      const access = await this.reviewAccess.resolveForProposal(actor.id, proposalId);
      const isCouncilSecretary = access.isAssignedReviewer && access.assignmentRole === "committee_secretary";
      if (!isCouncilSecretary) await assertEvaluationCoordinator(tx, actor, proposal);

      const currentCouncil = (proposal.councilMetadata as Record<string, unknown>) || {};
      if (currentCouncil.status !== "approved") {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ ghi biên bản khi hội đồng đã được lãnh đạo quyết định thành lập." });
      }
      const minutes = readCouncilMinutesInput(input);
      const conclusionLabel = minutes.conclusion === "approved" ? "Đạt yêu cầu (Đề nghị phê duyệt)" : minutes.conclusion === "revision_required" ? "Đạt nhưng cần chỉnh sửa bổ sung" : "Không đạt yêu cầu";
      const now = new Date().toISOString();
      const councilMinutes = {
        ...minutes,
        meetingConductedAt: minutes.meetingConductedAt || now,
        conclusionLabel,
        recordedById: actor.id,
        recordedByName: actor.displayName,
        recordedByRole: isCouncilSecretary ? "committee_secretary" : "research_management",
        recordedAt: now
      };
      const updatedCouncil = { ...currentCouncil, councilMinutes };

      await tx.researchProposal.update({ where: { id: proposalId }, data: { councilMetadata: updatedCouncil as never } });
      await auditLog.record({
        action: "record-council-minutes",
        result: "success",
        actorId: actor.id,
        targetEntity: "research-proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, conclusion: minutes.conclusion, averageScore: minutes.averageScore, recordedByRole: councilMinutes.recordedByRole })
      });

      return { success: true, proposalId, councilMetadata: updatedCouncil };
    });
  }

  /**
   * Evaluates role and assignment conflicts. An authority cannot decide a proposal they own or participate in, or
   * otherwise be judging their own review. Shared with ST-3.4 consolidation.
   */
  private resolveDecisionConflict(actor: SafeUserContext, proposal: EvaluationProposalRecord) {
    return resolveActorConflict({ participation: this.participation, reviewAccess: this.reviewAccess }, actor?.id, proposal.id);
  }

  /** Người tham gia hoặc phản biện hồ sơ không được tự quyết định kinh phí, hội đồng hay kết luận IRB của hồ sơ đó. */
  private async assertNoDecisionConflict(actor: SafeUserContext, proposal: EvaluationProposalRecord) {
    const conflict = await this.resolveDecisionConflict(actor, proposal);
    if (conflict.conflicted) {
      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }
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

  // Nghiệm thu và giải ngân đã chuyển sang đề tài (approved-projects/project-closure.service.ts).

  // =========================================================================================
  // HỘI ĐỒNG ĐẠO ĐỨC TRONG NGHIÊN CỨU Y SINH HỌC (IRB) — quy tắc và luồng: irb-council.ts
  // =========================================================================================

  /**
   * Thông tin IRB của hồ sơ. Đọc được: người điều phối, lãnh đạo Phòng KHQS trong phạm vi, Ban giám đốc, và thành
   * viên hội đồng đã được ký thành lập. Người mới được mời (chưa ký thành lập) chỉ thấy lời mời của mình.
   */
  async getIRBInfo(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    const rows = await irbMemberRows(this.prisma, proposalId);
    const mine = rows.find((row) => row.userId === actor.id && row.status === IRB_MEMBER_STATUS.active);
    if (!mine) await assertCanReadEvaluation(this.prisma, actor, proposal);
    const irb = irbOf(proposal);
    return {
      proposalId,
      irb,
      memberStatuses: rows.filter((row) => row.status !== IRB_MEMBER_STATUS.revoked).map(toIrbMemberResponse),
      viewer: {
        memberRole: mine?.role ?? null,
        isCoordinator: await isEvaluationCoordinator(this.prisma, actor, proposal),
        canSign: isAcademyLeadership(actor)
      },
      contextVersion: proposalContextVersion(proposal as never)
    };
  }

  /** Lời mời và tư cách thành viên IRB của người xem: chỉ tên đề tài, vai trò, trạng thái (không lộ nội dung hồ sơ). */
  async listMyIrbInvitations(actor: SafeUserContext) {
    const table = (this.prisma as unknown as { proposalIrbMember?: { findMany(args: unknown): Promise<unknown[]> } }).proposalIrbMember;
    if (!table?.findMany) return [];
    const rows = (await table.findMany({
      where: { userId: actor.id, status: { in: [IRB_MEMBER_STATUS.invited, IRB_MEMBER_STATUS.accepted, IRB_MEMBER_STATUS.active] } },
      include: { proposal: { select: { id: true, code: true, title: true, irbMetadata: true } }, invitedBy: { select: { displayName: true } } },
      orderBy: { invitedAt: "desc" }
    })) as Array<IrbMemberRow & { proposal: { id: string; code: string | null; title: string; irbMetadata: unknown }; invitedBy: { displayName: string } | null }>;
    return rows.map((row) => {
      const irb = irbOf({ irbMetadata: row.proposal.irbMetadata });
      return {
        ...toIrbMemberResponse(row),
        proposal: { id: row.proposal.id, code: row.proposal.code, title: row.proposal.title },
        invitedByName: row.invitedBy?.displayName ?? null,
        meetingDate: irb.council.meetingDate || null,
        councilStatus: irb.council.status,
        reviewSubmitted: irb.reviews.some((review) => review.reviewerId === actor.id && review.status === "submitted"),
        conclusionStatus: irb.conclusion?.status ?? null,
        certificateStatus: irb.certificate?.status ?? null
      };
    });
  }

  /**
   * Chuyên viên phụ trách (hoặc Trưởng phòng) lập danh sách hội đồng IRB: save (nháp), invite (gửi lời mời cho người
   * mới), submit (trình qua Phòng KHQS; mọi thành viên phải đã nhận lời, thành phần đủ).
   */
  async proposeIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    let invitedNow: Array<{ userId: string; role: IrbMemberRole }> = [];
    let routing: WorkflowEvent | null = null;
    let about = { code: null as string | null, title: "", meetingDate: "" };
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      invitedNow = [];
      routing = null;
      await assertEvaluationCoordinator(tx, actor, proposal);
      await this.assertNoDecisionConflict(actor, proposal);
      assertProposalStatus(proposal, IRB_PROPOSAL_STATUSES, "Chỉ lập hội đồng IRB cho hồ sơ đã nộp.");
      const current = irbOf(proposal);
      if (current.certificate) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hồ sơ đã được cấp Giấy chứng nhận IRB, không lập lại hội đồng." });
      if (current.council.status === "approved") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hội đồng IRB đã được ký thành lập, không sửa được danh sách." });
      if (current.council.status === "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Tờ trình hội đồng IRB đang trình; chỉ sửa được khi bị trả lại." });

      const { action, members, meetingDate, meetingLocation } = readProposeIrbCouncilInput(input);
      about = { code: proposal.code ?? null, title: proposal.title, meetingDate };
      const accounts = (await tx.user.findMany({ where: { id: { in: members.map((member) => member.userId) } }, select: { id: true, status: true } })) as Array<{ id: string; status: string }>;
      for (const member of members) {
        if (!accounts.some((account) => account.id === member.userId && account.status === "active")) {
          throw new BadRequestException({ message: `Tài khoản của ${member.displayName} không tồn tại hoặc đã bị khoá.` });
        }
        const conflict = await this.participation.evaluateConflict(member.userId, proposal.id);
        if (conflict.conflicted) throw new BadRequestException({ message: `${member.displayName} là người tham gia đề tài (${conflict.reason}), không thể tham gia Hội đồng IRB.` });
      }
      const problems = irbCompositionProblems(members, action === "submit");
      if (problems.length) throw new BadRequestException({ message: `Thành phần Hội đồng IRB chưa đúng quy định: ${problems.join(" ")}` });

      const now = new Date();
      if (action !== "save") {
        invitedNow = await syncIrbInvitations(tx, actor, proposalId, members, now);
        if (action === "submit") {
          const pending = await irbAcceptanceProblems(tx, proposalId, members);
          if (pending.length) throw new BadRequestException({ code: "COUNCIL_NOT_ACCEPTED", message: `Chưa trình được: ${pending.join(" ")}` });
        }
      }

      const council = {
        ...current.council,
        status: action === "submit" ? "submitted" : "draft",
        members: members.map((member) => ({ ...member, roleLabel: IRB_ROLE_LABELS[member.role] })),
        meetingDate,
        meetingLocation,
        proposedAt: now.toISOString(),
        proposedById: actor.id,
        proposedByName: actor.displayName || actor.username,
        invitationsSentAt: action === "save" ? current.council.invitationsSentAt ?? null : now.toISOString()
      };
      const updated = { ...current, council };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      if (action === "submit") {
        const submission = await openApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCouncil, subjectType: "proposal", subjectId: proposalId }, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
        routing = (await boardReviewEvent(tx, submission)) as WorkflowEvent;
      }
      await auditLog.record({
        action: "propose-irb-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, councilAction: action, memberCount: members.length, invited: invitedNow.map((item) => item.userId) })
      });
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => [...invitedNow.map((item) => irbInvitationEvent(proposalId, about, item.userId, item.role, about.meetingDate)), ...(routing ? [routing] : [])]);
    return result;
  }

  /** Người được mời trả lời lời mời IRB của chính mình. Từ chối bắt buộc lý do; báo chuyên viên đã lập tờ trình. */
  async respondToIrbInvitation(actor: SafeUserContext, proposalId: string, memberId: string, input: Record<string, unknown>) {
    const response = input.response === "accept" || input.response === "decline" ? input.response : null;
    if (!response) throw new BadRequestException({ message: "Câu trả lời lời mời không hợp lệ." });
    const reason = response === "decline" ? readIrbReasonInput(input, "Lý do từ chối") : "";
    let notice: WorkflowEvent | null = null;
    const row = await this.prisma.$transaction(async (tx) => {
      const current = (await tx.proposalIrbMember.findUnique({ where: { id: memberId }, include: { proposal: { select: { id: true, code: true, title: true, irbMetadata: true, hostOrganizationUnitId: true } } } })) as (IrbMemberRow & { proposal: { id: string; code: string | null; title: string; irbMetadata: unknown; hostOrganizationUnitId: string } }) | null;
      if (!current || current.proposalId !== proposalId) throw new NotFoundException({ message: "Không tìm thấy lời mời." });
      if (current.userId !== actor.id) throw new ForbiddenException({ message: "Đây không phải lời mời của đồng chí." });
      const now = new Date();
      // Cập nhật có điều kiện: hai lần bấm đồng thời chỉ một lần có hiệu lực.
      const changed = await tx.proposalIrbMember.updateMany({
        where: { id: memberId, status: IRB_MEMBER_STATUS.invited },
        data: response === "accept" ? { status: IRB_MEMBER_STATUS.accepted, acceptedAt: now } : { status: IRB_MEMBER_STATUS.declined, declinedAt: now, declineReason: reason }
      });
      if (!changed.count) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Lời mời đã được trả lời hoặc đã bị thu hồi." });
      await new AuditLogService(tx as never).record({
        action: response === "accept" ? "accept-irb-invitation" : "decline-irb-invitation",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ memberId, role: current.role, reason: reason || undefined })
      });
      const irb = irbOf({ irbMetadata: current.proposal.irbMetadata });
      const recipients = irb.council.proposedById ? [irb.council.proposedById] : await researchManagersInScope(tx as never, current.proposal.hostOrganizationUnitId);
      notice = irbInvitationResponseEvent(proposalId, current.proposal, recipients, actor.displayName || actor.username, current.role as IrbMemberRole, response, reason);
      return (await tx.proposalIrbMember.findUnique({ where: { id: memberId } })) as IrbMemberRow;
    });
    await this.notifyAfterCommit(() => (notice ? [notice] : []));
    return toIrbMemberResponse(row);
  }

  /** Giám đốc hoặc Phó GĐ KH ký thành lập Hội đồng IRB (sau khi tờ trình qua Trưởng ban, Trưởng phòng). */
  async approveIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    let established: string[] = [];
    let about = { code: null as string | null, title: "", decisionNumber: "" };
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      established = [];
      assertCouncilSigningAuthority(actor);
      await this.assertNoDecisionConflict(actor, proposal);
      const current = irbOf(proposal);
      if (current.council.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ ký được tờ trình Hội đồng IRB đang trình." });
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.irbCouncil, subjectType: "proposal", subjectId: proposalId });
      const { decisionNumber: requested, approvalNote } = readIrbSignInput(input);
      const decisionNumber = requested || `QĐ-IRB-${(proposal.code || proposal.id.slice(0, 8).toUpperCase()).replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;
      about = { code: proposal.code ?? null, title: proposal.title, decisionNumber };
      const now = new Date();
      const rows = await irbMemberRows(tx, proposalId);

      if (current.council.invitationsSentAt) {
        const members = readIrbMembers(current.council.members);
        const problems = irbCompositionProblems(members, true);
        if (problems.length) throw new BadRequestException({ message: `Thành phần Hội đồng IRB chưa đúng quy định: ${problems.join(" ")}` });
        for (const member of members) {
          const accepted = rows.find((row) => row.userId === member.userId && row.role === member.role && row.status === IRB_MEMBER_STATUS.accepted);
          if (!accepted) throw new BadRequestException({ code: "COUNCIL_NOT_ACCEPTED", message: `${member.displayName} chưa nhận lời tham gia Hội đồng IRB; trả lại tờ trình để chuyên viên hoàn tất lời mời.` });
          await tx.proposalIrbMember.update({ where: { id: accepted.id }, data: { status: IRB_MEMBER_STATUS.active, activatedAt: now } });
          established.push(member.userId);
        }
      } else {
        // Tờ trình lập trước khi có lời mời: thành viên có tài khoản trở thành thành viên hội đồng khi ký.
        for (const member of (current.council.members ?? []) as Array<Record<string, unknown>>) {
          if (typeof member.userId !== "string" || !member.userId || established.includes(member.userId)) continue;
          await tx.proposalIrbMember.create({ data: { proposalId, userId: member.userId, role: "member", status: IRB_MEMBER_STATUS.active, invitedById: String(current.council.proposedById ?? actor.id), acceptedAt: now, activatedAt: now } });
          established.push(member.userId);
        }
      }
      // Lời mời còn lại không thuộc hội đồng được ký thì thu hồi.
      await tx.proposalIrbMember.updateMany({ where: { proposalId, status: { in: [IRB_MEMBER_STATUS.invited, IRB_MEMBER_STATUS.accepted] } }, data: { status: IRB_MEMBER_STATUS.revoked, revokedAt: now } });

      const updated = {
        ...current,
        council: { ...current.council, status: "approved", decisionNumber, approvalNote, approvedAt: now.toISOString(), approvedById: actor.id, approvedByName: actor.displayName || actor.username }
      };
      await tx.researchProposal.update({
        where: { id: proposalId },
        // Quyền xem hồ sơ của các thành viên thay đổi.
        data: { irbMetadata: updated as never, authorizationRelationshipVersion: { increment: 1 }, authorizationContextUpdatedAt: now } as never
      });
      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCouncil, subjectType: "proposal", subjectId: proposalId }, "APPROVED", approvalNote || undefined);
      await auditLog.record({
        action: "approve-irb-council",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, decisionNumber, members: established })
      });
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => (established.length ? [irbCouncilEstablishedEvent(proposalId, about, established, about.decisionNumber)] : []));
    return result;
  }

  /** Ban giám đốc không ký, trả tờ trình Hội đồng IRB về chuyên viên (bắt buộc lý do); chuyên viên sửa rồi trình lại. */
  async rejectIrbCouncil(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    let notice: WorkflowEvent | null = null;
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      notice = null;
      assertCouncilSigningAuthority(actor);
      await this.assertNoDecisionConflict(actor, proposal);
      const current = irbOf(proposal);
      if (current.council.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ trả lại được tờ trình Hội đồng IRB đang trình." });
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.irbCouncil, subjectType: "proposal", subjectId: proposalId });
      const reason = readIrbReasonInput(input, "Lý do trả lại");
      const updated = { ...current, council: { ...current.council, status: "rejected", rejectionReason: reason, rejectedAt: new Date().toISOString(), rejectedById: actor.id, rejectedByName: actor.displayName || actor.username } };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCouncil, subjectType: "proposal", subjectId: proposalId }, "REJECTED", reason);
      await auditLog.record({ action: "reject-irb-council", result: "success", actorId: actor.id, targetEntity: "proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify({ proposalId, reason }) });
      if (current.council.proposedById) notice = irbStaffEvent(proposalId, proposal, [current.council.proposedById], "Ban giám đốc trả lại tờ trình Hội đồng IRB", `Lý do: ${reason}. Điều chỉnh danh sách rồi trình lại.`);
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => (notice ? [notice] : []));
    return result;
  }

  /** Thành viên hội đồng (trừ thư ký) gửi nhận xét về đạo đức của đề cương. Gửi lại thì thay nhận xét trước. */
  async submitIrbReview(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    return this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      const membership = (await irbMemberRows(tx, proposalId)).find((row) => row.userId === actor.id && row.status === IRB_MEMBER_STATUS.active);
      // Không phải thành viên: lỗi quyền (403), không phải lỗi dữ liệu.
      if (!membership) throw new ForbiddenException({ message: "Đồng chí không phải thành viên Hội đồng IRB của hồ sơ này." });
      if (membership.role === "secretary") throw new ForbiddenException({ message: "Thư ký hội đồng lập kết luận, không gửi nhận xét." });
      const current = irbOf(proposal);
      if (current.council.status !== "approved") throw new BadRequestException({ message: "Hội đồng IRB chưa được ký thành lập, chưa thể nhận xét." });
      if (current.certificate || ["finalized", "submitted"].includes(String(current.conclusion?.status))) {
        throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Kết luận của hội đồng đã chốt, không sửa nhận xét được nữa." });
      }
      const { recommendation, comment } = readIrbReviewInput(input);
      const review = {
        reviewerId: actor.id,
        reviewerName: actor.displayName || actor.username,
        role: membership.role,
        roleLabel: IRB_ROLE_LABELS[membership.role as IrbMemberRole],
        status: "submitted",
        recommendation,
        recommendationLabel: IRB_RECOMMENDATION_LABELS[recommendation],
        comment,
        submittedAt: new Date().toISOString()
      };
      const updated = { ...current, reviews: [...current.reviews.filter((item) => item.reviewerId !== actor.id), review] };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      await auditLog.record({ action: "submit-irb-review", result: "success", actorId: actor.id, targetEntity: "proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify({ proposalId, recommendation }) });
      return { success: true, irb: updated };
    });
  }

  /**
   * Thư ký hội đồng lập kết luận: save (nháp), finalize (chốt, báo chuyên viên trình). Chốt khi mọi phản biện đã gửi
   * nhận xét. Kết luận bị trả lại thì thư ký sửa và chốt lại.
   */
  async saveIrbConclusion(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    let notice: WorkflowEvent | null = null;
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      notice = null;
      const rows = await irbMemberRows(tx, proposalId);
      const membership = rows.find((row) => row.userId === actor.id && row.status === IRB_MEMBER_STATUS.active);
      if (membership?.role !== "secretary") throw new ForbiddenException({ message: "Chỉ thư ký Hội đồng IRB của hồ sơ này lập kết luận." });
      const current = irbOf(proposal);
      if (current.council.status !== "approved") throw new BadRequestException({ message: "Hội đồng IRB chưa được ký thành lập." });
      if (current.certificate) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hồ sơ đã được cấp Giấy chứng nhận IRB." });
      if (current.conclusion?.status === "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Kết luận đang trình; chỉ sửa được khi bị trả lại." });
      const { action, ...fields } = readIrbConclusionInput(input);
      if (action === "finalize") {
        const reviewed = new Set(current.reviews.filter((review) => review.status === "submitted").map((review) => review.reviewerId));
        const missing = rows.filter((row) => row.status === IRB_MEMBER_STATUS.active && row.role === "reviewer" && !reviewed.has(row.userId));
        if (!reviewed.size) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chưa có nhận xét nào của thành viên hội đồng." });
        if (missing.length) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: `Còn phản biện chưa gửi nhận xét: ${missing.map((row) => row.user?.displayName ?? row.userId).join(", ")}.` });
      }
      const now = new Date().toISOString();
      const conclusion = { ...fields, status: action === "finalize" ? "finalized" : "draft", recordedById: actor.id, recordedByName: actor.displayName || actor.username, recordedAt: now, ...(action === "finalize" ? { finalizedAt: now } : {}) };
      const updated = { ...current, conclusion };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      await auditLog.record({ action: "save-irb-conclusion", result: "success", actorId: actor.id, targetEntity: "proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify({ proposalId, conclusionAction: action, decision: fields.decision }) });
      if (action === "finalize" && current.council.proposedById) notice = irbStaffEvent(proposalId, proposal, [current.council.proposedById], "Thư ký đã chốt kết luận Hội đồng IRB", "Kiểm tra và trình kết luận qua Phòng KHQS để Ban giám đốc ký cấp Giấy chứng nhận.");
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => (notice ? [notice] : []));
    return result;
  }

  /** Chuyên viên phụ trách trình kết luận đã chốt qua Trưởng ban, Trưởng phòng lên Ban giám đốc ký cấp giấy. */
  async submitIrbConclusion(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    let routing: WorkflowEvent | null = null;
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      routing = null;
      await assertEvaluationCoordinator(tx, actor, proposal);
      await this.assertNoDecisionConflict(actor, proposal);
      const current = irbOf(proposal);
      if (current.certificate) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hồ sơ đã được cấp Giấy chứng nhận IRB." });
      if (current.conclusion?.status !== "finalized") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Thư ký hội đồng chưa chốt kết luận." });
      const now = new Date().toISOString();
      const updated = { ...current, conclusion: { ...current.conclusion, status: "submitted", submittedAt: now, submittedById: actor.id, submittedByName: actor.displayName || actor.username } };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      const submission = await openApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCertificate, subjectType: "proposal", subjectId: proposalId }, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
      routing = (await boardReviewEvent(tx, submission)) as WorkflowEvent;
      await auditLog.record({ action: "submit-irb-conclusion", result: "success", actorId: actor.id, targetEntity: "proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify({ proposalId, decision: current.conclusion.decision }) });
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => (routing ? [routing] : []));
    return result;
  }

  /** Ban giám đốc trả kết luận về thư ký (bắt buộc lý do), thay vì ký cấp giấy. */
  async returnIrbConclusion(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}) {
    let notice: WorkflowEvent | null = null;
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      notice = null;
      assertCouncilSigningAuthority(actor);
      await this.assertNoDecisionConflict(actor, proposal);
      const current = irbOf(proposal);
      if (current.conclusion?.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Không có kết luận IRB nào đang chờ ký." });
      await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.irbCertificate, subjectType: "proposal", subjectId: proposalId });
      const reason = readIrbReasonInput(input, "Lý do trả lại");
      const updated = { ...current, conclusion: { ...current.conclusion, status: "returned", returnReason: reason, returnedAt: new Date().toISOString(), returnedByName: actor.displayName || actor.username } };
      await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
      await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCertificate, subjectType: "proposal", subjectId: proposalId }, "RETURNED", reason);
      await auditLog.record({ action: "return-irb-conclusion", result: "success", actorId: actor.id, targetEntity: "proposal", targetEntityId: proposalId, username: actor.username, reason: JSON.stringify({ proposalId, reason }) });
      const recipients = [current.conclusion.recordedById, current.conclusion.submittedById].filter((id): id is string => typeof id === "string" && !!id);
      notice = irbStaffEvent(proposalId, proposal, [...new Set(recipients)], "Ban giám đốc trả lại kết luận Hội đồng IRB", `Lý do: ${reason}. Thư ký sửa, chốt lại; chuyên viên trình lại.`);
      return { success: true, irb: updated };
    });
    await this.notifyAfterCommit(() => (notice ? [notice] : []));
    return result;
  }

  /**
   * Ban giám đốc (Giám đốc hoặc Phó GĐ KH) ký cấp Giấy chứng nhận theo kết luận đã trình qua Phòng KHQS. Hội đồng lập
   * trước khi có lời mời (không có kết luận) giữ cách cũ: cấp khi đã có nhận xét của thành viên.
   */
  async updateIRBStatus(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>) {
    const requestedStatus = typeof input.status === "string" && input.status ? input.status : null;
    if (requestedStatus !== null && !(IRB_DECISIONS as readonly string[]).includes(requestedStatus)) {
      throw new BadRequestException({ message: "Trạng thái chứng nhận IRB không hợp lệ." });
    }
    const requestedNumber = typeof input.certificateNumber === "string" ? input.certificateNumber.trim() : "";
    if (requestedNumber.length > 100) {
      throw new BadRequestException({ message: "Số giấy chứng nhận IRB không được vượt quá 100 ký tự." });
    }
    const decisionDate = readIsoDate(input.decisionDate, "decisionDate") ?? new Date().toISOString();
    const validUntil = readIsoDate(input.validUntil, "validUntil") ?? new Date(Date.parse(decisionDate) + 365 * 24 * 3600 * 1000).toISOString();
    if (Date.parse(validUntil) <= Date.parse(decisionDate)) {
      throw new BadRequestException({ message: "Ngày hết hiệu lực phải sau ngày quyết định." });
    }
    if (input.riskLevel !== undefined && input.riskLevel !== null && input.riskLevel !== "" && (typeof input.riskLevel !== "string" || !(IRB_RISK_LEVELS as readonly string[]).includes(input.riskLevel))) {
      throw new BadRequestException({ message: "Mức độ rủi ro IRB không hợp lệ." });
    }
    const inputTargetSubjects = readOptionalText(input.targetSubjects, "targetSubjects", 2000);
    const inputEthicsNotes = readOptionalText(input.ethicsNotes, "ethicsNotes", 5000);

    let notice: { ownerId: string; label: string; certificateNumber: string | null; status: string; recipients: string[]; title: string; code: string | null } | null = null;
    let result;
    try {
      result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
        notice = null;
        assertCouncilSigningAuthority(actor);
        await this.assertNoDecisionConflict(actor, proposal);
        const rows = await irbMemberRows(tx, proposalId);
        if (rows.some((row) => row.userId === actor.id && row.status === IRB_MEMBER_STATUS.active)) {
          throw new ForbiddenException({ code: "CONFLICT_DENIED", message: "Thành viên Hội đồng IRB của hồ sơ không ký cấp giấy chứng nhận." });
        }
        const current = irbOf(proposal);
        if (current.council.status !== "approved") {
          throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hội đồng IRB chưa được ký thành lập, chưa thể cấp giấy chứng nhận." });
        }
        const conclusion = current.conclusion;
        if (current.council.invitationsSentAt || conclusion) {
          if (conclusion?.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Kết luận của Hội đồng IRB chưa được trình qua Phòng KHQS." });
          await assertReadyForLeadership(tx, actor, { kind: APPROVAL_KINDS.irbCertificate, subjectType: "proposal", subjectId: proposalId });
        } else if (!current.reviews.some((review) => review.status === "submitted")) {
          throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chưa có nhận xét nào của thành viên Hội đồng IRB." });
        }
        const status = requestedStatus ?? (conclusion?.decision as string | undefined) ?? "APPROVED";
        const previous = current.certificate;
        // Cấp lại giữ số của hồ sơ; không cấp (REJECTED) không lấy số.
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
          validUntil,
          riskLevel: (typeof input.riskLevel === "string" && input.riskLevel) || conclusion?.riskLevel || "LOW",
          targetSubjects: inputTargetSubjects ?? (conclusion?.targetSubjects || "Bệnh nhân và đối tượng can thiệp y học"),
          ethicsNotes: inputEthicsNotes ?? (conclusion?.ethicsNotes || "Hội đồng Đạo đức trong nghiên cứu Y sinh học thông qua đề cương nghiên cứu."),
          conditions: conclusion?.conditions || "",
          approvedById: actor.id,
          approvedByName: actor.displayName || actor.username,
          updatedAt: new Date().toISOString()
        };
        const updated = { ...current, certificate, ...(conclusion ? { conclusion: { ...conclusion, status: "signed" } } : {}) };
        await tx.researchProposal.update({ where: { id: proposalId }, data: { irbMetadata: updated as never } });
        await closeApprovalSubmission(tx, actor, { kind: APPROVAL_KINDS.irbCertificate, subjectType: "proposal", subjectId: proposalId }, "APPROVED");
        await auditLog.record({
          action: "update-irb-status",
          result: "success",
          actorId: actor.id,
          targetEntity: "proposal",
          targetEntityId: proposalId,
          username: actor.username,
          reason: JSON.stringify({ proposalId, status, certificateNumber })
        });
        const recipients = [...rows.filter((row) => row.status === IRB_MEMBER_STATUS.active).map((row) => row.userId), current.council.proposedById].filter((id): id is string => typeof id === "string" && !!id);
        notice = { ownerId: proposal.ownerId, label: proposal.code || proposal.title, certificateNumber, status, recipients: [...new Set(recipients)], title: proposal.title, code: proposal.code ?? null };
        return { success: true, irb: updated };
      });
    } catch (error) {
      // Chỉ mục duy nhất từng phần là chốt chặn cuối khi hai hồ sơ cùng nhập tay một số.
      if ((error as { code?: string }).code === "P2002") throw documentNumberTaken(IRB_CERTIFICATE_NUMBER);
      throw error;
    }

    // Thông báo sau khi giấy chứng nhận đã commit, không bao giờ cho lần thử bị huỷ.
    const committed = notice as { ownerId: string; label: string; certificateNumber: string | null; status: string; recipients: string[]; title: string; code: string | null } | null;
    if (committed) {
      const statusLabel = committed.status === "APPROVED" ? "Đã phê duyệt" : "Không phê duyệt";
      await this.notifications?.createNotification({
        userId: committed.ownerId,
        title: "Hội đồng Y đức (IRB)",
        message: `Hồ sơ đạo đức của đề tài ${committed.label} đã có Giấy chứng nhận: ${statusLabel}.`,
        type: "IRB_UPDATE",
        link: proposalLink(proposalId),
        metadata: { proposalId, status: committed.status, certificateNumber: committed.certificateNumber }
      }).catch(() => undefined);
      await this.notifyAfterCommit(() => [irbStaffEvent(proposalId, committed, committed.recipients, "Ban giám đốc đã ký Giấy chứng nhận IRB", `Kết quả: ${statusLabel}${committed.certificateNumber ? ` (số ${committed.certificateNumber})` : ""}.`)]);
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
    void kind;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM research_proposals
          WHERE id <> ${proposalId} AND irb_metadata->'certificate'->>'certificateNumber' = ${number}
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


function documentNumberTaken(kind: DocumentNumberKind) {
  return new ConflictException({ code: kind.takenCode, message: kind.takenMessage });
}

type CouncilInvitee = { userId: string; role: ReturnType<typeof councilMetadataRoleToAssignmentRole>; dueDate: Date | null };
type CouncilRow = { id: string; reviewerUserId: string; assignmentRole: string; status: string; acceptedAt?: Date | null; reviewedSubmissionEventId?: string | null };

// Kiểu lỏng có chủ ý: chạy được với client giao dịch và CSDL giả lập trong test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CouncilClient = any;

/**
 * Đồng bộ lời mời hội đồng với danh sách trong tờ trình (vòng đánh giá hiện tại):
 *   - Người mới (có tài khoản) nhận lời mời "invited"; người đã được mời đúng vai trò giữ nguyên câu trả lời.
 *   - Người bị bỏ khỏi danh sách, đổi vai trò, hoặc lời mời của lần nộp cũ: thu hồi lời mời.
 *   - Người đã từ chối không bị mời lại tự động: chuyên viên thay người khác.
 * Trả về những người vừa được mời để gửi thông báo sau khi giao dịch commit.
 */
async function syncCouncilInvitations(tx: CouncilClient, actor: SafeUserContext, proposalId: string, members: CouncilMemberInput[], submissionEventId: string, dueDate: Date | null, now: Date) {
  const rows = (await tx.proposalReviewAssignment.findMany({ where: { proposalId, status: { in: ["invited", "assigned", "completed", "declined"] } } })) as CouncilRow[];
  const wanted = new Map<string, CouncilInvitee["role"]>();
  for (const member of members) if (member.userId) wanted.set(member.userId, councilMetadataRoleToAssignmentRole(member.role));

  for (const row of rows.filter((item) => item.status === "invited")) {
    if (row.reviewedSubmissionEventId !== submissionEventId || wanted.get(row.reviewerUserId) !== councilRoleOf(row.assignmentRole)) {
      await tx.proposalReviewAssignment.update({ where: { id: row.id }, data: { status: "revoked", revokedAt: now, effectiveUntil: now } });
    }
  }

  const created: CouncilInvitee[] = [];
  for (const [userId, role] of wanted) {
    const current = rows.filter((row) => row.reviewerUserId === userId && row.reviewedSubmissionEventId === submissionEventId);
    const live = current.find((row) => isRoundActiveStatus(row.status));
    if (live) {
      if (councilRoleOf(live.assignmentRole) !== role) throw new BadRequestException({ message: "Một thành viên đang được phân công với vai trò khác trong vòng đánh giá; cần thu hồi phân công cũ trước." });
      continue;
    }
    if (current.some((row) => (row.status === "invited" || row.status === "declined") && councilRoleOf(row.assignmentRole) === role)) continue;
    const profiles = tx.researcherProfile;
    const profile = profiles?.findFirst ? await profiles.findFirst({ where: { linkedUserId: userId }, select: { id: true } }) : null;
    await tx.proposalReviewAssignment.create({
      data: { proposalId, reviewedSubmissionEventId: submissionEventId, reviewerUserId: userId, researcherProfileId: profile?.id ?? null, assignmentRole: role, status: "invited", assignedById: actor.id, assignedAt: now, effectiveFrom: now, dueDate }
    });
    created.push({ userId, role, dueDate });
  }
  return created;
}

/** Lý do chưa trình được: ai chưa nhận lời, ai đã từ chối (rỗng = mọi thành viên đã nhận lời). */
async function councilAcceptanceProblems(tx: CouncilClient, proposalId: string, members: CouncilMemberInput[], submissionEventId: string) {
  const rows = (await tx.proposalReviewAssignment.findMany({ where: { proposalId, reviewedSubmissionEventId: submissionEventId, status: { in: ["invited", "assigned", "completed", "declined"] } } })) as CouncilRow[];
  const pending: string[] = [];
  const declined: string[] = [];
  for (const member of members) {
    const role = councilMetadataRoleToAssignmentRole(member.role);
    const mine = rows.filter((row) => row.reviewerUserId === member.userId && councilRoleOf(row.assignmentRole) === role);
    if (mine.some((row) => isRoundActiveStatus(row.status) || (row.status === "invited" && row.acceptedAt))) continue;
    if (mine.some((row) => row.status === "invited")) pending.push(member.displayName);
    else if (mine.some((row) => row.status === "declined")) declined.push(member.displayName);
    else pending.push(member.displayName);
  }
  const problems: string[] = [];
  if (pending.length) problems.push(`Chờ nhận lời: ${pending.join(", ")}.`);
  if (declined.length) problems.push(`Đã từ chối (cần thay người khác): ${declined.join(", ")}.`);
  return problems;
}

// ---- Hội đồng IRB: hàm hỗ trợ ----------------------------------------------------------------------------

/** Hồ sơ lập được hội đồng IRB: đã nộp, kể cả đang bổ sung, đang đánh giá hoặc đã phê duyệt (trước khi thực hiện). */
const IRB_PROPOSAL_STATUSES = ["submitted", "resubmitted", "supplement_requested", "under_review", "ready_for_approval", "approved"];

type IrbMemberRow = {
  id: string;
  proposalId: string;
  userId: string;
  role: string;
  status: string;
  invitedById: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  activatedAt: Date | null;
  user?: { displayName: string } | null;
};

// Dữ liệu IRB là JSON lưu trên hồ sơ (irbMetadata); đọc lỏng để chịu được dữ liệu cũ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IrbLoose = Record<string, any>;
type IrbState = { council: IrbLoose; reviews: IrbLoose[]; conclusion: IrbLoose | null; certificate: IrbLoose | null } & IrbLoose;

function irbOf(proposal: { irbMetadata?: unknown }): IrbState {
  const raw = (proposal.irbMetadata && typeof proposal.irbMetadata === "object" ? proposal.irbMetadata : {}) as IrbLoose;
  return {
    ...raw,
    council: { status: "draft", members: [], ...(raw.council ?? {}) },
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
    conclusion: raw.conclusion ?? null,
    certificate: raw.certificate ?? null
  };
}

async function irbMemberRows(client: CouncilClient, proposalId: string): Promise<IrbMemberRow[]> {
  // CSDL giả lập của một số bộ test không có bảng này.
  if (!client.proposalIrbMember?.findMany) return [];
  return (await client.proposalIrbMember.findMany({ where: { proposalId }, include: { user: { select: { displayName: true } } }, orderBy: { invitedAt: "asc" } })) as IrbMemberRow[];
}

function toIrbMemberResponse(row: IrbMemberRow) {
  return {
    id: row.id,
    proposalId: row.proposalId,
    userId: row.userId,
    displayName: row.user?.displayName ?? null,
    role: row.role,
    roleLabel: IRB_ROLE_LABELS[row.role as IrbMemberRole] ?? row.role,
    status: row.status,
    statusLabel: IRB_MEMBER_STATUS_LABELS[row.status] ?? row.status,
    invitedAt: row.invitedAt?.toISOString?.() ?? null,
    acceptedAt: row.acceptedAt?.toISOString?.() ?? null,
    declinedAt: row.declinedAt?.toISOString?.() ?? null,
    declineReason: row.declineReason ?? null
  };
}

/**
 * Đồng bộ lời mời IRB với danh sách: người mới nhận lời mời; người đã được mời đúng vai trò giữ câu trả lời; người bị
 * bỏ hoặc đổi vai trò thì thu hồi lời mời; người đã từ chối không được mời lại tự động (chuyên viên thay người khác).
 */
async function syncIrbInvitations(tx: CouncilClient, actor: SafeUserContext, proposalId: string, members: IrbMemberInput[], now: Date) {
  const rows = (await tx.proposalIrbMember.findMany({ where: { proposalId, status: { in: [IRB_MEMBER_STATUS.invited, IRB_MEMBER_STATUS.accepted, IRB_MEMBER_STATUS.declined] } } })) as IrbMemberRow[];
  const wanted = new Map(members.map((member) => [member.userId, member.role]));
  for (const row of rows) {
    if ((row.status === IRB_MEMBER_STATUS.invited || row.status === IRB_MEMBER_STATUS.accepted) && wanted.get(row.userId) !== row.role) {
      await tx.proposalIrbMember.update({ where: { id: row.id }, data: { status: IRB_MEMBER_STATUS.revoked, revokedAt: now } });
    }
  }
  const created: Array<{ userId: string; role: IrbMemberRole }> = [];
  for (const [userId, role] of wanted) {
    if (rows.some((row) => row.userId === userId && row.role === role)) continue;
    await tx.proposalIrbMember.create({ data: { proposalId, userId, role, status: IRB_MEMBER_STATUS.invited, invitedById: actor.id, invitedAt: now } });
    created.push({ userId, role });
  }
  return created;
}

/** Lý do chưa trình được: ai chưa trả lời, ai đã từ chối (rỗng = mọi thành viên đã nhận lời). */
async function irbAcceptanceProblems(tx: CouncilClient, proposalId: string, members: IrbMemberInput[]) {
  const rows = (await tx.proposalIrbMember.findMany({ where: { proposalId, status: { in: [IRB_MEMBER_STATUS.invited, IRB_MEMBER_STATUS.accepted, IRB_MEMBER_STATUS.declined] } } })) as IrbMemberRow[];
  const pending: string[] = [];
  const declined: string[] = [];
  for (const member of members) {
    const mine = rows.filter((row) => row.userId === member.userId && row.role === member.role);
    if (mine.some((row) => row.status === IRB_MEMBER_STATUS.accepted)) continue;
    if (mine.some((row) => row.status === IRB_MEMBER_STATUS.declined) && !mine.some((row) => row.status === IRB_MEMBER_STATUS.invited)) declined.push(member.displayName);
    else pending.push(member.displayName);
  }
  const problems: string[] = [];
  if (pending.length) problems.push(`Chờ nhận lời: ${pending.join(", ")}.`);
  if (declined.length) problems.push(`Đã từ chối (cần thay người khác): ${declined.join(", ")}.`);
  return problems;
}

