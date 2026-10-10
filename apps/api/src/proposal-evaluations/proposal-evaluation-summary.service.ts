import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { councilCompositionProblems, councilReady, isScoringRole } from "../proposals-shared/evaluation-council-rules.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { runProposalMutation } from "../proposals-shared/proposal-mutation.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalParticipationService } from "../research-proposals/proposal-participation.service.js";
import {
  getRecommendationLabel,
  REVIEW_ASSIGNMENT_STATUS,
  REVIEW_MAX_TOTAL_SCORE,
  REVIEW_RECOMMENDATIONS,
  REVIEW_RECOMMENDATION_LABELS,
  REVIEW_STATUS,
  type ReviewRecommendation
} from "../proposals-shared/proposal-review-access.js";
import { assertCurrentCompletenessEvidence, findCurrentSubmission, sameEvidenceIds, type SubmissionEvidence } from "../proposals-shared/submission-evidence.js";
import { isWorkflowVisibleStatus, PROPOSAL_STATUS, PROPOSAL_STATUS_LABELS } from "../proposals-shared/proposal-workflow.js";
import {
  assertCanReadEvaluation,
  assertProposalStatus,
  isEvaluationCoordinator,
  findEvaluationProposal,
  resolveActorConflict,
  updateProposalStatusGuarded,
  type EvaluationProposalRecord,
  type EvaluationSummaryRecord,
  type ProposalReviewRecord,
  type ReviewAssignmentRecord
} from "./proposal-evaluation-support.js";
import { ProposalReviewAssignmentsService } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService } from "./proposal-reviews.service.js";

/**
 * Vòng đời bản tổng hợp (mang từ thanhdotien278/DocManS): lưu nháp → chốt → trình lãnh đạo.
 *   - draft: sửa thoải mái, không đổi trạng thái hồ sơ.
 *   - finalized: nội dung bị khoá cùng bằng chứng (lần nộp, danh sách phân công, danh sách phiếu); chỉ có thể
 *     mở lại về nháp trước khi trình.
 *   - ready_for_approval: đã trình; hồ sơ chuyển "chờ phê duyệt"; không sửa được nữa.
 * Mỗi bước tăng `revision`; lãnh đạo quyết định trên đúng revision đã xem (proposal-decisions.service.ts).
 */
export const EVALUATION_SUMMARY_STATUS = {
  draft: "draft",
  finalized: "finalized",
  readyForApproval: "ready_for_approval"
} as const;

export const EVALUATION_SUMMARY_STATUS_LABELS: Record<string, string> = {
  draft: "Bản nháp tổng hợp",
  finalized: "Đã chốt bản tổng hợp",
  ready_for_approval: "Đã trình lãnh đạo phê duyệt"
};

const PACKAGE_SCHEMA = "proposal-evaluation-package.v1";

type RoundState = { evidence: SubmissionEvidence; assignments: ReviewAssignmentRecord[]; reviews: ProposalReviewRecord[] };

