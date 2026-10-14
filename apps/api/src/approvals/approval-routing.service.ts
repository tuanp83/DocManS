import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { NOTIFICATION_TYPES, type WorkflowEvent } from "../notifications/workflow-events.js";
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STAGE_LABELS,
  APPROVAL_STATUS_LABELS,
  type ApprovalStage,
  type ApprovalSubmissionRow
} from "../proposals-shared/approval-routing.js";
import { getOrganizationScopeIds, isLeadership, isResearchBoardHead, isResearchManagementHead, isResearchManagementStaff, isScienceDeputyDirector } from "../proposals-shared/proposal-access.js";

const MAX_NOTE = 2000;
const INBOX_LIMIT = 300;

type StepRow = { id: string; stage: string; action: string; note: string | null; createdAt: Date; actor?: { displayName: string } | null };

/**
 * Xử lý hồ sơ trình ở Phòng KHQS (proposals-shared/approval-routing.ts):
 *   - Trưởng ban QLKH: rà soát và trình Trưởng phòng, hoặc trả lại chuyên viên.
 *   - Trưởng phòng KHQS: duyệt gửi Ban giám đốc, hoặc trả lại chuyên viên.
 * Không bỏ bước; trả lại luôn về chuyên viên và đưa thủ tục về trạng thái sửa được.
 */
