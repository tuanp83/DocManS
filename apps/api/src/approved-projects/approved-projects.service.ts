import { Prisma } from "@prisma/client";
import { jsonValue } from "../proposals-shared/prisma-json.js";
import { joinedTransaction } from "../proposals-shared/proposal-mutation.js";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service.js";
import { label, councilSignerUserIds, leadershipUserIds, NOTIFICATION_TYPES, projectLink, vnDate, type WorkflowEvent } from "../notifications/workflow-events.js";
import { randomUUID } from "node:crypto";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { readTransactionClockV1 } from "../permissions/authorization-v1.service.js";
import { getOrganizationScopeIds } from "../proposals-shared/proposal-access.js";
import { APPROVAL_KINDS, assertReadyForLeadership, boardReviewEvent, closeApprovalSubmission, openApprovalSubmission, pendingApprovalStages } from "../proposals-shared/approval-routing.js";
import { canAssignProjectOfficer, canDecideProjectExtension, canMonitorProjects, isInProjectScope, isProjectStaff, readsAllProjects } from "./project-roles.js";
import { isRelationshipActiveAt } from "../proposals-shared/proposal-participation.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { assertProposalContext } from "../proposals-shared/proposal-mutation.js";
import { CLOSED_ACCEPTANCE_ROUND_STATUSES, projectContextVersion, projectViewerAuthorizationV1, PROJECT_STATUSES, type ProjectOfficerFact } from "./project-capability-v1.js";
import { toAcceptanceResponse, toFinanceSummary, toLiquidationResponse, toProductResponse, toSuperiorResponse } from "./project-closure-model.js";
import { baselineFromMilestones, calendarDayIndex, HEALTH_APPLICABLE_STATUSES, HEALTH_LEVELS, localDayIndex, resolveEffectiveHealth, validateDeclaredWeights, type HealthLevel } from "./project-progress.js";
import { computeProgressForProject, summarizeProjectProgress } from "./project-progress-summary.js";
import type { AssignProjectOfficerDto, HealthAssessmentDto, MilestoneProgressDto, ProjectDecisionDto, ProjectMutationDto, ProjectReportDto, ProjectReportReviewDto, ProjectReportSubmissionDto, ProjectRequestDto, RevokeProjectOfficerDto } from "./approved-projects.dto.js";
import { assertAdjustmentValues, assertExtensionValues, MILESTONE_CHANGE_KEYS, optionalText, parseAdjustmentValues, projectDay, requiredText, storedContextVersion, type AdjustmentValues } from "./project-request-values.js";
import { readScopeSnapshot } from "./project-snapshots.js";
import { readProposalSnapshot } from "../proposals-shared/proposal-snapshot.js";

const PREPARING = PROJECT_STATUSES.preparing;
const EXECUTING = PROJECT_STATUSES.executing;
const REPORT_DRAFT = "draft";
const REPORT_SUBMITTED = "submitted";
const REPORT_UNDER_REVIEW = "under_review";
const REPORT_SUPPLEMENT = "supplement_requested";
const REPORT_ACCEPTED = "accepted";
const ADJUSTMENT = "adjustment";
const EXTENSION = "extension";

/** Chuyên viên phụ trách đang hiệu lực (bản ghi phân công). */
type CurrentOfficer = ProjectOfficerFact & { id: string };

/** Quyền thao tác của người xem trên đề tài (ViewerAuthorizationV1). */
type ProjectCapability = ReturnType<typeof projectViewerAuthorizationV1>;

/** Dữ kiện ghi vào lịch sử khi xử lý đề nghị: lý do/ghi chú, trạng thái trước/sau và các trường bổ sung. */
type RequestActionFacts = { reason?: string | null; note?: string | null; before?: unknown; after?: unknown; [key: string]: unknown };