@Injectable()
export class ProposalEvaluationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly assignments: ProposalReviewAssignmentsService,
    private readonly reviews: ProposalReviewsService,
    private readonly participation: ProposalParticipationService,
    private readonly reviewAccess: ProposalReviewAccessService
  ) {}

  private transactional = false;
  /** Nhật ký lỗi ghi ngoài giao dịch, để bản ghi "bị từ chối" không mất khi giao dịch bị huỷ. */
  private failureAudit?: AuditLogService;

  /** Khoá hồ sơ, kiểm tra contextVersion và đọc lại tài khoản trong một giao dịch Serializable. */
  private mutate<T>(actor: SafeUserContext, proposalId: string, context: unknown, work: (service: ProposalEvaluationSummaryService, currentActor: SafeUserContext) => Promise<T>) {
    return runProposalMutation(this.prisma, actor, proposalId, context, async (tx, currentActor) => {
      const participation = new ProposalParticipationService(tx);
      const reviewAccess = new ProposalReviewAccessService(tx);
      const auditLog = this.auditLog instanceof AuditLogService ? new AuditLogService(tx) : this.auditLog;
      const service = new ProposalEvaluationSummaryService(
        tx,
        auditLog,
        new ProposalReviewAssignmentsService(tx, auditLog, participation, reviewAccess),
        new ProposalReviewsService(tx, auditLog, reviewAccess, participation),
        participation,
        reviewAccess
      );
      service.transactional = true;
      service.failureAudit = this.auditLog;
      const result = await work(service, currentActor);
      await tx.researchProposal.update({ where: { id: proposalId }, data: { authorizationContextUpdatedAt: new Date() } });
      return result;
    });
  }

  /** AC-ST-3.4-01. Staff and leadership read; reviewers and PIs never see the panel roster. */
  async getReviewProgress(actor: SafeUserContext, proposalId: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    const access = actor ? await this.reviewAccess.resolveForProposal(actor.id, proposalId) : null;
    // Thư ký hội đồng của hồ sơ được xem tiến độ để tổng hợp; các vai trò khác theo quyền đọc đánh giá.
    const isCouncilSecretary = !!access?.isAssignedReviewer && access.assignmentRole === "committee_secretary" && isWorkflowVisibleStatus(proposal.status);
    if (!isCouncilSecretary) assertCanReadEvaluation(actor, proposal);
    if ((await this.participation.evaluateConflict(actor.id, proposalId)).conflicted) throw new BadRequestException({ message: "Không được xem dữ liệu phản biện của hồ sơ mình tham gia." });

    // Chỉ vòng đánh giá của lần nộp hiện tại; phân công và phiếu của lần nộp cũ không được tính.
    const round = await this.assignments.findCurrentRound(proposal);
    const summary = await this.findSummary(proposalId);
    // Chuyên viên/Trưởng phòng tự phân công mình chấm phiếu chỉ xem phiếu người khác sau khi đã gửi phiếu của mình,
    // để giữ tính độc lập của phản biện.
    const scoringPending = !!access?.isAssignedReviewer && isScoringRole(access.assignmentRole) &&
      !round.reviews.some((review) => review.assignmentId === access.assignmentId && review.status === REVIEW_STATUS.submitted);

    const progress = this.summarizeProgress(round.assignments, round.reviews);
    // Lãnh đạo, cơ quan giám sát: chỉ số liệu chung và bản tổng hợp; danh tính người phản biện, điểm và nhận xét
    // từng phiếu được bảo mật như ở gói quyết định (proposal-decisions.service.ts).
    if (!isCouncilSecretary && !isEvaluationCoordinator(actor, proposal)) {
      const { pendingReviewers: _pending, ...counts } = progress;
      return {
        proposalId,
        proposalStatus: proposal.status,
        proposalStatusLabel: PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status,
        submissionEventId: round.evidence?.eventId ?? null,
        ...counts,
        pendingReviewers: [],
        assignments: [],
        reviews: [],
        disclosure: { protectedReviewData: "REDACTED" },
        evaluationSummary: summary?.status === EVALUATION_SUMMARY_STATUS.readyForApproval ? this.toSummaryResponse(summary) : null,
        recommendations: REVIEW_RECOMMENDATIONS.map((code) => ({ code, label: REVIEW_RECOMMENDATION_LABELS[code] }))
      };
    }

    return {
      proposalId,
      proposalStatus: proposal.status,
      proposalStatusLabel: PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status,
      submissionEventId: round.evidence?.eventId ?? null,
      ...progress,
      assignments: round.assignments.map((assignment) => this.assignments.toAssignmentResponse(assignment, round.reviews)),
      reviews: round.reviews
        .filter((review) => review.status === REVIEW_STATUS.submitted && (!scoringPending || review.assignmentId === access?.assignmentId))
        .map((review) => this.reviews.toSubmittedReviewResponse(review)),
      evaluationSummary: this.toSummaryResponse(summary),
      recommendations: REVIEW_RECOMMENDATIONS.map((code) => ({ code, label: REVIEW_RECOMMENDATION_LABELS[code] }))
    };
  }

  /** Bước 1 — lưu nháp. Không bao giờ chuyển trạng thái hồ sơ; "chốt" và "trình" là thao tác riêng. */
  async saveEvaluationSummary(actor: SafeUserContext, proposalId: string, input: Record<string, unknown>): Promise<any> {
    if (!this.transactional) return this.mutate(actor, proposalId, input.contextVersion, (service, currentActor) => service.saveEvaluationSummary(currentActor, proposalId, input));
    if (input.markReady === true || input.markReady === "true") {
      throw new BadRequestException({ message: "Lưu nháp, chốt và trình lãnh đạo là các thao tác riêng." });
    }
    const proposal = await this.loadForConsolidation(actor, proposalId, "consolidate-evaluation");
    const summaryText = this.readSummaryText(input.summary);
    const recommendation = this.readRecommendation(input.recommendation);
    const round = await this.readRound(proposal);
    const existing = await this.findSummary(proposalId);
    if (existing && existing.status !== EVALUATION_SUMMARY_STATUS.draft) {
      throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Bản tổng hợp đã chốt hoặc đã trình lãnh đạo, không còn sửa được. Mở lại bản đã chốt nếu cần sửa." });
    }
    const progress = this.summarizeProgress(round.assignments, round.reviews);
    const now = new Date();
    const revision = (existing?.revision ?? 0) + 1;
    const evidenceSnapshot = this.packageEvidence(round, { lifecycle: EVALUATION_SUMMARY_STATUS.draft, revision, summary: summaryText, recommendation, at: now });
    const data = { summary: summaryText, recommendation, status: EVALUATION_SUMMARY_STATUS.draft, updatedById: actor.id, markedReadyAt: null, revision, contextVersion: input.contextVersion ?? null, evidenceSnapshot };
    const record = (existing
      ? await this.prisma.proposalEvaluationSummary.update({ where: { id: existing.id }, data: data as never })
      : await this.prisma.proposalEvaluationSummary.create({ data: { proposalId, createdById: actor.id, ...data } as never })) as EvaluationSummaryRecord;

    await this.prisma.auditLog.create({
      data: {
        action: "consolidate-evaluation",
        result: "success",
        actorId: actor.id,
        targetEntity: "proposal-evaluation-summary",
        targetEntityId: record.id,
        username: actor.username,
        reason: JSON.stringify({ proposalId, recommendation, summaryLength: summaryText.length, submittedReviews: progress.submittedCount, totalAssignments: progress.activeAssignmentCount, revision, submissionEventId: round.evidence.eventId })
      }
    });

    return { evaluationSummary: this.toSummaryResponse(record), proposalStatus: proposal.status };
  }

  /** Bước 2 — chốt: khoá nội dung cùng danh sách phân công và phiếu của vòng hiện tại (phải đủ phiếu, đúng thành phần). */
  async finalizeEvaluationSummary(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}): Promise<any> {
    if (!this.transactional) return this.mutate(actor, proposalId, input.contextVersion, (service, currentActor) => service.finalizeEvaluationSummary(currentActor, proposalId, input));
    const proposal = await this.loadForConsolidation(actor, proposalId, "finalize-evaluation-summary");
    const existing = await this.findSummary(proposalId);
    if (!existing || existing.status !== EVALUATION_SUMMARY_STATUS.draft) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Cần lưu bản nháp tổng hợp trước khi chốt." });
    this.assertExpectedRevision(existing, input);
    const round = await this.readRound(proposal);
    const progress = this.summarizeProgress(round.assignments, round.reviews);
    this.assertCompleteRound(progress);
    const draftEvidence = existing.evidenceSnapshot as Record<string, unknown> | null;
    // Phiếu hoặc phân công đổi sau lần lưu nháp cuối: phải lưu lại bản nháp (đọc lại phiếu) trước khi chốt.
    if (!draftEvidence || draftEvidence.submissionEventId !== round.evidence.eventId || !sameEvidenceIds(draftEvidence, round.assignments, round.reviews)) {
      throw new BadRequestException({ code: "PACKAGE_CONTEXT_MISMATCH", message: "Phiếu đánh giá đã thay đổi sau lần lưu nháp. Hãy lưu lại bản nháp tổng hợp trước khi chốt." });
    }
    const now = new Date();
    const revision = (existing.revision ?? 0) + 1;
    const evidenceSnapshot = {
      ...this.packageEvidence(round, { lifecycle: EVALUATION_SUMMARY_STATUS.finalized, revision, summary: existing.summary ?? "", recommendation: existing.recommendation ?? "", at: now }),
      averageTotalScore: progress.averageTotalScore,
      finalizedById: actor.id,
      finalizedAt: now.toISOString()
    };
    const record = (await this.prisma.proposalEvaluationSummary.update({
      where: { id: existing.id },
      data: { status: EVALUATION_SUMMARY_STATUS.finalized, updatedById: actor.id, revision, contextVersion: input.contextVersion ?? null, evidenceSnapshot } as never,
      include: { updatedBy: { select: { displayName: true } } }
    })) as EvaluationSummaryRecord;
    await this.recordLifecycleEvent(actor, proposal, "evaluation_summary_finalized", evidenceSnapshot, "Chốt bản tổng hợp đánh giá");
    await this.prisma.auditLog.create({ data: { action: "finalize-evaluation-summary", result: "success", actorId: actor.id, targetEntity: "proposal-evaluation-summary", targetEntityId: record.id, username: actor.username, reason: JSON.stringify({ proposalId, revision, submissionEventId: round.evidence.eventId }) } });
    return { evaluationSummary: this.toSummaryResponse(record), proposalStatus: proposal.status };
  }

  /** Mở lại bản đã chốt về nháp để sửa (chỉ khi chưa trình lãnh đạo). */
  async reopenEvaluationSummary(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}): Promise<any> {
    if (!this.transactional) return this.mutate(actor, proposalId, input.contextVersion, (service, currentActor) => service.reopenEvaluationSummary(currentActor, proposalId, input));
    const proposal = await this.loadForConsolidation(actor, proposalId, "reopen-evaluation-summary");
    const existing = await this.findSummary(proposalId);
    if (!existing || existing.status !== EVALUATION_SUMMARY_STATUS.finalized) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ bản tổng hợp đã chốt và chưa trình mới mở lại được." });
    this.assertExpectedRevision(existing, input);
    const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 1000) : "";
    if (!reason) throw new BadRequestException({ message: "Nêu lý do mở lại bản tổng hợp đã chốt." });
    const now = new Date();
    const revision = (existing.revision ?? 0) + 1;
    const evidenceSnapshot = { ...(existing.evidenceSnapshot as Record<string, unknown> | null ?? {}), lifecycle: EVALUATION_SUMMARY_STATUS.draft, revision, reopenedById: actor.id, reopenedAt: now.toISOString(), reopenReason: reason };
    const record = (await this.prisma.proposalEvaluationSummary.update({
      where: { id: existing.id },
      data: { status: EVALUATION_SUMMARY_STATUS.draft, updatedById: actor.id, revision, contextVersion: input.contextVersion ?? null, evidenceSnapshot } as never,
      include: { updatedBy: { select: { displayName: true } } }
    })) as EvaluationSummaryRecord;
    await this.recordLifecycleEvent(actor, proposal, "evaluation_summary_reopened", { revision, reason }, `Mở lại bản tổng hợp đã chốt: ${reason}`);
    await this.prisma.auditLog.create({ data: { action: "reopen-evaluation-summary", result: "success", actorId: actor.id, targetEntity: "proposal-evaluation-summary", targetEntityId: record.id, username: actor.username, reason: JSON.stringify({ proposalId, revision, reason }) } });
    return { evaluationSummary: this.toSummaryResponse(record), proposalStatus: proposal.status };
  }

  /** Bước 3 — trình lãnh đạo bản đã chốt, không sửa nội dung; hồ sơ chuyển "chờ phê duyệt". */
  async submitEvaluationPackage(actor: SafeUserContext, proposalId: string, input: Record<string, unknown> = {}): Promise<any> {
    if (!this.transactional) return this.mutate(actor, proposalId, input.contextVersion, (service, currentActor) => service.submitEvaluationPackage(currentActor, proposalId, input));
    const proposal = await this.loadForConsolidation(actor, proposalId, "submit-evaluation-package");
    const existing = await this.findSummary(proposalId);
    if (!existing || existing.status !== EVALUATION_SUMMARY_STATUS.finalized) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Bản tổng hợp phải được chốt trước khi trình lãnh đạo." });
    this.assertExpectedRevision(existing, input);
    const round = await this.readRound(proposal);
    const finalizedEvidence = existing.evidenceSnapshot as Record<string, unknown> | null;
    if (!finalizedEvidence || finalizedEvidence.lifecycle !== EVALUATION_SUMMARY_STATUS.finalized || finalizedEvidence.submissionEventId !== round.evidence.eventId || !sameEvidenceIds(finalizedEvidence, round.assignments, round.reviews)) {
      throw new BadRequestException({ code: "PACKAGE_CONTEXT_MISMATCH", message: "Bản tổng hợp đã chốt không còn khớp với phân công và phiếu hiện tại. Hãy mở lại, lưu và chốt lại." });
    }
    const progress = this.summarizeProgress(round.assignments, round.reviews);
    this.assertCompleteRound(progress);

    const now = new Date();
    await updateProposalStatusGuarded(this.prisma as unknown as Parameters<typeof updateProposalStatusGuarded>[0], proposalId, PROPOSAL_STATUS.underReview, PROPOSAL_STATUS.readyForApproval);
    const record = (await this.prisma.proposalEvaluationSummary.update({
      where: { id: existing.id },
      data: { status: EVALUATION_SUMMARY_STATUS.readyForApproval, updatedById: actor.id, markedReadyAt: now } as never,
      include: { updatedBy: { select: { displayName: true } } }
    })) as EvaluationSummaryRecord;
    // Phân công còn mở của vòng được đóng cùng vòng: người được phân công không giữ quyền ghi khi hồ sơ đã rời bước đánh giá.
    await this.prisma.proposalReviewAssignment.updateMany({
      where: { proposalId, reviewedSubmissionEventId: round.evidence.eventId, status: REVIEW_ASSIGNMENT_STATUS.assigned },
      data: { status: REVIEW_ASSIGNMENT_STATUS.completed, completedAt: now } as never
    });
    await this.prisma.researchProposal.update({
      where: { id: proposalId },
      data: { authorizationRelationshipVersion: { increment: 1 }, authorizationDelegationVersion: { increment: 1 }, authorizationContextUpdatedAt: now } as never
    });
    await this.prisma.proposalSubmissionEvent.create({
      data: {
        proposalId,
        actorId: actor.id,
        fromStatus: PROPOSAL_STATUS.underReview,
        toStatus: PROPOSAL_STATUS.readyForApproval,
        submittedAt: now,
        snapshot: { kind: "evaluation_package_submitted", schemaVersion: PACKAGE_SCHEMA, revision: existing.revision ?? 0, submissionEventId: round.evidence.eventId },
        note: "Trình gói đánh giá đã chốt tới lãnh đạo phê duyệt"
      } as never
    });
    await this.prisma.auditLog.create({ data: { action: "mark-ready-for-approval", result: "success", actorId: actor.id, targetEntity: "proposal-evaluation-summary", targetEntityId: record.id, username: actor.username, reason: JSON.stringify({ proposalId, revision: existing.revision ?? 0, submittedReviews: progress.submittedCount, fromStatus: PROPOSAL_STATUS.underReview, toStatus: PROPOSAL_STATUS.readyForApproval }) } });
    return { evaluationSummary: this.toSummaryResponse(record), proposalStatus: PROPOSAL_STATUS.readyForApproval };
  }

  async findSummary(proposalId: string) {
    return (await this.prisma.proposalEvaluationSummary.findFirst({
      where: { proposalId },
      include: { updatedBy: { select: { displayName: true } } }
    })) as EvaluationSummaryRecord | null;
  }

  toSummaryResponse(summary: EvaluationSummaryRecord | null) {
    if (!summary) {
      return null;
    }

    const evidence = summary.evidenceSnapshot as { reopenReason?: unknown } | null | undefined;
    return {
      id: summary.id,
      proposalId: summary.proposalId,
      summary: summary.summary,
      recommendation: summary.recommendation,
      recommendationLabel: getRecommendationLabel(summary.recommendation),
      status: summary.status,
      statusLabel: EVALUATION_SUMMARY_STATUS_LABELS[summary.status] ?? summary.status,
      revision: summary.revision ?? 0,
      reopenReason: summary.status === EVALUATION_SUMMARY_STATUS.draft && typeof evidence?.reopenReason === "string" ? evidence.reopenReason : "",
      createdById: summary.createdById,
      updatedById: summary.updatedById,
      updatedByDisplayName: summary.updatedBy?.displayName ?? "",
      markedReadyAt: summary.markedReadyAt?.toISOString() ?? "",
      createdAt: summary.createdAt.toISOString(),
      updatedAt: summary.updatedAt.toISOString()
    };
  }

  /**
   * Completion is measured against assignments that are still part of the round: a revoked
   * assignment must not hold the proposal back, and a completed one counts as done.
   */
  summarizeProgress(assignments: ReviewAssignmentRecord[], reviews: ProposalReviewRecord[]) {
    const active = assignments.filter((assignment) => assignment.status !== REVIEW_ASSIGNMENT_STATUS.revoked);
    const submitted = reviews.filter((review) => review.status === REVIEW_STATUS.submitted && active.some((assignment) => assignment.id === review.assignmentId));
    const submittedAssignmentIds = new Set(submitted.map((review) => review.assignmentId));
    // Thư ký hội đồng không chấm phiếu, nên không bao giờ "chờ phiếu".
    const pending = active.filter((assignment) => isScoringRole(assignment.assignmentRole) && !submittedAssignmentIds.has(assignment.id));
    const scored = submitted.map((review) => review.totalScore).filter((score): score is number => typeof score === "number");

    return {
      activeAssignmentCount: active.length,
      submittedCount: submitted.length,
      pendingCount: pending.length,
      pendingReviewers: pending.map((assignment) => ({
        assignmentId: assignment.id,
        reviewerUserId: assignment.reviewerUserId,
        reviewerDisplayName: assignment.reviewer?.displayName ?? ""
      })),
      // Đủ thành phần (2–3 phản biện, 3–5 thành viên, 1 thư ký, không trùng người) và mọi phiếu đã gửi.
      allReviewsSubmitted: councilReady(active, submittedAssignmentIds),
      councilProblems: councilCompositionProblems(active),
      averageTotalScore: scored.length ? Math.round((scored.reduce((sum, score) => sum + score, 0) / scored.length) * 10) / 10 : null,
      maxTotalScore: REVIEW_MAX_TOTAL_SCORE
    };
  }

  /**
   * Người được tổng hợp (quy định 10/2026): chuyên viên, Trưởng phòng QLKH có phạm vi đơn vị, hoặc thư ký hội đồng
   * của chính hồ sơ; không tham gia đề tài và không phải người đã chấm phiếu. Chỉ khi hồ sơ đang đánh giá.
   */
  private async loadForConsolidation(actor: SafeUserContext, proposalId: string, action: string) {
    const proposal = await findEvaluationProposal(this.prisma, proposalId);
    if (!isEvaluationCoordinator(actor, proposal)) {
      const access = actor ? await this.reviewAccess.resolveForProposal(actor.id, proposalId) : null;
      if (!access?.isAssignedReviewer || access.assignmentRole !== "committee_secretary") {
        throw new ForbiddenException({ message: "Chỉ chuyên viên, Trưởng phòng QLKH hoặc thư ký hội đồng của hồ sơ được tổng hợp kết quả." });
      }
      // Thư ký phải là thư ký của vòng đánh giá hiện tại, không phải của một lần nộp trước.
      const current = await findCurrentSubmission(this.prisma, proposal);
      const assignment = (await this.prisma.proposalReviewAssignment.findUnique({ where: { id: access.assignmentId } })) as { reviewedSubmissionEventId?: string | null } | null;
      if (!current || assignment?.reviewedSubmissionEventId !== current.eventId) {
        throw new ForbiddenException({ code: "STALE_ASSIGNMENT_CONTEXT", message: "Phân công thư ký không còn gắn với phiên bản nộp hiện tại của hồ sơ." });
      }
    }
    assertProposalStatus(proposal, [PROPOSAL_STATUS.underReview], "Chỉ hồ sơ đang đánh giá mới được tổng hợp, chốt hoặc trình kết quả.");
    const conflict = await resolveActorConflict({ participation: this.participation, reviewAccess: this.reviewAccess }, actor?.id, proposalId);
    if (conflict.conflicted) {
      await (this.failureAudit ?? this.auditLog).record({
        action,
        result: "failure",
        actorId: actor.id,
        targetEntity: "proposal-evaluation-summary",
        targetEntityId: proposalId,
        username: actor.username,
        reason: JSON.stringify({ proposalId, reasonCode: conflict.reasonCode, reason: conflict.reason })
      });
      throw new BadRequestException({ message: conflict.viewerMessage, reasonCode: conflict.reasonCode });
    }
    return proposal;
  }

  private async readRound(proposal: EvaluationProposalRecord): Promise<RoundState> {
    // Mọi thao tác tổng hợp cần kết quả kiểm tra đầy đủ của đúng lần nộp hiện tại.
    await assertCurrentCompletenessEvidence(this.prisma, proposal);
    const round = await this.assignments.findCurrentRound(proposal);
    return { evidence: round.evidence!, assignments: round.assignments, reviews: round.reviews };
  }

  private packageEvidence(round: RoundState, options: { lifecycle: string; revision: number; summary: string; recommendation: string; at: Date }) {
    return {
      kind: "evaluation_package",
      schemaVersion: PACKAGE_SCHEMA,
      lifecycle: options.lifecycle,
      revision: options.revision,
      submissionEventId: round.evidence.eventId,
      assignmentIds: round.assignments.map((assignment) => assignment.id),
      reviewIds: round.reviews.filter((review) => review.status === REVIEW_STATUS.submitted).map((review) => review.id),
      summary: options.summary,
      recommendation: options.recommendation,
      capturedAt: options.at.toISOString()
    };
  }

  /** Nếu client gửi revision đang xem, bản tổng hợp phải còn đúng revision đó. */
  private assertExpectedRevision(summary: EvaluationSummaryRecord, input: Record<string, unknown>) {
    if (input.revision === undefined || input.revision === null || input.revision === "") return;
    if (Number(input.revision) !== (summary.revision ?? 0)) {
      throw new BadRequestException({ code: "PACKAGE_CONTEXT_MISMATCH", message: "Bản tổng hợp vừa được người khác thay đổi. Vui lòng tải lại." });
    }
  }

  private async recordLifecycleEvent(actor: SafeUserContext, proposal: EvaluationProposalRecord, kind: string, snapshot: Record<string, unknown>, note: string) {
    await this.prisma.proposalSubmissionEvent.create({
      data: { proposalId: proposal.id, actorId: actor.id, fromStatus: proposal.status, toStatus: proposal.status, submittedAt: new Date(), snapshot: { ...snapshot, kind }, note } as never
    });
  }

  private assertCompleteRound(progress: ReturnType<ProposalEvaluationSummaryService["summarizeProgress"]>) {
    if (!progress.allReviewsSubmitted) {
      throw new BadRequestException({
        message: progress.councilProblems.length ? `Thành phần hội đồng chưa đúng quy định: ${progress.councilProblems.join(" ")}` : "Còn phiếu đánh giá chưa gửi.",
        pendingReviewers: progress.pendingReviewers
      });
    }
  }

  private readSummaryText(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException({ message: "Nhập nội dung tổng hợp kết quả đánh giá." });
    }

    const trimmed = value.trim();
    if (trimmed.length > 5000) {
      throw new BadRequestException({ message: "Nội dung tổng hợp không được vượt quá 5000 ký tự." });
    }

    return trimmed;
  }

  private readRecommendation(value: unknown) {
    if (typeof value !== "string" || !REVIEW_RECOMMENDATIONS.includes(value as ReviewRecommendation)) {
      throw new BadRequestException({ message: "Chọn kết luận tổng hợp hợp lệ." });
    }

    return value;
  }
}
