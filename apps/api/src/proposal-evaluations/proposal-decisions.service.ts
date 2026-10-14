import { assertCurrentCompletenessEvidence, currentRoundAssignments, currentRoundReviews, sameEvidenceIds } from "../proposals-shared/submission-evidence.js";
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
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
  assertCanManageIRB,
  assertCanReadEvaluation,
  assertEvaluationCoordinator,
  assertProposalStatus,
  assertScientificManagementScope,
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
import { councilEstablishedEvent, reviewInvitationEvent } from "./evaluation-notifications.js";
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
const IRB_RISK_LEVELS = ["MINIMAL", "LOW", "HIGH"];

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

      // Conditional on the status we validated, so two authorities deciding at once cannot both win.
      await updateProposalStatusGuarded(tx, proposalId, proposal.status, toStatus);

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
          message: `Hồ sơ ${name} đã được phê duyệt. Vui lòng lập đề tài thực hiện và phân công chuyên viên phụ trách.`,
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
    const result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
      invitedNow = [];
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
          if (problems.length) throw new BadRequestException({ code: "COUNCIL_NOT_ACCEPTED", message: `Chưa trình lãnh đạo được: ${problems.join(" ")}` });
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
    await this.notifyAfterCommit(() => invitedNow.map((item) => reviewInvitationEvent(proposalId, invitedFor, item.userId, item.role, item.dueDate)));
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
  // PHÊ DUYỆT HỘI ĐỒNG ĐẠO ĐỨC Y SINH (IRB) (Strict RBAC)
  // =========================================================================================

  async getIRBInfo(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    await assertCanReadEvaluation(this.prisma, actor, proposal);

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
    await this.assertNoDecisionConflict(actor, proposal);
    const existingIrb = (proposal.irbMetadata as Record<string, unknown>) || {};
    if (existingIrb.certificate) {
      throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hồ sơ đã có kết luận IRB, không thể đề xuất lại hội đồng." });
    }

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
    assertCouncilSigningAuthority(actor);
    await this.assertNoDecisionConflict(actor, proposal);

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
    const decisionDate = readIsoDate(input.decisionDate, "decisionDate") ?? new Date().toISOString();
    const validUntil = readIsoDate(input.validUntil, "validUntil") ?? new Date(Date.parse(decisionDate) + 365 * 24 * 3600 * 1000).toISOString();
    if (Date.parse(validUntil) <= Date.parse(decisionDate)) {
      throw new BadRequestException({ message: "Ngày hết hiệu lực phải sau ngày quyết định." });
    }
    const riskLevel = input.riskLevel === undefined || input.riskLevel === null || input.riskLevel === "" ? "LOW" : input.riskLevel;
    if (typeof riskLevel !== "string" || !IRB_RISK_LEVELS.includes(riskLevel)) {
      throw new BadRequestException({ message: "Mức độ rủi ro IRB không hợp lệ." });
    }
    const targetSubjects = readOptionalText(input.targetSubjects, "targetSubjects", 2000) ?? "Bệnh nhân và đối tượng can thiệp y học";
    const ethicsNotes = readOptionalText(input.ethicsNotes, "ethicsNotes", 5000) ?? "Hội đồng Đạo đức trong nghiên cứu Y sinh học thông qua đề cương nghiên cứu.";

    let notice: { ownerId: string; label: string; certificateNumber: string | null } | null = null;
    let result;
    try {
      result = await this.mutateEvaluationMetadata(actor, proposalId, input, async ({ tx, actor, proposal, auditLog }) => {
        // Lãnh đạo Học viện, hoặc cán bộ QLKH có phạm vi đơn vị chủ trì của hồ sơ.
        assertCanManageIRB(actor, proposal);
        await this.assertNoDecisionConflict(actor, proposal);

        const current = (proposal.irbMetadata as Record<string, unknown>) || {};
        // Kết luận IRB chỉ ghi được sau khi hội đồng đã được lãnh đạo duyệt và có nhận xét của thành viên.
        const council = (current.council as Record<string, unknown> | undefined) ?? {};
        const reviews = (current.reviews as Array<Record<string, unknown>> | undefined) ?? [];
        if (council.status !== "approved") {
          throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Hội đồng IRB chưa được phê duyệt, chưa thể ghi kết luận." });
        }
        if (!reviews.some((review) => review.status === "submitted")) {
          throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chưa có nhận xét nào của thành viên Hội đồng IRB." });
        }
        const previous = (current.certificate as Record<string, unknown> | null | undefined) ?? null;
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
          validUntil,
          riskLevel,
          targetSubjects,
          ethicsNotes,
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
      await this.notifications?.createNotification({
        userId: committed.ownerId,
        title: "Hội đồng Y đức (IRB)",
        message: `Hồ sơ đạo đức của đề tài ${committed.label} đã được cấp Giấy chứng nhận: ${status === "APPROVED" ? "Đã phê duyệt" : "Chưa phê duyệt"}.`,
        type: "IRB_UPDATE",
        link: `/research-proposals/${proposalId}?tab=irb`,
        metadata: { proposalId, status, certificateNumber: committed.certificateNumber }
      }).catch(() => undefined);
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