const PROJECT_INCLUDE = {
  proposal: { select: { id: true, ownerId: true, title: true, status: true, startDate: true, endDate: true, budgetMetadata: true, owner: { select: { displayName: true, username: true } } } },
  hostOrganizationUnit: { select: { id: true, code: true, name: true } },
  members: { include: { user: { select: { id: true, displayName: true, username: true, status: true } } }, orderBy: { createdAt: "asc" } },
  managementOfficers: { include: { officer: { select: { id: true, displayName: true, username: true, status: true, systemRole: true, unit: true } }, assignedBy: { select: { displayName: true } } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] },
  milestones: { orderBy: [{ dueDate: "asc" }, { position: "asc" }] },
  checkpoints: { orderBy: { dueDate: "asc" } },
  reports: { include: { evidence: { include: { fileRecord: true } }, checkpoint: true, author: { select: { displayName: true, username: true } }, reviewedBy: { select: { displayName: true, username: true } } }, orderBy: [{ revision: "desc" }] },
  requests: { include: { revisions: { orderBy: { revision: "desc" } }, evidence: { include: { fileRecord: true } }, requester: { select: { displayName: true, username: true } }, decisionBy: { select: { displayName: true, username: true } }, preparedBy: { select: { displayName: true, username: true } } }, orderBy: { createdAt: "desc" } },
  history: { orderBy: { createdAt: "desc" } },
  baselines: { orderBy: { version: "asc" } },
  healthAssessments: { include: { assessedBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
  acceptances: { include: { submittedBy: { select: { displayName: true } }, establishedBy: { select: { displayName: true } }, minutesRecordedBy: { select: { displayName: true } } }, orderBy: { round: "desc" } },
  finance: true,
  liquidation: { include: { preparedBy: { select: { displayName: true } }, approvedBy: { select: { displayName: true } } } },
  products: { include: { reviews: { include: { formedBy: { select: { displayName: true } }, recordedBy: { select: { displayName: true } } }, orderBy: { round: "desc" } } }, orderBy: { position: "asc" } },
  superiorAcceptance: { include: { sentBy: { select: { displayName: true } }, resultRecordedBy: { select: { displayName: true } } } }
} satisfies Prisma.ApprovedProjectInclude;

/** Đề tài tải kèm đầy đủ quan hệ theo PROJECT_INCLUDE (kiểu do Prisma sinh từ chính câu truy vấn). */
export type LoadedProject = Prisma.ApprovedProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

/** Đề nghị điều chỉnh / gia hạn kèm các phiên bản và minh chứng. */
type ProjectRequestWithRevisions = Prisma.ProjectRequestGetPayload<{ include: { revisions: true; evidence: true } }>;

export type NotifyFn = (event: WorkflowEvent) => void;

/** Vòng nghiệm thu gần nhất (số vòng lớn nhất) và trạng thái thanh lý: dữ kiện cho capability. */
type AcceptanceRow = LoadedProject["acceptances"][number];

export function closureFacts(project: Pick<LoadedProject, "acceptances" | "liquidation" | "superiorAcceptance">) {
  const latest = (project.acceptances ?? []).reduce<AcceptanceRow | null>((best, row) => (!best || row.round > best.round ? row : best), null);
  return { acceptanceStatus: latest?.status ?? null, liquidationStatus: project.liquidation?.status ?? null, superiorStatus: project.superiorAcceptance?.status ?? null, latestAcceptance: latest };
}

export function openAcceptanceRound(project: LoadedProject) {
  const latest = closureFacts(project).latestAcceptance;
  return latest && !CLOSED_ACCEPTANCE_ROUND_STATUSES.includes(latest.status) ? latest : null;
}

@Injectable()
export class ApprovedProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService, @Optional() private readonly notifications?: NotificationsService) {}

  /**
   * Mọi thao tác ghi trên đề tài: khoá dòng đề tài, đọc lại người dùng, đối chiếu contextVersion, chạy trong
   * giao dịch Serializable. Sự kiện thông báo được gom qua `notify` và chỉ phát sau khi giao dịch commit.
   */
  async mutate<T>(actor: SafeUserContext, projectId: string, expected: unknown, work: (tx: Prisma.TransactionClient, currentActor: SafeUserContext, project: LoadedProject, notify: NotifyFn) => Promise<T>): Promise<T> {
    const events: WorkflowEvent[] = [];
    // Xung đột tuần tự hoá (P2034) có thể đến từ dòng dùng chung (bộ đếm số văn bản) chứ không phải đề tài này:
    // thử lại tối đa 3 lần; nếu đề tài thật sự đã đổi, assertProjectContext ở lần thử lại trả 409.
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result: T = await this.prisma.$transaction(async (tx) => {
          events.length = 0;
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`;
          const currentActor = await this.readCurrentActor(tx, actor.id);
          await tx.$queryRaw`SELECT id FROM approved_projects WHERE id = ${projectId} FOR UPDATE`;
          const project: LoadedProject | null = await tx.approvedProject.findUnique({ where: { id: projectId }, include: PROJECT_INCLUDE });
          if (!project) throw new NotFoundException({ message: "Không tìm thấy đề tài đã được duyệt." });
          assertProjectContext(expected, project);
          return work(tx, currentActor, project, (event) => { events.push(event); });
        }, { isolationLevel: "Serializable", timeout: 15000 });
        if (events.length && this.notifications) await this.notifications.dispatch([...events]).catch(() => undefined);
        return result;
      } catch (error) {
        if (errorCode(error) === "P2034" && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 40) * (attempt + 1)));
          continue;
        }
        const denied = errorCode(error) === "P2034" ? new ConflictException({ code: "CONTEXT_VERSION_MISMATCH" }) : error;
        const evidence = denied as { code?: unknown; response?: { code?: unknown } } | null | undefined;
        await this.auditLog.record({ action: "project-mutation-denied", result: "failure", actorId: actor.id, targetEntity: "approved-project", targetEntityId: projectId, username: actor.username, reason: String(evidence?.response?.code ?? evidence?.code ?? "ACTION_NOT_GRANTED") }).catch(() => undefined);
        throw denied;
      }
    }
  }

  /** Người nhận theo vai trò trên đề tài (đọc trong giao dịch, trước khi commit). */
  projectRecipients(project: LoadedProject, officer?: { officerUserId: string } | null) {
    const now = new Date();
    const active = (project.members ?? []).filter((member) => member.userId && isRelationshipActiveAt(member, now));
    return {
      pi: active.filter((member) => member.participationRole === "TOPIC_PI").map((member) => member.userId as string),
      team: active.map((member) => member.userId as string),
      officer: officer?.officerUserId ? [officer.officerUserId] : []
    };
  }

  async readCurrentActor(tx: Prisma.TransactionClient, actorId: string): Promise<SafeUserContext> {
    const user = await tx.user.findUnique({ where: { id: actorId }, include: { organizationScopes: { include: { organizationUnit: true } } } });
    if (!user || user.status !== "active") throw new ForbiddenException({ code: "ACCOUNT_INACTIVE", message: "Tài khoản hiện không hoạt động." });
    return {
      id: user.id,
      username: user.username ?? "",
      displayName: user.displayName,
      systemRole: user.systemRole as SafeUserContext["systemRole"],
      unit: user.unit,
      organizationScopes: (user.organizationScopes ?? []).filter((scope) => scope.organizationUnit?.status === "active").map((scope) => ({ id: scope.organizationUnit.id, code: scope.organizationUnit.code, name: scope.organizationUnit.name }))
    };
  }

  assertScope(actor: SafeUserContext, project: { hostOrganizationUnitId: string }) {
    if (!isInProjectScope(actor, project.hostOrganizationUnitId)) throw new ForbiddenException({ code: "ORG_SCOPE_DENIED", message: "Không có phạm vi tổ chức phù hợp cho đề tài." });
  }

  async currentOfficer(tx: Prisma.TransactionClient, projectId: string, asOf = new Date()): Promise<CurrentOfficer | null> {
    const rows = await tx.projectManagementOfficer.findMany({ where: { projectId, status: "ACTIVE" }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
    const active = rows.filter((row) => isRelationshipActiveAt(row, asOf));
    if (active.length > 1) throw new ConflictException({ code: "CONTEXT_AMBIGUOUS", message: "Phân công chuyên viên của đề tài không rõ ràng." });
    return active[0] ?? null;
  }

  async assertOfficer(tx: Prisma.TransactionClient, actor: SafeUserContext, project: LoadedProject) {
    this.assertScope(actor, project);
    if (this.activeMember(project, actor.id)) throw new ForbiddenException({ code: "CONFLICT_DENIED" });
    await this.assertNoEvaluationConflict(tx, actor.id, project.proposalId);
    const officer = await this.currentOfficer(tx, project.id);
    if (isProjectStaff(actor) && officer?.officerUserId === actor.id) return officer;
    throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Bạn chưa được phân công quản lý đề tài này." });
  }

  async assertNoEvaluationConflict(tx: Prisma.TransactionClient, userId: string, proposalId: string) {
    const conflict = await new ProposalReviewAccessService(joinedTransaction(tx)).resolveConflictForProposal(userId, proposalId);
    if (conflict.unresolved) throw new ConflictException({ code: "CONTEXT_UNRESOLVED" });
    if (conflict.isAssignedReviewer || conflict.hasPersistedReview) throw new ForbiddenException({ code: "CONFLICT_DENIED" });
  }

  async loadAuthorized(tx: Prisma.TransactionClient, actor: SafeUserContext, projectId: string, preloaded?: LoadedProject) {
    const project: LoadedProject | null = preloaded ?? await tx.approvedProject.findUnique({ where: { id: projectId }, include: PROJECT_INCLUDE });
    if (!project) throw new NotFoundException({ message: "Không tìm thấy đề tài đã được duyệt." });
    const officer = await this.currentOfficer(tx, projectId);
    const actorMember = (project.members ?? []).find((member) => member.userId === actor.id && isRelationshipActiveAt(member, new Date()));
    const projectPi = (project.members ?? []).find((member) => member.participationRole === "TOPIC_PI" && isRelationshipActiveAt(member, new Date()));
    const participant = !!actorMember && actorMember.participationRole !== "TOPIC_PI";
    const responsibleMember = !!actorMember && project.milestones.some((milestone) => milestone.responsibleMemberId === actorMember.id && milestone.status !== "completed");
    const facts = closureFacts(project);
    // Tờ trình đang mở của đề tài: Ban giám đốc chỉ thấy nút ký khi tờ trình đã qua Trưởng ban và Trưởng phòng.
    const routing = (await pendingApprovalStages(tx, "project", [projectId])).get(projectId) ?? {};
    const capability = projectViewerAuthorizationV1({ actor, project: { ...project, ownerId: projectPi?.userId ?? "" }, projectOfficer: officer, participant: { isParticipant: participant, role: actorMember?.participationRole, effectiveFrom: actorMember?.effectiveFrom?.toISOString?.(), effectiveUntil: actorMember?.effectiveUntil?.toISOString?.() }, responsibleMember, closure: { acceptanceStatus: facts.acceptanceStatus, liquidationStatus: facts.liquidationStatus, superiorStatus: facts.superiorStatus }, routing: Object.fromEntries(Object.entries(routing).map(([kind, value]) => [kind, value!.stage])) });
    if (!capability.allowedActions.includes("project.read")) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Không có quyền xem đề tài này." });
    return { project, officer, capability };
  }

  async listProjects(actor: SafeUserContext, options: { overdue?: boolean; approaching?: boolean; health?: HealthLevel; skipUnresolved?: boolean; mine?: boolean } = {}) {
    const scopeIds = getOrganizationScopeIds(actor);
    // "Đề tài của tôi": chỉ đề tài người dùng làm chủ nhiệm hoặc đang là thành viên, với mọi vai trò.
    const participating = { OR: [{ members: { some: { userId: actor.id, status: "ACTIVE" } } }, { proposal: { ownerId: actor.id } }] };
    // Ban giám đốc, Trưởng phòng, Trưởng ban xem toàn Học viện; các vai trò khác lọc theo phạm vi đơn vị hoặc quan hệ với đề tài.
    const where = readsAllProjects(actor) ? {} : scopeIds.length ? { OR: [{ hostOrganizationUnitId: { in: scopeIds } }, { members: { some: { userId: actor.id, status: "ACTIVE" } } }, { proposal: { ownerId: actor.id } }] } : { OR: [{ members: { some: { userId: actor.id, status: "ACTIVE" } } }, { proposal: { ownerId: actor.id } }] };
    const records = await this.prisma.approvedProject.findMany({ where: options.mine ? { AND: [where, participating] } : where, include: PROJECT_INCLUDE, orderBy: { createdAt: "desc" } });
    const visible = [];
    for (const project of records) {
      try {
        // Dùng lại bản ghi vừa tải (cùng PROJECT_INCLUDE) thay vì tải lại từng đề tài.
        const loaded = await this.loadAuthorized(this.prisma, actor, project.id, project);
        const response = this.toProjectResponse(loaded.project, loaded.capability, loaded.officer, actor);
        if (options.overdue !== undefined && response.overdue !== options.overdue) continue;
        if (options.approaching !== undefined && response.approaching !== options.approaching) continue;
        if (options.health !== undefined && response.progressSummary.level !== options.health) continue;
        visible.push(response);
      } catch (error) {
        if (error instanceof ForbiddenException) continue;
        // "Việc của tôi": một đề tài có phân công chuyên viên mâu thuẫn không được làm hỏng cả danh sách.
        if (options.skipUnresolved && error instanceof ConflictException) continue;
        throw error;
      }
    }
    return visible;
  }

  async getProject(actor: SafeUserContext, projectId: string) {
    const loaded = await this.loadAuthorized(this.prisma, actor, projectId);
    return this.toProjectResponse(loaded.project, loaded.capability, loaded.officer, actor);
  }

  async listMonitoring(actor: SafeUserContext, options: { overdue?: boolean; approaching?: boolean; health?: HealthLevel } = {}) {
    if (!canMonitorProjects(actor)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Không có quyền theo dõi đề tài." });
    return this.listProjects(actor, options);
  }

  toProjectResponse(project: LoadedProject, capability: ProjectCapability, officer: CurrentOfficer | null, actor?: SafeUserContext) {
    const now = new Date();
    const member = (project.members ?? []).find((item) => item.userId === actor?.id && isRelationshipActiveAt(item, now));
    const isPi = member?.participationRole === "TOPIC_PI";
    const isOfficer = !!actor && isProjectStaff(actor) && officer?.officerUserId === actor.id;
    // "isHead" của nhánh chính = người quyết định gia hạn; ở nhánh này là lãnh đạo.
    const isHead = !!actor && canDecideProjectExtension(actor);
    const detailedCases = isPi || isOfficer || isHead;
    const deadlines = [project.endDate, ...(project.checkpoints ?? []).filter((item) => item.status !== "completed").map((item) => item.dueDate), ...(project.milestones ?? []).filter((item) => item.status !== "completed").map((item) => item.dueDate)].filter((value): value is Date => value instanceof Date);
    const nearest = deadlines.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    // So sánh theo ngày lịch (giờ Việt Nam): mốc đến hạn hôm nay chưa bị coi là quá hạn.
    const daysLeft = nearest ? calendarDayIndex(nearest) - localDayIndex(now) : null;
    const overdue = daysLeft !== null && daysLeft < 0 && [PREPARING, EXECUTING, PROJECT_STATUSES.paused].some((status) => status === project.status);
    const approaching = daysLeft !== null && !overdue && daysLeft <= 14;
    return {
      id: project.id,
      code: project.code,
      proposalId: project.proposalId,
      title: project.title,
      status: project.status,
      hostOrganizationUnitId: project.hostOrganizationUnitId,
      hostOrganizationUnit: project.hostOrganizationUnit,
      source: { proposalId: project.proposalId, submissionEventId: project.sourceSubmissionEventId, decisionId: project.sourceDecisionId },
      startDate: project.startDate?.toISOString?.() ?? null,
      endDate: project.endDate?.toISOString?.() ?? null,
      scope: project.scopeSnapshot,
      plan: project.planSnapshot,
      members: (project.members ?? []).map((member) => ({ ...member, effectiveFrom: member.effectiveFrom?.toISOString?.() ?? null, effectiveUntil: member.effectiveUntil?.toISOString?.() ?? null })),
      officer: officer ? { id: officer.id, officerUserId: officer.officerUserId, officerName: (project.managementOfficers ?? []).find((row) => row.officerUserId === officer.officerUserId)?.officer?.displayName ?? null, status: officer.status, effectiveFrom: officer.effectiveFrom?.toISOString?.() ?? null, effectiveUntil: officer.effectiveUntil?.toISOString?.() ?? null } : null,
      milestones: project.milestones ?? [],
      checkpoints: project.checkpoints ?? [],
      reports: (project.reports ?? []).map((report) => detailedCases ? ({
        id: report.id, projectId: report.projectId, checkpointId: report.checkpointId, revision: report.revision, status: report.status,
        reportingPeriodStart: report.reportingPeriodStart?.toISOString?.() ?? null, reportingPeriodEnd: report.reportingPeriodEnd?.toISOString?.() ?? null, deadline: report.deadline?.toISOString?.() ?? null,
        progressResults: report.progressResults, issuesRecommendations: report.issuesRecommendations, milestoneContext: report.milestoneContext, author: report.author,
        reviewedBy: report.reviewedBy, reviewReason: actor && (isProjectStaff(actor) || canDecideProjectExtension(actor)) ? report.reviewReason : undefined,
        responseDeadline: report.responseDeadline?.toISOString?.() ?? null, submittedAt: report.submittedAt?.toISOString?.() ?? null,
        evidence: (report.evidence ?? []).map((item) => ({ id: item.id, fileRecordId: item.fileRecordId, file: item.fileRecord ? { id: item.fileRecord.id, originalFileName: item.fileRecord.originalFileName, mimeType: item.fileRecord.mimeType, sizeBytes: item.fileRecord.sizeBytes, status: item.fileRecord.status } : null }))
      }) : ({ id: report.id, checkpointId: report.checkpointId, status: report.status, revision: report.revision, deadline: report.deadline?.toISOString?.() ?? null, submittedAt: report.submittedAt?.toISOString?.() ?? null })),
      requests: (project.requests ?? []).map((request) => detailedCases && (!isHead || request.requestType === EXTENSION) ? ({
        id: request.id, projectId: request.projectId, requestType: request.requestType, status: request.status, revision: request.revision, requester: request.requester,
        currentValues: request.currentValues, proposedValues: request.proposedValues, reason: request.reason, decisionNote: request.decisionNote, responseDeadline: request.responseDeadline?.toISOString?.() ?? null, decidedAt: request.decidedAt?.toISOString?.() ?? null,
        appraisal: actor && ((isProjectStaff(actor) && request.requestType === ADJUSTMENT) || (canDecideProjectExtension(actor) && request.requestType === EXTENSION)) ? request.appraisal : undefined,
        preparedAt: request.preparedAt?.toISOString?.() ?? null, preparedBy: request.preparedBy, revisions: request.revisions, evidence: (request.evidence ?? []).map((item) => ({ id: item.id, requestRevisionId: item.requestRevisionId, fileRecordId: item.fileRecordId, file: item.fileRecord ? { id: item.fileRecord.id, originalFileName: item.fileRecord.originalFileName, mimeType: item.fileRecord.mimeType, sizeBytes: item.fileRecord.sizeBytes, status: item.fileRecord.status } : null }))
      }) : ({ id: request.id, requestType: request.requestType, status: request.status, createdAt: request.createdAt?.toISOString?.() ?? null, decidedAt: request.decidedAt?.toISOString?.() ?? null })),
      history: (project.history ?? []).map((item) => ({ id: item.id, action: item.action, fromStatus: item.fromStatus, toStatus: item.toStatus, reason: detailedCases ? item.reason : undefined, createdAt: item.createdAt?.toISOString?.() ?? null, beforeFacts: isOfficer || isHead ? item.beforeFacts : undefined, afterFacts: isOfficer || isHead ? item.afterFacts : undefined })),
      overdue,
      approaching,
      nearestDeadline: nearest?.toISOString?.() ?? null,
      progressSummary: this.progressSummary(project, now),
      closedAt: project.closedAt?.toISOString?.() ?? null,
      closureNote: project.closureNote ?? null,
      acceptances: (project.acceptances ?? []).map((row) => toAcceptanceResponse(row)),
      finance: capability.allowedActions?.includes("project.finance.read") ? toFinanceSummary(project.finance) : null,
      liquidation: project.liquidation ? toLiquidationResponse(project.liquidation) : null,
      level: readScopeSnapshot(project.scopeSnapshot).proposalTypeCode ?? null,
      products: (project.products ?? []).map((row) => toProductResponse(row)),
      superiorAcceptance: project.superiorAcceptance ? toSuperiorResponse(project.superiorAcceptance, now) : null,
      viewerAuthorization: capability
    };
  }

  // ---- Tiến độ (docs/design/quan-ly-tien-do-nhiem-vu.md) -------------------------------------------------

  private computeProgress(project: LoadedProject, now = new Date()) {
    return computeProgressForProject(project, now);
  }

  private progressSummary(project: LoadedProject, now = new Date()) {
    return summarizeProjectProgress(project, now);
  }

  /** Mốc mà người xem được cập nhật tiến độ: chủ nhiệm mọi mốc đang mở, thành viên mốc mình phụ trách. */
  private updatableMilestoneIds(project: LoadedProject, capability: ProjectCapability, actor: SafeUserContext) {
    if (!capability.allowedActions?.includes("project.progress.update")) return [];
    const now = new Date();
    const member = (project.members ?? []).find((item) => item.userId === actor.id && isRelationshipActiveAt(item, now));
    if (!member) return [];
    return (project.milestones ?? []).filter((item) => item.status !== "completed" && (member.participationRole === "TOPIC_PI" || item.responsibleMemberId === member.id)).map((item) => item.id);
  }

  async getProgress(actor: SafeUserContext, projectId: string) {
    const loaded = await this.loadAuthorized(this.prisma, actor, projectId);
    const project = loaded.project;
    const now = new Date();
    const progress = this.computeProgress(project, now);
    const effective = resolveEffectiveHealth(progress.level, (project.healthAssessments ?? [])[0]);
    const updates = await this.prisma.projectMilestoneProgressUpdate.findMany({ where: { projectId }, include: { author: { select: { displayName: true } }, milestone: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
    // Cùng quy tắc che như lịch sử đề tài (toProjectResponse): lý do đánh giá và ghi chú chỉ cho chủ nhiệm,
    // chuyên viên phụ trách và lãnh đạo; người cập nhật luôn thấy ghi chú của chính mình.
    const viewerMember = (project.members ?? []).find((item) => item.userId === actor.id && isRelationshipActiveAt(item, now));
    const detailed = viewerMember?.participationRole === "TOPIC_PI" || (isProjectStaff(actor) && loaded.officer?.officerUserId === actor.id) || canDecideProjectExtension(actor);
    return {
      projectId,
      status: project.status,
      ...progress,
      effectiveLevel: effective.level,
      levelSource: effective.source,
      needsReassessment: effective.needsReassessment,
      baselines: (project.baselines ?? []).map((row) => ({ id: row.id, version: row.version, source: row.source, sourceRequestId: row.sourceRequestId, startDate: row.startDate?.toISOString?.() ?? null, endDate: row.endDate?.toISOString?.() ?? null, milestoneCount: Array.isArray(row.milestones) ? row.milestones.length : 0, createdAt: row.createdAt?.toISOString?.() ?? null })),
      assessments: (project.healthAssessments ?? []).map((row) => ({ id: row.id, level: row.level, computedLevel: row.computedLevel, reason: detailed ? row.reason : null, assessedBy: row.assessedBy?.displayName ?? null, createdAt: row.createdAt?.toISOString?.() ?? null })),
      updates: updates.map((row) => ({ id: row.id, milestoneId: row.milestoneId, milestoneTitle: row.milestone?.title ?? null, previousPercent: row.previousPercent, progressPercent: row.progressPercent, note: detailed || row.authorId === actor.id ? row.note : null, author: row.author?.displayName ?? null, createdAt: row.createdAt?.toISOString?.() ?? null })),
      updatableMilestoneIds: this.updatableMilestoneIds(project, loaded.capability, actor),
      viewerAuthorization: loaded.capability
    };
  }

  async updateMilestoneProgress(actor: SafeUserContext, projectId: string, input: MilestoneProgressDto & { milestoneId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      if (project.status !== EXECUTING) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ cập nhật tiến độ khi đề tài đang thực hiện." });
      const loaded = await this.loadAuthorized(tx, currentActor, project.id);
      const milestone = (project.milestones ?? []).find((item) => item.id === input.milestoneId);
      if (!milestone) throw new NotFoundException({ message: "Không tìm thấy mốc của đề tài." });
      if (milestone.status === "completed") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Mốc đã hoàn thành; tiến độ được chốt theo báo cáo đã chấp nhận." });
      if (!this.updatableMilestoneIds(project, loaded.capability, currentActor).includes(milestone.id)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chủ nhiệm hoặc thành viên phụ trách mốc được cập nhật tiến độ mốc này." });
      const progressPercent = input.progressPercent as number;
      if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 99) throw new BadRequestException({ code: "PROGRESS_INVALID", message: "Nhập từ 0 đến 99%. Mốc chỉ đạt 100% khi báo cáo của mốc được chuyên viên chấp nhận." });
      const now = await readTransactionClockV1(tx);
      const update = await tx.projectMilestoneProgressUpdate.create({ data: { projectId: project.id, milestoneId: milestone.id, previousPercent: milestone.progressPercent ?? 0, progressPercent, note: input.note ?? null, authorId: currentActor.id, createdAt: now } });
      const updated = await tx.projectMilestone.update({ where: { id: milestone.id }, data: { progressPercent, progressUpdatedAt: now } });
      // Không tăng aggregateVersion: cập nhật tiến độ không được làm mất hiệu lực bản nháp yêu cầu của chủ nhiệm.
      const facts = { milestoneId: milestone.id, previousPercent: milestone.progressPercent ?? 0, progressPercent };
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.progress.update", reason: input.note ?? null, beforeFacts: { milestoneId: milestone.id, progressPercent: milestone.progressPercent ?? 0 }, afterFacts: facts } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "update-project-milestone-progress", result: "success", actorId: currentActor.id, targetEntity: "project-milestone", targetEntityId: milestone.id, username: currentActor.username, reason: input.note ?? undefined, beforeFacts: { progressPercent: milestone.progressPercent ?? 0 }, afterFacts: { progressPercent } });
      return { milestone: updated, update };
    });
  }

  async assessHealth(actor: SafeUserContext, projectId: string, input: HealthAssessmentDto) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.assertOfficer(tx, currentActor, project);
      if (!HEALTH_APPLICABLE_STATUSES.includes(project.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ đánh giá sức khoẻ khi đề tài đang thực hiện hoặc tạm dừng." });
      if (!HEALTH_LEVELS.includes(input.level)) throw new BadRequestException({ message: "Mức sức khoẻ không hợp lệ." });
      const reason = requiredText(input.reason, "reason");
      const now = await readTransactionClockV1(tx);
      const progress = this.computeProgress(project, now);
      const computedFacts = { plannedPercent: progress.plannedPercent, actualPercent: progress.actualPercent, spi: progress.spi, maxDaysOverdue: progress.maxDaysOverdue, lateReports: progress.lateReports, reasons: progress.reasons };
      const assessment = await tx.projectHealthAssessment.create({ data: { projectId: project.id, level: input.level, computedLevel: progress.level, reason, computedFacts, assessedById: currentActor.id, createdAt: now } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.health.assess", reason, beforeFacts: { computedLevel: progress.level }, afterFacts: { level: input.level, ...computedFacts } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "assess-project-health", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, reason, beforeFacts: { computedLevel: progress.level }, afterFacts: { level: input.level } });
      return assessment;
    });
  }

  /** Tạo phiên bản kế hoạch gốc mới từ các mốc hiện hành (không sửa phiên bản cũ). */
  private async createBaseline(tx: Prisma.TransactionClient, projectId: string, actorId: string, source: "setup" | "adjustment" | "extension", sourceRequestId: string | null, now: Date) {
    const project = await tx.approvedProject.findUnique({ where: { id: projectId } });
    const milestones = await tx.projectMilestone.findMany({ where: { projectId }, orderBy: [{ dueDate: "asc" }, { position: "asc" }] });
    const latest = await tx.projectPlanBaseline.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    return tx.projectPlanBaseline.create({ data: { projectId, version: (latest?.version ?? 0) + 1, source, sourceRequestId, startDate: project?.startDate ?? null, endDate: project?.endDate ?? null, milestones: baselineFromMilestones(milestones), createdById: actorId, createdAt: now } });
  }

  async createFromApprovedProposal(actor: SafeUserContext, proposalId: string, input: ProjectMutationDto = {}) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM research_proposals WHERE id = ${proposalId} FOR UPDATE`;
      const currentActor = await this.readCurrentActor(tx, actor.id);
      if (!isProjectStaff(currentActor)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chuyên viên quản lý khoa học có phạm vi đơn vị mới được tạo đề tài." });
      const proposal = await tx.researchProposal.findUnique({ where: { id: proposalId }, include: { members: true, hostOrganizationUnit: true, owner: { select: { displayName: true, username: true } } } });
      if (!proposal) throw new NotFoundException({ message: "Không tìm thấy đề xuất nguồn." });
      if (proposal.status !== "approved") throw new BadRequestException({ code: "SOURCE_NOT_APPROVED", message: "Đề xuất nguồn chưa được phê duyệt." });
      assertProposalContext(input.contextVersion, proposal);
      this.assertScope(currentActor, { hostOrganizationUnitId: proposal.hostOrganizationUnitId });
      const participation = (proposal.members ?? []).some((member: any) => member.userId === currentActor.id && isRelationshipActiveAt(member, new Date()));
      if (proposal.ownerId === currentActor.id || participation) throw new ForbiddenException({ code: "CONFLICT_DENIED", message: "Người tham gia đề xuất không được tạo đề tài nguồn." });
      // Nhánh này không có "chuyên viên phụ trách đề xuất": chuyên viên QLKH có phạm vi đơn vị (đã kiểm tra
      // ở assertScope) và không tham gia đề xuất được tạo đề tài.

      const existing = await tx.approvedProject.findUnique({ where: { proposalId }, include: PROJECT_INCLUDE });
      if (existing) {
        return { id: existing.id, proposalId, status: existing.status };
      }
      const decision = await tx.proposalDecision.findFirst({ where: { proposalId, decision: "approved" }, orderBy: { decidedAt: "desc" } });
      // Quyết định ở nhánh này không ghi kèm mã lần nộp: phiên bản được duyệt là lần nộp/nộp lại chính
      // thức gần nhất trước thời điểm quyết định (bỏ qua bản ghi "kiểm tra đầy đủ").
      const submissions: Array<{ id: string; proposalId: string; toStatus: string; snapshot: Prisma.JsonValue }> = decision ? await tx.proposalSubmissionEvent.findMany({ where: { proposalId, toStatus: { in: ["submitted", "resubmitted"] }, submittedAt: { lte: decision.decidedAt } }, orderBy: { submittedAt: "desc" } }) : [];
      const submission = submissions.find((event) => {
        const eventSnapshot = readProposalSnapshot(event.snapshot);
        return !!eventSnapshot && !eventSnapshot.kind && eventSnapshot.id === proposalId;
      }) ?? null;
      if (!submission || submission.proposalId !== proposalId || !["submitted", "resubmitted"].includes(submission.toStatus) || !decision) throw new BadRequestException({ code: "SOURCE_EVIDENCE_MISSING", message: "Không tìm thấy phiên bản nộp gắn với quyết định phê duyệt." });
      const snapshot = readProposalSnapshot(submission.snapshot);
      if (!snapshot || snapshot.id !== proposalId || !snapshot.ownerId || !Array.isArray(snapshot.members)) throw new BadRequestException({ code: "SOURCE_EVIDENCE_MISSING" });

      const sourceMembers = [{ id: randomUUID(), projectId: "", userId: snapshot.ownerId, sourceMemberId: null, name: proposal.owner?.displayName ?? "Chủ nhiệm đề tài", role: "TOPIC_PI", participationRole: "TOPIC_PI", status: "ACTIVE", effectiveFrom: new Date(), effectiveUntil: null, createdById: currentActor.id }, ...snapshot.members.filter((member) => member.userId !== snapshot.ownerId).map((member) => ({ id: randomUUID(), projectId: "", userId: member.userId || null, sourceMemberId: member.id ?? null, name: member.name || "Thành viên đề tài", role: member.role ?? "TOPIC_MEMBER", participationRole: member.participationRole ?? member.role ?? "TOPIC_MEMBER", status: "ACTIVE", effectiveFrom: new Date(), effectiveUntil: null, createdById: currentActor.id }))];
      const project = await tx.approvedProject.create({ data: {
        proposalId,
        sourceSubmissionEventId: submission.id,
        sourceDecisionId: decision.id,
        hostOrganizationUnitId: proposal.hostOrganizationUnitId,
        title: snapshot.title,
        scopeSnapshot: { title: snapshot.title, objectives: snapshot.objectives, summary: snapshot.summary, researchFieldCode: snapshot.researchFieldCode, proposalTypeCode: snapshot.proposalTypeCode, budgetMetadata: snapshot.budgetMetadata } as Prisma.InputJsonValue,
        planSnapshot: { startDate: snapshot.startDate, endDate: snapshot.endDate },
        status: PREPARING,
        startDate: snapshot.startDate ? new Date(snapshot.startDate) : null,
        endDate: snapshot.endDate ? new Date(snapshot.endDate) : null,
        createdById: currentActor.id
      } });
      if (sourceMembers.length) await tx.approvedProjectMember.createMany({ data: sourceMembers.map((member) => ({ ...member, projectId: project.id })) });
      // Dữ liệu giải ngân / nghiệm thu cũ lưu trên đề xuất được chuyển sang đề tài (hàm SQL dùng chung với migration).
      if (typeof tx.$executeRaw === "function") await tx.$executeRaw`SELECT import_legacy_project_closure(${project.id})`;
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.created", fromStatus: null, toStatus: PREPARING, reason: "Tạo từ phiên bản đề xuất đã được phê duyệt", beforeFacts: Prisma.DbNull, afterFacts: { proposalId, sourceSubmissionEventId: submission.id, sourceDecisionId: decision.id } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "create-approved-project", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, reason: JSON.stringify({ proposalId, sourceSubmissionEventId: submission.id, sourceDecisionId: decision.id }) });
      return { id: project.id, proposalId, status: project.status };
    }, { isolationLevel: "Serializable", timeout: 15000 }).catch(async (error) => {
      const denied = ["P2034", "P2002"].includes(error?.code) ? new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài đã được tạo hoặc ngữ cảnh đã thay đổi. Vui lòng tải lại." }) : error;
      const evidence = denied;
      await this.auditLog.record({ action: "create-approved-project", result: "failure", actorId: actor.id, targetEntity: "research-proposal", targetEntityId: proposalId, username: actor.username, reason: String(evidence?.response?.code ?? evidence?.code ?? "ACTION_NOT_GRANTED") }).catch(() => undefined);
      throw denied;
    });
  }

  // projectMutationPipe chỉ giữ contextVersion nên `reason` qua API luôn trống (lịch sử ghi lý do mặc định).
  async confirmSetup(actor: SafeUserContext, projectId: string, input: ProjectMutationDto & { reason?: string } = {}) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      if (project.status !== PREPARING) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Đề tài không còn ở trạng thái chuẩn bị triển khai." });
      await this.assertOfficer(tx, currentActor, project);
      if (!(project.milestones ?? []).length) throw new BadRequestException({ code: "SETUP_INCOMPLETE", message: "Cần thiết lập ít nhất một mốc trước khi bắt đầu thực hiện." });
      const weights = validateDeclaredWeights(project.milestones.map((item) => item.weightPercent));
      if (!weights.ok) throw new BadRequestException({ code: "WEIGHTS_INVALID", message: weights.message });
      const now = await readTransactionClockV1(tx);
      const updated = await tx.approvedProject.update({ where: { id: project.id }, data: { status: EXECUTING, confirmedAt: now, confirmedById: currentActor.id, aggregateVersion: { increment: 1 }, relationshipVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await this.createBaseline(tx, project.id, currentActor.id, "setup", null, now);
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.setup.confirm", fromStatus: PREPARING, toStatus: EXECUTING, reason: input.reason ?? "Xác nhận thiết lập đề tài", beforeFacts: { status: PREPARING }, afterFacts: { status: EXECUTING } } });
      // Đề tài nhận vòng nghiệm thu từ dữ liệu cũ của đề xuất: đang mở → "chờ nghiệm thu"; đã kết luận → đạt / không đạt.
      const legacyRound = closureFacts(project).latestAcceptance;
      const legacyStatus = !legacyRound ? null : openAcceptanceRound(project) ? PROJECT_STATUSES.pendingAcceptance : legacyRound.status === "PASSED" ? PROJECT_STATUSES.accepted : legacyRound.status === "FAILED" ? PROJECT_STATUSES.failed : null;
      if (legacyStatus) {
        await tx.approvedProject.update({ where: { id: project.id }, data: { status: legacyStatus, aggregateVersion: { increment: 1 } } });
        await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.acceptance.backfill", fromStatus: EXECUTING, toStatus: legacyStatus, reason: "Áp dụng kết quả nghiệm thu chuyển từ dữ liệu cũ của đề xuất", beforeFacts: { status: EXECUTING }, afterFacts: { status: legacyStatus, acceptanceStatus: legacyRound?.status } } });
      }
      await new AuditLogService(joinedTransaction(tx)).record({ action: "confirm-approved-project-setup", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, beforeFacts: { status: PREPARING }, afterFacts: { status: EXECUTING } });
      const loaded = await this.loadAuthorized(tx, currentActor, updated.id);
      return this.toProjectResponse(loaded.project, loaded.capability, loaded.officer, currentActor);
    });
  }

  async configureSetup(actor: SafeUserContext, projectId: string, input: Record<string, unknown>) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      if (project.status !== PREPARING) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      await this.assertOfficer(tx, currentActor, project);
      if (!Array.isArray(input.milestones) || !Array.isArray(input.checkpoints) || input.milestones.length > 100 || input.checkpoints.length > 100) throw new BadRequestException({ message: "Mốc triển khai không hợp lệ." });
      if (project.milestones.length || project.checkpoints.length) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Thiết lập mốc đã được ghi nhận." });
      // Mốc chỉ hoàn thành qua báo cáo được chấp nhận, nên mỗi mốc phải có ít nhất một kỳ báo cáo gắn với nó.
      if (!input.milestones.length) throw new BadRequestException({ code: "SETUP_INCOMPLETE", message: "Cần ít nhất một mốc." });
      const covered = new Set(input.checkpoints.map((item) => item?.milestonePosition));
      if (input.milestones.some((_: unknown, position: number) => !covered.has(position))) throw new BadRequestException({ code: "SETUP_INCOMPLETE", message: "Mỗi mốc cần ít nhất một kỳ báo cáo gắn với mốc đó." });
      const weights = validateDeclaredWeights(input.milestones.map((item) => item?.weightPercent ?? null));
      if (!weights.ok) throw new BadRequestException({ code: "WEIGHTS_INVALID", message: weights.message });
      const milestones = [];
      for (const [position, item] of input.milestones.entries()) {
        const responsibleMember = item?.responsibleMemberId ? project.members.find((member) => member.id === item.responsibleMemberId && isRelationshipActiveAt(member, new Date())) : null;
        if (item?.responsibleMemberId && !responsibleMember) throw new BadRequestException({ message: "Thành viên phụ trách mốc không hợp lệ." });
        const dueDate = projectDay(item?.dueDate);
        if (project.endDate && dueDate > project.endDate) throw new BadRequestException({ code: "EXTENSION_REQUIRED" });
        const plannedStartDate = item?.plannedStartDate ? projectDay(item.plannedStartDate) : null;
        if (plannedStartDate && (plannedStartDate > dueDate || (project.startDate && plannedStartDate < project.startDate))) throw new BadRequestException({ code: "PLANNED_START_INVALID", message: "Ngày bắt đầu dự kiến phải nằm trong thời gian đề tài và không sau hạn mốc." });
        const milestone = await tx.projectMilestone.create({ data: { projectId: project.id, title: requiredText(item?.title, "title"), description: optionalText(item?.description ?? null), dueDate, isImportant: item?.isImportant === true, position, weightPercent: item?.weightPercent ?? null, plannedStartDate, responsibleMemberId: responsibleMember?.id ?? null, createdById: currentActor.id } });
        milestones.push(milestone);
      }
      for (const item of input.checkpoints) {
        const milestoneId = item?.milestonePosition === undefined ? null : milestones[item.milestonePosition]?.id;
        if (item?.milestonePosition !== undefined && !milestoneId) throw new BadRequestException({ message: "Mốc liên kết không hợp lệ." });
        await tx.projectCheckpoint.create({ data: { projectId: project.id, milestoneId, title: requiredText(item?.title, "title"), dueDate: projectDay(item?.dueDate) } });
      }
      const now = await readTransactionClockV1(tx);
      await tx.approvedProject.update({ where: { id: project.id }, data: { aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.setup.configure", reason: "Thiết lập mốc thực hiện", afterFacts: { milestones: input.milestones, checkpoints: input.checkpoints } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "configure-approved-project", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, afterFacts: { milestones: input.milestones, checkpoints: input.checkpoints } });
      return { milestones, checkpoints: await tx.projectCheckpoint.findMany({ where: { projectId: project.id } }) };
    });
  }

  async listOfficerCandidates(actor: SafeUserContext, projectId: string) {
    const loaded = await this.loadAuthorized(this.prisma, actor, projectId);
    this.assertScope(actor, loaded.project);
    this.assertOfficerAssigner(actor, loaded.project);
    const users = await this.prisma.user.findMany({ where: { status: "active", systemRole: "RESEARCH_MANAGEMENT_STAFF" }, include: { organizationScopes: { include: { organizationUnit: true } } }, orderBy: { displayName: "asc" } });
    const eligible = users.filter((user) => user.organizationScopes?.some((scope) => scope.organizationUnitId === loaded.project.hostOrganizationUnitId && scope.organizationUnit?.status === "active") && !(loaded.project.members ?? []).some((member) => member.userId === user.id && isRelationshipActiveAt(member, new Date())));
    const reviewAccess = new ProposalReviewAccessService(this.prisma);
    const checks = await Promise.all(eligible.map((user) => reviewAccess.resolveConflictForProposal(user.id, loaded.project.proposalId)));
    return eligible.filter((_, index) => !checks[index].unresolved && !checks[index].isAssignedReviewer && !checks[index].hasPersistedReview).map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, unit: user.unit }));
  }

  async assignOfficer(actor: SafeUserContext, projectId: string, input: AssignProjectOfficerDto) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertOfficerAssigner(currentActor, project);
      await this.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
      const candidate = await tx.user.findUnique({ where: { id: input.officerUserId }, include: { organizationScopes: { include: { organizationUnit: true } } } });
      if (!candidate || candidate.status !== "active" || candidate.systemRole !== "RESEARCH_MANAGEMENT_STAFF" || !candidate.organizationScopes?.some((scope: any) => scope.organizationUnitId === project.hostOrganizationUnitId && scope.organizationUnit.status === "active")) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chuyên viên được chọn không hoạt động hoặc ngoài phạm vi đề tài." });
      if ((project.members ?? []).some((member) => member.userId === candidate.id && isRelationshipActiveAt(member, new Date()))) throw new ForbiddenException({ code: "CONFLICT_DENIED", message: "Thành viên đề tài không được đồng thời là chuyên viên quản lý." });
      await this.assertNoEvaluationConflict(tx, candidate.id, project.proposalId);
      const now = await readTransactionClockV1(tx);
      const current = await this.currentOfficer(tx, project.id, now);
      if (current) await tx.projectManagementOfficer.update({ where: { id: current.id }, data: { status: "ENDED", effectiveUntil: now } });
      const assignment = await tx.projectManagementOfficer.create({ data: { projectId: project.id, officerUserId: candidate.id, assignedById: currentActor.id, status: "ACTIVE", effectiveFrom: now, reason: input.reason ?? null, assignmentContextVersion: projectContextVersion(project) } });
      await tx.approvedProject.update({ where: { id: project.id }, data: { relationshipVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.officer.assign", reason: input.reason ?? null, beforeFacts: current ? { officerUserId: current.officerUserId } : { officerUserId: null }, afterFacts: { officerUserId: candidate.id } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "assign-project-management-officer", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, reason: input.reason ?? undefined, beforeFacts: current ? { officerUserId: current.officerUserId } : { officerUserId: null }, afterFacts: { officerUserId: candidate.id } });
      return { ...assignment, officer: { id: candidate.id, displayName: candidate.displayName, username: candidate.username } };
    });
  }

  async revokeOfficer(actor: SafeUserContext, projectId: string, input: RevokeProjectOfficerDto) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertOfficerAssigner(currentActor, project);
      await this.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
      const current = await this.currentOfficer(tx, project.id);
      if (!current) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Đề tài chưa có chuyên viên đang phụ trách." });
      const now = await readTransactionClockV1(tx);
      await tx.projectManagementOfficer.update({ where: { id: current.id }, data: { status: "REVOKED", effectiveUntil: now, reason: input.reason } });
      await tx.approvedProject.update({ where: { id: project.id }, data: { relationshipVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.officer.revoke", reason: input.reason, beforeFacts: { officerUserId: current.officerUserId }, afterFacts: { officerUserId: null } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "revoke-project-management-officer", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: project.id, username: currentActor.username, reason: input.reason, beforeFacts: { officerUserId: current.officerUserId }, afterFacts: { officerUserId: null } });
      return { ...current, status: "REVOKED", effectiveUntil: now };
    });
  }

  private assertProjectPi(actor: SafeUserContext, project: LoadedProject, requireExecution = true) {
    this.assertScope(actor, project);
    const member = (project.members ?? []).find((item) => item.userId === actor.id && item.participationRole === "TOPIC_PI" && isRelationshipActiveAt(item, new Date()));
    if (!member) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ PI hiện hành của đề tài được thực hiện thao tác này." });
    if (requireExecution && project.status !== EXECUTING) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Đề tài chưa ở trạng thái thực hiện." });
  }

  private async nextReportRevision(tx: Prisma.TransactionClient, projectId: string) {
    const latest = await tx.projectReportRevision.findFirst({ where: { projectId }, orderBy: { revision: "desc" } });
    return (latest?.revision ?? 0) + 1;
  }

  private async findReport(tx: Prisma.TransactionClient, project: LoadedProject, reportId: string) {
    const report = await tx.projectReportRevision.findUnique({ where: { id: reportId }, include: { evidence: { include: { fileRecord: true } }, checkpoint: true } });
    if (!report || report.projectId !== project.id) throw new NotFoundException({ message: "Không tìm thấy phiên bản báo cáo của đề tài." });
    return report;
  }

  private assertReportPeriod(project: LoadedProject, checkpointId: string | null, start: Date | null | undefined, end: Date | null | undefined, currentId?: string) {
    if (!(start instanceof Date) || !(end instanceof Date) || end < start || (project.startDate && start < project.startDate) || (project.endDate && end > project.endDate)) throw new BadRequestException({ code: "REPORT_PERIOD_INVALID", message: "Kỳ báo cáo phải nằm trong thời gian đề tài." });
    if (project.reports.some((item) => item.id !== currentId && item.checkpointId === checkpointId && ![REPORT_SUPPLEMENT].includes(item.status) && item.reportingPeriodStart && item.reportingPeriodEnd && start <= item.reportingPeriodEnd && end >= item.reportingPeriodStart)) throw new ConflictException({ code: "REPORT_PERIOD_OVERLAP", message: "Kỳ báo cáo trùng với phiên bản đang xử lý." });
  }

  private async assertUsableEvidence(tx: Prisma.TransactionClient, projectId: string, fileIds: string[] | undefined, expectedEntityId?: string) {
    if (!fileIds?.length) return [];
    const files = await tx.fileRecord.findMany({ where: { id: { in: fileIds }, status: "active", deletedAt: null } });
    if (files.length !== fileIds.length) throw new BadRequestException({ code: "EVIDENCE_UNUSABLE", message: "Tệp minh chứng không tồn tại, đã xóa hoặc chưa hoàn tất." });
    if (files.some((file) => file.relatedEntityType !== "approved_project" || file.relatedEntityId !== projectId)) throw new BadRequestException({ code: "EVIDENCE_WRONG_RECORD", message: "Tệp minh chứng không thuộc đúng đề tài." });
    return files;
  }

  async createReportDraft(actor: SafeUserContext, projectId: string, input: ProjectReportDto) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertProjectPi(currentActor, project);
      if (input.deadline) throw new BadRequestException({ code: "CONTROLLED_FIELD_DENIED" });
      let checkpoint: { id: string; projectId: string; status: string; dueDate: Date } | null = null;
      if (input.checkpointId) {
        checkpoint = await tx.projectCheckpoint.findUnique({ where: { id: input.checkpointId } });
        if (!checkpoint || checkpoint.projectId !== project.id || checkpoint.status !== "open") throw new BadRequestException({ message: "Mốc báo cáo không còn mở trong đề tài." });
      }
      this.assertReportPeriod(project, checkpoint?.id ?? null, input.reportingPeriodStart, input.reportingPeriodEnd);
      const now = await readTransactionClockV1(tx);
      const report = await tx.projectReportRevision.create({ data: {
        projectId: project.id, checkpointId: input.checkpointId ?? null, revision: await this.nextReportRevision(tx, project.id), status: REPORT_DRAFT,
        reportingPeriodStart: input.reportingPeriodStart, reportingPeriodEnd: input.reportingPeriodEnd, deadline: checkpoint?.dueDate ?? project.endDate,
        progressResults: input.progressResults ?? "", issuesRecommendations: input.issuesRecommendations ?? null, milestoneContext: jsonValue(input.milestoneContext ?? null),
        authorId: currentActor.id, createdAt: now
      } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.draft", toStatus: REPORT_DRAFT, reason: "Tạo bản nháp báo cáo", afterFacts: { reportId: report.id, revision: report.revision } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "draft-project-report", result: "success", actorId: currentActor.id, targetEntity: "project-report-revision", targetEntityId: report.id, username: currentActor.username });
      return report;
    });
  }

  async updateReportDraft(actor: SafeUserContext, projectId: string, input: ProjectReportDto & { reportId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertProjectPi(currentActor, project);
      const report = await this.findReport(tx, project, input.reportId);
      if (input.deadline) throw new BadRequestException({ code: "CONTROLLED_FIELD_DENIED" });
      if (report.authorId !== currentActor.id) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ tác giả PI được sửa báo cáo." });
      if (![REPORT_DRAFT, REPORT_SUPPLEMENT].includes(report.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Bản báo cáo đã nộp được giữ nguyên; hãy tạo phiên bản mới sau khi yêu cầu bổ sung." });
      const checkpointId = input.checkpointId ?? report.checkpointId;
      if (checkpointId) {
        const checkpoint = await tx.projectCheckpoint.findUnique({ where: { id: checkpointId } });
        if (!checkpoint || checkpoint.projectId !== project.id || checkpoint.status !== "open") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      }
      this.assertReportPeriod(project, checkpointId, input.reportingPeriodStart ?? report.reportingPeriodStart, input.reportingPeriodEnd ?? report.reportingPeriodEnd, report.id);
      const now = await readTransactionClockV1(tx);
      const next = report.status === REPORT_SUPPLEMENT
        ? await tx.projectReportRevision.create({ data: { projectId: project.id, checkpointId, revision: await this.nextReportRevision(tx, project.id), status: REPORT_DRAFT, reportingPeriodStart: input.reportingPeriodStart ?? report.reportingPeriodStart, reportingPeriodEnd: input.reportingPeriodEnd ?? report.reportingPeriodEnd, deadline: report.deadline, progressResults: input.progressResults ?? report.progressResults, issuesRecommendations: input.issuesRecommendations ?? report.issuesRecommendations, milestoneContext: jsonValue(input.milestoneContext ?? report.milestoneContext), authorId: currentActor.id, createdAt: now } })
        : await tx.projectReportRevision.update({ where: { id: report.id }, data: { checkpointId, reportingPeriodStart: input.reportingPeriodStart ?? report.reportingPeriodStart, reportingPeriodEnd: input.reportingPeriodEnd ?? report.reportingPeriodEnd, progressResults: input.progressResults ?? report.progressResults, issuesRecommendations: input.issuesRecommendations ?? report.issuesRecommendations, milestoneContext: jsonValue(input.milestoneContext ?? report.milestoneContext) } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.edit-draft", reason: report.status === REPORT_SUPPLEMENT ? "Tạo phiên bản báo cáo sửa theo yêu cầu bổ sung" : "Cập nhật bản nháp báo cáo", afterFacts: { reportId: next.id, revision: next.revision } } });
      return next;
    });
  }

  async submitReport(actor: SafeUserContext, projectId: string, input: ProjectReportSubmissionDto & { reportId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      this.assertProjectPi(currentActor, project);
      const report = await this.findReport(tx, project, input.reportId);
      if (report.authorId !== currentActor.id || report.status !== REPORT_DRAFT) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ bản nháp của PI mới được nộp." });
      if (report.checkpointId && report.checkpoint?.status !== "open") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Mốc báo cáo đã đóng." });
      this.assertReportPeriod(project, report.checkpointId, report.reportingPeriodStart, report.reportingPeriodEnd, report.id);
      const fileIds = Array.isArray(input.evidenceFileIds) ? input.evidenceFileIds : [];
      const files = await this.assertUsableEvidence(tx, project.id, fileIds, report.id);
      const now = await readTransactionClockV1(tx);
      const updated = await tx.projectReportRevision.update({ where: { id: report.id }, data: { status: REPORT_SUBMITTED, submittedAt: now, submittedContextVersion: projectContextVersion(project) } });
      if (files.length) await tx.projectReportEvidence.createMany({ data: files.map((file) => ({ reportRevisionId: report.id, fileRecordId: file.id })) });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.submit", toStatus: REPORT_SUBMITTED, reason: "PI nộp báo cáo", afterFacts: { reportId: report.id, revision: report.revision, evidenceFileIds: files.map((file) => file.id) } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "submit-project-report", result: "success", actorId: currentActor.id, targetEntity: "project-report-revision", targetEntityId: report.id, username: currentActor.username, afterFacts: { status: REPORT_SUBMITTED, revision: report.revision, evidenceFileIds: files.map((file) => file.id) } });
      const officer = await this.currentOfficer(tx, project.id);
      notify({ type: NOTIFICATION_TYPES.projectReportSubmitted, userIds: officer ? [officer.officerUserId] : [], excludeUserIds: [currentActor.id], title: `Báo cáo tiến độ mới: ${project.title}`, message: `Chủ nhiệm đề tài ${label(project)} vừa nộp báo cáo tiến độ (phiên bản ${report.revision}).`, link: projectLink(project.id), metadata: { projectId: project.id, reportId: report.id } });
      return updated;
    });
  }

  async reviewReport(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { reportId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.assertOfficer(tx, currentActor, project);
      const report = await this.findReport(tx, project, input.reportId);
      if (report.status !== REPORT_SUBMITTED) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Báo cáo chưa ở trạng thái chờ xem xét." });
      const now = await readTransactionClockV1(tx);
      const updated = await tx.projectReportRevision.update({ where: { id: report.id }, data: { status: REPORT_UNDER_REVIEW, reviewedById: currentActor.id } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.review", fromStatus: REPORT_SUBMITTED, toStatus: REPORT_UNDER_REVIEW, reason: input.reason ?? "Bắt đầu xem xét báo cáo", afterFacts: { reportId: report.id } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "review-project-report", result: "success", actorId: currentActor.id, targetEntity: "project-report-revision", targetEntityId: report.id, username: currentActor.username, afterFacts: { status: REPORT_UNDER_REVIEW } });
      return updated;
    });
  }

  async requestReportSupplement(actor: SafeUserContext, projectId: string, input: ProjectReportReviewDto & { reportId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.assertOfficer(tx, currentActor, project);
      const report = await this.findReport(tx, project, input.reportId);
      if (![REPORT_SUBMITTED, REPORT_UNDER_REVIEW].includes(report.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Báo cáo không còn ở bước yêu cầu bổ sung." });
      if (!input.reason || !input.responseDeadline) throw new BadRequestException({ message: "Cần lý do và hạn bổ sung." });
      const now = await readTransactionClockV1(tx);
      if (new Date(input.responseDeadline).getTime() <= now.getTime()) throw new BadRequestException({ code: "DEADLINE_INVALID", message: "Hạn bổ sung phải ở tương lai." });
      const updated = await tx.projectReportRevision.update({ where: { id: report.id }, data: { status: REPORT_SUPPLEMENT, reviewedById: currentActor.id, reviewReason: input.reason, responseDeadline: input.responseDeadline ?? null } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.request-supplement", fromStatus: report.status, toStatus: REPORT_SUPPLEMENT, reason: input.reason, afterFacts: { reportId: report.id, responseDeadline: input.responseDeadline ?? null } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "request-project-report-supplement", result: "success", actorId: currentActor.id, targetEntity: "project-report-revision", targetEntityId: report.id, username: currentActor.username, reason: input.reason, afterFacts: { status: REPORT_SUPPLEMENT, responseDeadline: input.responseDeadline ?? null } });
      notify({ type: NOTIFICATION_TYPES.projectReportSupplement, userIds: [report.authorId], excludeUserIds: [currentActor.id], title: `Yêu cầu bổ sung báo cáo: ${project.title}`, message: `Báo cáo phiên bản ${report.revision} của đề tài ${label(project)} cần bổ sung trước ${vnDate(input.responseDeadline)}. Nội dung: ${input.reason}`, link: projectLink(project.id), metadata: { projectId: project.id, reportId: report.id } });
      return updated;
    });
  }

  async acceptReport(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { reportId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.assertOfficer(tx, currentActor, project);
      const report = await this.findReport(tx, project, input.reportId);
      if (report.status !== REPORT_UNDER_REVIEW) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Báo cáo phải được xem xét trước khi chấp nhận." });
      const updated = await tx.projectReportRevision.update({ where: { id: report.id }, data: { status: REPORT_ACCEPTED, reviewedById: currentActor.id, reviewReason: input.reason ?? null } });
      if (report.checkpointId) {
        await tx.projectCheckpoint.update({ where: { id: report.checkpointId }, data: { status: "completed" } });
        const checkpoint = await tx.projectCheckpoint.findUnique({ where: { id: report.checkpointId } });
        if (checkpoint?.milestoneId) {
          const remaining = await tx.projectCheckpoint.count({ where: { projectId: project.id, milestoneId: checkpoint.milestoneId, status: { not: "completed" } } });
          if (remaining === 0) {
            // Thời điểm hoàn thành = lúc chủ nhiệm nộp báo cáo, không phụ thuộc chuyên viên xét nhanh hay chậm.
            const completedAt = report.submittedAt ?? await readTransactionClockV1(tx);
            await tx.projectMilestone.update({ where: { id: checkpoint.milestoneId }, data: { status: "completed", progressPercent: 100, completedAt, progressUpdatedAt: completedAt } });
          }
        }
        await tx.approvedProject.update({ where: { id: project.id }, data: { aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: await readTransactionClockV1(tx) } });
      }
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: "project.report.accept", fromStatus: REPORT_UNDER_REVIEW, toStatus: REPORT_ACCEPTED, reason: input.reason ?? "Chấp nhận báo cáo hành chính", afterFacts: { reportId: report.id } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: "accept-project-report", result: "success", actorId: currentActor.id, targetEntity: "project-report-revision", targetEntityId: report.id, username: currentActor.username, reason: input.reason ?? undefined, afterFacts: { status: REPORT_ACCEPTED } });
      return updated;
    });
  }

  /** Trọng số sau điều chỉnh phải hợp lệ (để trống tất cả, hoặc đủ mọi mốc với tổng 100) — kiểm tra sớm cho PI. */
  private assertAdjustmentWeights(project: LoadedProject, values: AdjustmentValues) {
    const changes = (values.milestoneChanges ?? []).filter((change) => change?.weightPercent !== undefined);
    if (!changes.length) return;
    const next = (project.milestones ?? []).map((item) => { const change = changes.find((entry) => entry.id === item.id); return change ? change.weightPercent : item.weightPercent; });
    const result = validateDeclaredWeights(next);
    if (!result.ok) throw new BadRequestException({ code: "WEIGHTS_INVALID", message: result.message });
  }

  private async createRequest(actor: SafeUserContext, projectId: string, requestType: typeof ADJUSTMENT | typeof EXTENSION, input: ProjectRequestDto) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertProjectPi(currentActor, project);
      if (project.requests.some((request) => !["approved", "rejected"].includes(request.status))) throw new ConflictException({ code: "REQUEST_ALREADY_OPEN", message: "Đề tài đã có yêu cầu thay đổi chưa kết thúc." });
      const currentValues = requestType === EXTENSION ? { endDate: project.endDate } : { scope: project.scopeSnapshot, plan: project.planSnapshot, milestones: project.milestones, members: (project.members ?? []).map((member) => ({ id: member.id, userId: member.userId, name: member.name, role: member.role, participationRole: member.participationRole, status: member.status })) };
      const proposedValues = input.proposedValues;
      if (!proposedValues || typeof proposedValues !== "object" || Array.isArray(proposedValues)) throw new BadRequestException({ message: "proposedValues không hợp lệ." });
      this.assertProposedValues(project, requestType, proposedValues);
      const now = await readTransactionClockV1(tx);
      const request = await tx.projectRequest.create({ data: { projectId: project.id, requestType, status: "draft", revision: 1, requesterId: currentActor.id, currentValues, proposedValues, reason: input.reason, submittedContextVersion: projectContextVersion(project), appraisal: Prisma.DbNull } });
      const revision = await tx.projectRequestRevision.create({ data: { requestId: request.id, revision: 1, status: "draft", currentValues, proposedValues, reason: input.reason, createdById: currentActor.id, createdAt: now } });
      await tx.projectRequestHistory.create({ data: { requestId: request.id, actorId: currentActor.id, action: `project.${requestType}.create`, toStatus: "draft", reason: input.reason, afterFacts: { revision: 1, proposedValues } } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: `project.${requestType}.create`, reason: input.reason, requestId: request.id, afterFacts: { requestId: request.id, revision: 1 } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: `create-project-${requestType}`, result: "success", actorId: currentActor.id, targetEntity: "project-request", targetEntityId: request.id, username: currentActor.username, reason: input.reason });
      return { ...request, revisions: [revision] };
    });
  }

  async createAdjustment(actor: SafeUserContext, projectId: string, input: ProjectRequestDto) { return this.createRequest(actor, projectId, ADJUSTMENT, input); }
  async createExtension(actor: SafeUserContext, projectId: string, input: ProjectRequestDto) { return this.createRequest(actor, projectId, EXTENSION, input); }

  private async findRequest(tx: Prisma.TransactionClient, project: LoadedProject, requestId: string): Promise<ProjectRequestWithRevisions> {
    const request = await tx.projectRequest.findUnique({ where: { id: requestId }, include: { revisions: { orderBy: { revision: "desc" } }, evidence: true } });
    if (!request || request.projectId !== project.id) throw new NotFoundException({ message: "Không tìm thấy yêu cầu của đề tài." });
    return request;
  }

  async editRequestDraft(actor: SafeUserContext, projectId: string, requestType: typeof ADJUSTMENT | typeof EXTENSION, input: ProjectRequestDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertProjectPi(currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== requestType || request.requesterId !== currentActor.id || !["draft", "supplement_requested"].includes(request.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Yêu cầu không còn là bản nháp của PI." });
      const proposedValues = input.proposedValues;
      this.assertProposedValues(project, requestType, proposedValues);
      const currentValues = request.currentValues;
      const nextRevision = request.revision + 1;
      const now = await readTransactionClockV1(tx);
      const revision = await tx.projectRequestRevision.create({ data: { requestId: request.id, revision: nextRevision, status: "draft", currentValues: currentValues as Prisma.InputJsonValue, proposedValues: proposedValues as Prisma.InputJsonValue, reason: input.reason, createdById: currentActor.id, createdAt: now } });
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "draft", revision: nextRevision, currentValues: currentValues as Prisma.InputJsonValue, proposedValues: proposedValues as Prisma.InputJsonValue, reason: input.reason, submittedContextVersion: projectContextVersion(project), appraisal: Prisma.DbNull, preparedById: null, preparedAt: null, responseDeadline: null } });
      await tx.projectRequestHistory.create({ data: { requestId: request.id, actorId: currentActor.id, action: `project.${requestType}.edit-draft`, fromStatus: request.status, toStatus: "draft", reason: input.reason, afterFacts: { revision: nextRevision } } });
      return { ...updated, revisions: [revision] };
    });
  }

  async submitRequest(actor: SafeUserContext, projectId: string, requestType: typeof ADJUSTMENT | typeof EXTENSION, input: ProjectReportSubmissionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      this.assertProjectPi(currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== requestType || request.requesterId !== currentActor.id || request.status !== "draft") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ bản nháp của PI mới được nộp." });
      const draftContext = storedContextVersion(request.submittedContextVersion);
      if (!draftContext || draftContext.aggregateVersion !== project.aggregateVersion || draftContext.relationshipVersion !== project.relationshipVersion) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài đã thay đổi từ khi tạo bản nháp. Vui lòng tạo yêu cầu mới." });
      this.assertProposedValues(project, requestType, request.proposedValues);
      const now = await readTransactionClockV1(tx);
      const nextStatus = "submitted";
      const revision = await tx.projectRequestRevision.update({ where: { requestId_revision: { requestId: request.id, revision: request.revision } }, data: { status: "submitted", submittedAt: now, contextVersion: projectContextVersion(project) } });
      const files = await this.assertUsableEvidence(tx, project.id, input.evidenceFileIds, request.id);
      if (files.length) await tx.projectRequestEvidence.createMany({ data: files.map((file) => ({ requestId: request.id, requestRevisionId: revision.id, fileRecordId: file.id })) });
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: nextStatus, submittedContextVersion: projectContextVersion(project) } });
      await tx.projectRequestHistory.create({ data: { requestId: request.id, actorId: currentActor.id, action: `project.${requestType}.submit`, fromStatus: "draft", toStatus: nextStatus, reason: request.reason, afterFacts: { revision: request.revision, contextVersion: projectContextVersion(project) } } });
      await tx.projectHistory.create({ data: { projectId: project.id, actorId: currentActor.id, action: `project.${requestType}.submit`, fromStatus: "draft", toStatus: nextStatus, requestId: request.id, afterFacts: { revision: request.revision } } });
      await new AuditLogService(joinedTransaction(tx)).record({ action: `submit-project-${requestType}`, result: "success", actorId: currentActor.id, targetEntity: "project-request", targetEntityId: request.id, username: currentActor.username, afterFacts: { status: nextStatus, revision: request.revision } });
      return { ...updated, revisionRecord: revision };
    });
  }

  async reviewAdjustment(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.assertOfficer(tx, currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== ADJUSTMENT || request.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "under_staff_review" } });
      await this.recordRequestAction(tx, currentActor, project, request, "review", "under_staff_review", { reason: input.reason ?? null });
      return updated;
    });
  }

  async validateExtension(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.assertOfficer(tx, currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== EXTENSION || request.status !== "submitted") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      assertExtensionValues(project, request.proposedValues);
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "under_staff_validation" } });
      await this.recordRequestAction(tx, currentActor, project, request, "validate", "under_staff_validation", { reason: input.reason ?? null });
      return updated;
    });
  }

  async requestSupplement(actor: SafeUserContext, projectId: string, requestType: typeof ADJUSTMENT | typeof EXTENSION, input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== requestType) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      // Trước khi trình: chuyên viên phụ trách yêu cầu bổ sung; sau khi trình: Ban giám đốc yêu cầu bổ sung.
      if (request.status !== "ready_for_head_decision") await this.assertOfficer(tx, currentActor, project);
      else {
        this.assertExtensionDecider(currentActor, project);
        await this.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
        // Ban giám đốc yêu cầu bổ sung khi tờ trình đã tới mình: kết thúc tờ trình, chuyên viên trình lại sau khi bổ sung.
        const key = { kind: requestType === ADJUSTMENT ? APPROVAL_KINDS.projectAdjustment : APPROVAL_KINDS.projectExtension, subjectType: "project" as const, subjectId: project.id, subjectRef: request.id };
        await assertReadyForLeadership(tx, currentActor, key);
        await closeApprovalSubmission(tx, currentActor, key, "RETURNED", typeof input.reason === "string" ? input.reason : undefined);
      }
      const allowed = requestType === ADJUSTMENT ? ["submitted", "under_staff_review", "ready_for_head_decision"] : ["submitted", "under_staff_validation", "ready_for_head_decision"];
      if (!allowed.includes(request.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      if (!input.reason || !input.responseDeadline) throw new BadRequestException({ message: "Cần lý do và hạn bổ sung." });
      if (new Date(input.responseDeadline).getTime() <= (await readTransactionClockV1(tx)).getTime()) throw new BadRequestException({ code: "DEADLINE_INVALID", message: "Hạn bổ sung phải ở tương lai." });
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "supplement_requested", decisionNote: input.reason, responseDeadline: input.responseDeadline } });
      await this.recordRequestAction(tx, currentActor, project, request, "request-supplement", "supplement_requested", { reason: input.reason, responseDeadline: input.responseDeadline });
      notify({ type: NOTIFICATION_TYPES.projectRequestSupplement, userIds: [request.requesterId], excludeUserIds: [currentActor.id], title: `Yêu cầu bổ sung ${requestType === EXTENSION ? "hồ sơ gia hạn" : "hồ sơ điều chỉnh"}: ${project.title}`, message: `${requestType === EXTENSION ? "Yêu cầu gia hạn" : "Yêu cầu điều chỉnh"} của đề tài ${label(project)} cần bổ sung trước ${vnDate(input.responseDeadline)}. Nội dung: ${input.reason}`, link: projectLink(project.id), metadata: { projectId: project.id, requestId: request.id } });
      return updated;
    });
  }

  /** Chuyên viên phụ trách thẩm định xong đề nghị điều chỉnh và trình (qua Trưởng ban, Trưởng phòng) lên Ban giám đốc. */
  async prepareAdjustment(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.assertOfficer(tx, currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== ADJUSTMENT || request.status !== "under_staff_review") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      const submitted = request.revisions.find((revision) => revision.revision === request.revision);
      this.adjustmentUpdate(project, parseAdjustmentValues(submitted?.proposedValues ?? request.proposedValues));
      const now = await readTransactionClockV1(tx);
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "ready_for_head_decision", preparedById: currentActor.id, preparedAt: now, appraisal: { reviewNote: input.note ?? "Đã thẩm định đề nghị điều chỉnh" } } });
      await this.recordRequestAction(tx, currentActor, project, request, "prepare", "ready_for_head_decision", { note: input.note ?? null });
      const submission = await openApprovalSubmission(tx, currentActor, { kind: APPROVAL_KINDS.projectAdjustment, subjectType: "project", subjectId: project.id, subjectRef: request.id }, { title: project.title, hostOrganizationUnitId: project.hostOrganizationUnitId, note: input.note ?? undefined });
      notify((await boardReviewEvent(tx, submission)) as WorkflowEvent);
      return updated;
    });
  }

  async prepareExtension(actor: SafeUserContext, projectId: string, input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.assertOfficer(tx, currentActor, project);
      const request = await this.findRequest(tx, project, input.requestId);
      if (request.requestType !== EXTENSION || request.status !== "under_staff_validation") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      assertExtensionValues(project, request.proposedValues);
      const now = await readTransactionClockV1(tx);
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status: "ready_for_head_decision", preparedById: currentActor.id, preparedAt: now, appraisal: { validationNote: input.note ?? "Đã kiểm tra hành chính" } } });
      await this.recordRequestAction(tx, currentActor, project, request, "prepare", "ready_for_head_decision", { note: input.note ?? null });
      // Trình qua Trưởng ban QLKH và Trưởng phòng KHQS trước khi Ban giám đốc quyết định.
      const submission = await openApprovalSubmission(tx, currentActor, { kind: APPROVAL_KINDS.projectExtension, subjectType: "project", subjectId: project.id, subjectRef: request.id }, { title: project.title, hostOrganizationUnitId: project.hostOrganizationUnitId, note: input.note ?? undefined });
      notify((await boardReviewEvent(tx, submission)) as WorkflowEvent);
      return updated;
    });
  }

  async decideRequest(actor: SafeUserContext, projectId: string, requestType: typeof ADJUSTMENT | typeof EXTENSION, decision: "approve" | "reject", input: ProjectDecisionDto & { requestId: string }) {
    return this.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const request = await this.findRequest(tx, project, input.requestId);
      // Điều chỉnh và gia hạn đều do Ban giám đốc (Giám đốc hoặc Phó GĐ phụ trách Khoa học) quyết định, sau khi chuyên
      // viên trình qua Trưởng ban QLKH và Trưởng phòng KHQS.
      if (request.requestType !== requestType || request.status !== "ready_for_head_decision") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      this.assertExtensionDecider(currentActor, project);
      await this.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
      if (!request.preparedById || !request.preparedAt) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED" });
      const routingKey = { kind: requestType === ADJUSTMENT ? APPROVAL_KINDS.projectAdjustment : APPROVAL_KINDS.projectExtension, subjectType: "project" as const, subjectId: project.id, subjectRef: request.id };
      await assertReadyForLeadership(tx, currentActor, routingKey);
      if (request.requesterId === currentActor.id || this.activeMember(project, currentActor.id)) throw new ForbiddenException({ code: "CONFLICT_DENIED" });
      if (decision === "reject" && !input.reason) throw new BadRequestException({ message: "Cần lý do từ chối." });
      const submitted = request.revisions.find((revision) => revision.revision === request.revision);
      if (!submitted || submitted.status !== "submitted") throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH" });
      const expected = storedContextVersion(request.submittedContextVersion);
      if (!expected || expected.aggregateVersion !== project.aggregateVersion || expected.relationshipVersion !== project.relationshipVersion) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH" });
      const nextValues = submitted.proposedValues;
      const adjustment = requestType === ADJUSTMENT ? parseAdjustmentValues(nextValues) : null;
      const next = adjustment ? this.adjustmentUpdate(project, adjustment) : { endDate: assertExtensionValues(project, nextValues) };
      const now = await readTransactionClockV1(tx);
      if (decision === "approve") {
        if (adjustment) await this.applyAdjustmentChanges(tx, currentActor, project, adjustment, now);
        await tx.approvedProject.update({ where: { id: project.id }, data: { ...next, aggregateVersion: { increment: 1 }, ...(adjustment?.membershipChanges ? { relationshipVersion: { increment: 1 } } : {}), authorizationContextUpdatedAt: now } });
        // Kế hoạch đã duyệt thay đổi (gia hạn, hoặc điều chỉnh hạn/trọng số mốc): tạo phiên bản kế hoạch gốc mới.
        const replans = requestType === EXTENSION || (adjustment?.milestoneChanges ?? []).some((change) => change.dueDate !== undefined || change.weightPercent !== undefined);
        if (replans) await this.createBaseline(tx, project.id, currentActor.id, requestType, request.id, now);
      }
      const status = decision === "approve" ? "approved" : "rejected";
      const updated = await tx.projectRequest.update({ where: { id: request.id }, data: { status, decisionById: currentActor.id, decidedAt: now, decisionNote: input.reason ?? input.note ?? null } });
      await closeApprovalSubmission(tx, currentActor, routingKey, decision === "approve" ? "APPROVED" : "REJECTED", input.reason ?? input.note ?? undefined);
      await this.recordRequestAction(tx, currentActor, project, request, decision, status, { before: request.currentValues, after: decision === "approve" ? nextValues : null, reason: input.reason ?? input.note ?? null });
      const kind = requestType === EXTENSION ? "gia hạn" : "điều chỉnh";
      notify({ type: NOTIFICATION_TYPES.projectRequestDecision, userIds: [request.requesterId], excludeUserIds: [currentActor.id], title: `${decision === "approve" ? "Đã phê duyệt" : "Không phê duyệt"} yêu cầu ${kind}: ${project.title}`, message: `Yêu cầu ${kind} của đề tài ${label(project)} ${decision === "approve" ? "đã được phê duyệt" : "không được phê duyệt"}.${input.reason ? ` Ghi chú: ${input.reason}` : ""}`, link: projectLink(project.id), metadata: { projectId: project.id, requestId: request.id, decision } });
      return updated;
    });
  }

  /** Kiểm tra nội dung đề nghị theo loại (điều chỉnh: thêm kiểm tra trọng số theo mốc hiện có). */
  private assertProposedValues(project: LoadedProject, requestType: typeof ADJUSTMENT | typeof EXTENSION, values: unknown) {
    if (requestType === ADJUSTMENT) { assertAdjustmentValues(values); this.assertAdjustmentWeights(project, values); }
    else assertExtensionValues(project, values);
  }

  /** Thay đổi phạm vi / kế hoạch ghép vào ảnh chụp đã duyệt (scopeSnapshot, planSnapshot). */
  private adjustmentUpdate(project: LoadedProject, values: AdjustmentValues) {
    const update: { scopeSnapshot?: Prisma.InputJsonObject; title?: string; planSnapshot?: Prisma.InputJsonObject } = {};
    if (values.scope) {
      update.scopeSnapshot = { ...jsonObject(project.scopeSnapshot), ...values.scope } as Prisma.InputJsonObject;
      if (values.scope.title !== undefined) update.title = requiredText(values.scope.title, "title");
    }
    if (values.plan) update.planSnapshot = { ...jsonObject(project.planSnapshot), ...values.plan };
    return update;
  }

  private async applyAdjustmentChanges(tx: Prisma.TransactionClient, actor: SafeUserContext, project: LoadedProject, values: AdjustmentValues, now: Date) {
    for (const change of values.milestoneChanges ?? []) {
      if (!change || typeof change !== "object" || Array.isArray(change) || !change.id || Object.keys(change).some((key) => !MILESTONE_CHANGE_KEYS.includes(key))) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
      const weightOnly = Object.keys(change).every((key) => key === "id" || key === "weightPercent");
      const milestone = project.milestones.find((item) => item.id === change.id && (item.isImportant || weightOnly));
      if (!milestone) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED", message: "Mốc quan trọng không thuộc đề tài." });
      const data: { title?: string; description?: string | null; responsibleMemberId?: string; dueDate?: Date; plannedStartDate?: null; weightPercent?: number | null } = {};
      if (change.title !== undefined) data.title = requiredText(change.title, "title");
      if (change.description !== undefined) data.description = optionalText(change.description);
      if (change.responsibleMemberId !== undefined) {
        const member = project.members.find((item) => item.id === change.responsibleMemberId && isRelationshipActiveAt(item, now));
        if (!member) throw new BadRequestException({ code: "MEMBER_INELIGIBLE" });
        data.responsibleMemberId = member.id;
      }
      if (change.dueDate !== undefined) {
        data.dueDate = projectDay(change.dueDate);
        if (project.endDate && data.dueDate > project.endDate) throw new BadRequestException({ code: "EXTENSION_REQUIRED", message: "Mốc vượt ngày kết thúc đề tài; cần gia hạn trước." });
        // Hạn mới sớm hơn ngày bắt đầu dự kiến: bỏ ngày bắt đầu dự kiến (cửa sổ kế hoạch lấy theo mốc liền trước).
        if (milestone.plannedStartDate && milestone.plannedStartDate > data.dueDate) data.plannedStartDate = null;
      }
      if (change.weightPercent !== undefined) data.weightPercent = change.weightPercent;
      if (!Object.keys(data).length) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
      await tx.projectMilestone.update({ where: { id: milestone.id }, data });
    }
    if ((values.milestoneChanges ?? []).some((change) => change.weightPercent !== undefined)) {
      const after = await tx.projectMilestone.findMany({ where: { projectId: project.id } });
      const weights = validateDeclaredWeights(after.map((item) => item.weightPercent));
      if (!weights.ok) throw new BadRequestException({ code: "WEIGHTS_INVALID", message: weights.message });
    }
    for (const change of values.membershipChanges ?? []) {
      if (!change || typeof change !== "object" || Array.isArray(change)) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
      if (change.action === "end" && Object.keys(change).every((key) => ["action", "memberId"].includes(key))) {
        const member = project.members.find((item) => item.id === change.memberId && item.participationRole !== "TOPIC_PI" && isRelationshipActiveAt(item, now));
        if (!member) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
        if (project.milestones.some((item) => item.responsibleMemberId === member.id && item.status !== "completed")) throw new BadRequestException({ code: "MEMBER_RESPONSIBILITY_ACTIVE", message: "Cần chuyển trách nhiệm mốc trước khi kết thúc thành viên." });
        await tx.approvedProjectMember.update({ where: { id: member.id }, data: { status: "ENDED", effectiveUntil: now } });
      } else if (change.action === "add" && Object.keys(change).every((key) => ["action", "userId", "name", "participationRole"].includes(key))) {
        if (!["TOPIC_MEMBER", "TOPIC_SECRETARY"].includes(change.participationRole)) throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
        const user = await tx.user.findUnique({ where: { id: change.userId }, include: { organizationScopes: true } });
        if (!user || user.status !== "active" || !user.organizationScopes.some((scope) => scope.organizationUnitId === project.hostOrganizationUnitId)) throw new BadRequestException({ code: "MEMBER_INELIGIBLE" });
        if (project.members.some((item) => item.userId === user.id && isRelationshipActiveAt(item, now)) || (await this.currentOfficer(tx, project.id, now))?.officerUserId === user.id) throw new ForbiddenException({ code: "CONFLICT_DENIED" });
        await this.assertNoEvaluationConflict(tx, user.id, project.proposalId);
        await tx.approvedProjectMember.create({ data: { projectId: project.id, userId: user.id, name: requiredText(change.name, "name"), role: change.participationRole, participationRole: change.participationRole, status: "ACTIVE", effectiveFrom: now, createdById: actor.id } });
      } else throw new BadRequestException({ code: "ADJUSTMENT_SCOPE_DENIED" });
    }
  }

  /** Giao / thu hồi chuyên viên phụ trách: Trưởng phòng hoặc Trưởng ban QLKH trong phạm vi, không tham gia đề tài. */
  private assertOfficerAssigner(actor: SafeUserContext, project: LoadedProject) {
    this.assertScope(actor, project);
    if (!canAssignProjectOfficer(actor) || this.activeMember(project, actor.id)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED" });
  }

  /** Quyết định gia hạn (và yêu cầu bổ sung ở bước chờ quyết định): lãnh đạo, không tham gia đề tài. */
  private assertExtensionDecider(actor: SafeUserContext, project: LoadedProject) {
    this.assertScope(actor, project);
    if (!canDecideProjectExtension(actor) || this.activeMember(project, actor.id)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED" });
  }

  activeMember(project: LoadedProject, actorId: string) {
    return (project.members ?? []).some((member) => member.userId === actorId && isRelationshipActiveAt(member, new Date()));
  }

  private async recordRequestAction(tx: Prisma.TransactionClient, actor: SafeUserContext, project: LoadedProject, request: { id: string; requestType: string; status: string }, action: string, toStatus: string, facts: RequestActionFacts) {
    const name = `project.${request.requestType}.${action}`;
    await tx.projectRequestHistory.create({ data: { requestId: request.id, actorId: actor.id, action: name, fromStatus: request.status, toStatus, reason: facts.reason ?? facts.note ?? null, beforeFacts: { status: request.status }, afterFacts: jsonValue(facts) } });
    await tx.projectHistory.create({ data: { projectId: project.id, actorId: actor.id, action: name, requestId: request.id, fromStatus: request.status, toStatus, reason: facts.reason ?? facts.note ?? null, beforeFacts: jsonValue(facts.before), afterFacts: jsonValue(facts.after ?? facts) } });
    await new AuditLogService(joinedTransaction(tx)).record({ action: name, result: "success", actorId: actor.id, targetEntity: "project-request", targetEntityId: request.id, username: actor.username, reason: facts.reason ?? facts.note ?? undefined, beforeFacts: (facts.before ?? { status: request.status }) as Record<string, unknown>, afterFacts: (facts.after ?? { status: toStatus }) as Record<string, unknown> });
  }
}

function assertProjectContext(expected: unknown, project: LoadedProject) {
  const current = projectContextVersion(project);
  if (!expected || typeof expected !== "object" || Object.entries(current).some(([key, value]) => (expected as Record<string, unknown>)[key] !== value)) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH" });
}

/** Cột JSON dạng object (ảnh chụp phạm vi / kế hoạch); giá trị khác coi như rỗng. */
function jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Mã lỗi của lỗi Prisma (P2034, P2002...) hoặc lỗi có trường code; không có thì undefined. */
function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
}