@Injectable()
export class ApprovalRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService
  ) {}

  /** Hàng chờ của người xem: bước mình xử lý; chuyên viên xem tờ trình mình đã lập. */
  async inbox(actor: SafeUserContext) {
    const scopeIds = getOrganizationScopeIds(actor);
    let where: Record<string, unknown>;
    if (isResearchBoardHead(actor)) where = { stage: "BOARD_REVIEW", status: "PENDING", hostOrganizationUnitId: { in: scopeIds } };
    else if (isResearchManagementHead(actor)) where = { stage: "HEAD_REVIEW", status: "PENDING", hostOrganizationUnitId: { in: scopeIds } };
    else if (isLeadership(actor)) where = { stage: "LEADERSHIP", status: "PENDING" };
    else if (isScienceDeputyDirector(actor)) where = { stage: "LEADERSHIP", status: "PENDING", signer: "DIRECTOR_OR_SCIENCE_DEPUTY" };
    else if (isResearchManagementStaff(actor)) where = { submittedById: actor.id };
    else throw new ForbiddenException({ message: "Không có hàng chờ tờ trình cho vai trò này." });
    const rows = (await this.prisma.approvalSubmission.findMany({
      where,
      include: { submittedBy: { select: { displayName: true } }, steps: { include: { actor: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: INBOX_LIMIT
    } as never)) as unknown as Array<ApprovalSubmissionRow & { submittedBy?: { displayName: string } | null; steps: StepRow[] }>;
    return {
      role: isResearchBoardHead(actor) ? "board_head" : isResearchManagementHead(actor) ? "head" : isLeadership(actor) || isScienceDeputyDirector(actor) ? "leadership" : "staff",
      submissions: rows.map((row) => this.toResponse(row))
    };
  }

  /**
   * Tờ trình đang mở (gọn) để các trang lọc: trang Phê duyệt của Ban giám đốc chỉ hiện thủ tục đã tới bước ký;
   * trang hồ sơ/đề tài hiện "đang chờ Trưởng ban/Trưởng phòng".
   */
  async pending(actor: SafeUserContext, subjectType: string) {
    if (!["proposal", "project"].includes(subjectType)) throw new BadRequestException({ message: "Loại đối tượng không hợp lệ." });
    const academyWide = isLeadership(actor) || isScienceDeputyDirector(actor);
    const where: Record<string, unknown> = { subjectType, status: "PENDING", ...(academyWide ? {} : { hostOrganizationUnitId: { in: getOrganizationScopeIds(actor) } }) };
    const rows = (await this.prisma.approvalSubmission.findMany({ where, select: { id: true, kind: true, subjectId: true, subjectRef: true, stage: true, signer: true } } as never)) as unknown as Array<{ id: string; kind: string; subjectId: string; subjectRef: string; stage: ApprovalStage; signer: string }>;
    return { pending: rows.map((row) => ({ ...row, stageLabel: APPROVAL_STAGE_LABELS[row.stage] })) };
  }

  /** Lịch sử trình duyệt của một hồ sơ/đề tài (cho trang chi tiết). */
  async forSubject(actor: SafeUserContext, subjectType: string, subjectId: string) {
    if (!["proposal", "project"].includes(subjectType)) throw new BadRequestException({ message: "Loại đối tượng không hợp lệ." });
    const rows = (await this.prisma.approvalSubmission.findMany({
      where: { subjectType, subjectId },
      include: { submittedBy: { select: { displayName: true } }, steps: { include: { actor: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 50
    } as never)) as unknown as Array<ApprovalSubmissionRow & { submittedBy?: { displayName: string } | null; steps: StepRow[] }>;
    // Đọc theo phạm vi đơn vị (Ban giám đốc toàn Học viện); chủ nhiệm và người ngoài Phòng không xem hồ sơ trình nội bộ.
    const academyWide = isLeadership(actor) || isScienceDeputyDirector(actor);
    const scopeIds = getOrganizationScopeIds(actor);
    const internal = academyWide || isResearchBoardHead(actor) || isResearchManagementHead(actor) || isResearchManagementStaff(actor) || actor.systemRole === "RESEARCH_MANAGEMENT_DEPUTY_HEAD";
    if (!internal) throw new ForbiddenException({ message: "Không có quyền xem hồ sơ trình nội bộ." });
    return { submissions: rows.filter((row) => academyWide || scopeIds.includes(row.hostOrganizationUnitId)).map((row) => this.toResponse(row)) };
  }

  /** Trưởng ban trình Trưởng phòng; Trưởng phòng duyệt gửi Ban giám đốc. */
  async advance(actor: SafeUserContext, submissionId: string, input: { note?: unknown }) {
    const note = readNote(input.note, false);
    const { submission, event } = await this.prisma.$transaction(async (tx) => {
      const submission = await this.lockPending(tx, submissionId);
      this.assertStageActor(actor, submission);
      const next: ApprovalStage = submission.stage === "BOARD_REVIEW" ? "HEAD_REVIEW" : "LEADERSHIP";
      const updated = (await tx.approvalSubmission.update({ where: { id: submission.id }, data: { stage: next, lastNote: note ?? submission.lastNote } })) as unknown as ApprovalSubmissionRow;
      await tx.approvalStep.create({ data: { submissionId: submission.id, stage: submission.stage, action: submission.stage === "BOARD_REVIEW" ? "FORWARD" : "APPROVE", actorId: actor.id, note } });
      await tx.auditLog.create({ data: { action: submission.stage === "BOARD_REVIEW" ? "forward-approval-submission" : "approve-approval-submission", result: "success", actorId: actor.id, targetEntity: "approval-submission", targetEntityId: submission.id, username: actor.username, reason: JSON.stringify({ kind: submission.kind, subjectId: submission.subjectId, toStage: next, note }) } });
      const recipients = next === "HEAD_REVIEW" ? await this.usersInScope(tx, "RESEARCH_MANAGEMENT_HEAD", submission.hostOrganizationUnitId) : await this.signers(tx, submission.signer);
      return { submission: updated, event: this.event(updated, recipients, next === "HEAD_REVIEW" ? `Trưởng ban QLKH đã trình: ${APPROVAL_KIND_LABELS[updated.kind]}` : `Trưởng phòng KHQS trình Ban giám đốc: ${APPROVAL_KIND_LABELS[updated.kind]}`, note) };
    });
    await this.dispatch(event);
    return this.toResponse(submission as never);
  }

  /** Trả lại chuyên viên lập (bắt buộc lý do); thủ tục quay về trạng thái sửa được. */
  async returnToStaff(actor: SafeUserContext, submissionId: string, input: { note?: unknown }) {
    const note = readNote(input.note, true)!;
    const { submission, event } = await this.prisma.$transaction(async (tx) => {
      const submission = await this.lockPending(tx, submissionId);
      this.assertStageActor(actor, submission);
      const updated = (await tx.approvalSubmission.update({ where: { id: submission.id }, data: { status: "RETURNED", stage: "CLOSED", closedAt: new Date(), lastNote: note } })) as unknown as ApprovalSubmissionRow;
      await tx.approvalStep.create({ data: { submissionId: submission.id, stage: submission.stage, action: "RETURN", actorId: actor.id, note } });
      await revertOnReturn(tx, submission, actor, note);
      await tx.auditLog.create({ data: { action: "return-approval-submission", result: "success", actorId: actor.id, targetEntity: "approval-submission", targetEntityId: submission.id, username: actor.username, reason: JSON.stringify({ kind: submission.kind, subjectId: submission.subjectId, fromStage: submission.stage, note }) } });
      return { submission: updated, event: this.event(updated, [submission.submittedById], `Tờ trình bị trả lại: ${APPROVAL_KIND_LABELS[updated.kind]}`, note) };
    });
    await this.dispatch(event);
    return this.toResponse(submission as never);
  }

  private async lockPending(tx: any, submissionId: string) {
    await tx.$queryRaw`SELECT id FROM approval_submissions WHERE id = ${submissionId} FOR UPDATE`;
    const submission = (await tx.approvalSubmission.findUnique({ where: { id: submissionId } })) as ApprovalSubmissionRow | null;
    if (!submission) throw new NotFoundException({ message: "Không tìm thấy tờ trình." });
    if (submission.status !== "PENDING") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Tờ trình đã được xử lý hoặc bị trả lại." });
    return submission;
  }

  /** Đúng người, đúng bước, đúng phạm vi đơn vị: Trưởng ban ở bước rà soát, Trưởng phòng ở bước duyệt. */
  private assertStageActor(actor: SafeUserContext, submission: ApprovalSubmissionRow) {
    const expected = submission.stage === "BOARD_REVIEW" ? isResearchBoardHead(actor) : submission.stage === "HEAD_REVIEW" ? isResearchManagementHead(actor) : false;
    if (!expected) {
      throw new ForbiddenException({ code: "APPROVAL_STAGE_DENIED", message: `Tờ trình đang ở bước "${APPROVAL_STAGE_LABELS[submission.stage]}"; đồng chí không xử lý bước này.` });
    }
    if (!getOrganizationScopeIds(actor).includes(submission.hostOrganizationUnitId)) throw new ForbiddenException({ message: "Tờ trình ngoài phạm vi đơn vị của đồng chí." });
    if (submission.submittedById === actor.id) throw new ForbiddenException({ message: "Không tự rà soát tờ trình của chính mình." });
  }

  private async usersInScope(tx: any, systemRole: string, organizationUnitId: string) {
    const rows = (await tx.user.findMany({ where: { status: "active", systemRole, organizationScopes: { some: { organizationUnitId } } }, select: { id: true } })) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private async signers(tx: any, signer: string) {
    const roles = signer === "DIRECTOR" ? ["LEADERSHIP_APPROVAL_AUTHORITY"] : ["LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR"];
    const rows = (await tx.user.findMany({ where: { status: "active", systemRole: { in: roles } }, select: { id: true } })) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private event(submission: ApprovalSubmissionRow, userIds: string[], title: string, note: string | null | undefined): WorkflowEvent {
    return {
      type: NOTIFICATION_TYPES.approvalRouting,
      userIds,
      title: `${title} — ${submission.title}`,
      message: `${APPROVAL_KIND_LABELS[submission.kind]}: ${submission.title}. ${APPROVAL_STAGE_LABELS[submission.stage] ?? ""}${note ? `. Ghi chú: ${note}` : ""}`,
      link: submission.stage === "LEADERSHIP" ? "/approvals" : "/submissions",
      metadata: { submissionId: submission.id, kind: submission.kind, subjectId: submission.subjectId, stage: submission.stage }
    };
  }

  private async dispatch(event: WorkflowEvent) {
    if (!this.notifications || !event.userIds.length) return;
    try {
      await this.notifications.dispatch([event]);
    } catch {
      // Thông báo là phụ trợ.
    }
  }

  private toResponse(row: ApprovalSubmissionRow & { submittedBy?: { displayName: string } | null; steps?: StepRow[] }) {
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: APPROVAL_KIND_LABELS[row.kind] ?? row.kind,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      subjectRef: row.subjectRef,
      title: row.title,
      link: row.subjectType === "proposal" ? `/proposals/${row.subjectId}` : `/projects/${row.subjectId}`,
      stage: row.stage,
      stageLabel: APPROVAL_STAGE_LABELS[row.stage] ?? row.stage,
      status: row.status,
      statusLabel: APPROVAL_STATUS_LABELS[row.status] ?? row.status,
      signer: row.signer,
      signerLabel: row.signer === "DIRECTOR" ? "Giám đốc" : "Giám đốc hoặc Phó GĐ phụ trách Khoa học",
      submittedByName: row.submittedBy?.displayName ?? "",
      lastNote: row.lastNote ?? "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      steps: (row.steps ?? []).map((step) => ({ stage: step.stage, action: step.action, actorName: step.actor?.displayName ?? "", note: step.note ?? "", createdAt: step.createdAt.toISOString() }))
    };
  }
}

function readNote(value: unknown, required: boolean) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadRequestException({ message: "Nhập lý do trả lại." });
    return null;
  }
  if (typeof value !== "string") throw new BadRequestException({ message: "Ghi chú không hợp lệ." });
  const trimmed = value.trim();
  if (required && !trimmed) throw new BadRequestException({ message: "Nhập lý do trả lại." });
  if (trimmed.length > MAX_NOTE) throw new BadRequestException({ message: `Ghi chú tối đa ${MAX_NOTE} ký tự.` });
  return trimmed || null;
}

/** Trả lại thì thủ tục về trạng thái chuyên viên sửa được (theo từng loại thủ tục). */
async function revertOnReturn(tx: any, submission: ApprovalSubmissionRow, actor: SafeUserContext, note: string) {
  const returnedInfo = { returnReason: note, returnedAt: new Date().toISOString(), returnedByName: actor.displayName };
  switch (submission.kind) {
    case "EVALUATION_COUNCIL": {
      const proposal = await tx.researchProposal.findUnique({ where: { id: submission.subjectId }, select: { councilMetadata: true } });
      const council = (proposal?.councilMetadata ?? {}) as Record<string, unknown>;
      if (council.status === "submitted") await tx.researchProposal.update({ where: { id: submission.subjectId }, data: { councilMetadata: { ...council, status: "returned", ...returnedInfo } } });
      return;
    }
    case "IRB_COUNCIL": {
      const proposal = await tx.researchProposal.findUnique({ where: { id: submission.subjectId }, select: { irbMetadata: true } });
      const irb = (proposal?.irbMetadata ?? {}) as Record<string, any>;
      if (irb.council?.status === "submitted") await tx.researchProposal.update({ where: { id: submission.subjectId }, data: { irbMetadata: { ...irb, council: { ...irb.council, status: "returned", ...returnedInfo } } } });
      return;
    }
    case "IRB_CERTIFICATE": {
      // Kết luận về lại thư ký hội đồng để sửa; chuyên viên trình lại sau khi thư ký chốt.
      const proposal = await tx.researchProposal.findUnique({ where: { id: submission.subjectId }, select: { irbMetadata: true } });
      const irb = (proposal?.irbMetadata ?? {}) as Record<string, any>;
      if (irb.conclusion?.status === "submitted") await tx.researchProposal.update({ where: { id: submission.subjectId }, data: { irbMetadata: { ...irb, conclusion: { ...irb.conclusion, status: "returned", ...returnedInfo } } } });
      return;
    }
    case "DECISION_PACKAGE": {
      // Gói đánh giá về lại "đã chốt": người điều phối mở lại để sửa hoặc trình lại.
      const moved = await tx.researchProposal.updateMany({ where: { id: submission.subjectId, status: "ready_for_approval" }, data: { status: "under_review" } });
      if (moved.count) {
        await tx.proposalEvaluationSummary.updateMany({ where: { proposalId: submission.subjectId, status: "ready_for_approval" }, data: { status: "finalized" } });
        await tx.proposalSubmissionEvent.create({ data: { proposalId: submission.subjectId, actorId: actor.id, fromStatus: "ready_for_approval", toStatus: "under_review", submittedAt: new Date(), note: `Phòng KHQS trả lại gói đánh giá: ${note}` } });
      }
      return;
    }
    case "PROJECT_EXTENSION":
      await tx.projectRequest.updateMany({ where: { id: submission.subjectRef, status: "ready_for_head_decision" }, data: { status: "under_staff_validation" } });
      return;
    case "PROJECT_ADJUSTMENT":
      await tx.projectRequest.updateMany({ where: { id: submission.subjectRef, status: "ready_for_head_decision" }, data: { status: "under_staff_review" } });
      return;
    default:
      // Hội đồng nghiệm thu, thanh lý: dự thảo vẫn ở nguyên để chuyên viên sửa và trình lại.
      return;
  }
}

