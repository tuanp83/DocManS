import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { autoAssignPortfolioOfficer, defaultMilitaryScope, MILITARY_SCOPE_LABELS, readMilitaryScope } from "../proposals-shared/management-portfolio.js";
import { isResearchManagementHead, isResearchManagementStaff } from "../proposals-shared/proposal-access.js";
import { MANAGEMENT_OFFICER_STATUS, ProposalManagementOfficerService } from "../proposals-shared/proposal-management-officer.service.js";
import { isRoundActiveStatus, REVIEW_ASSIGNMENT_STATUS, REVIEW_STATUS } from "../proposals-shared/proposal-review-access.js";
import { PROPOSAL_STATUS_LABELS } from "../proposals-shared/proposal-workflow.js";
import { currentSubmissionFromEvents, type SubmissionEventLike } from "../proposals-shared/submission-evidence.js";
import { isRelationshipActiveAt } from "../proposals-shared/proposal-participation.js";

/** Hồ sơ hiện trên trang điều phối: từ khi nộp đến khi có quyết định. */
const COORDINATION_STATUSES = ["submitted", "resubmitted", "supplement_requested", "under_review", "ready_for_approval", "approved", "rejected"];
const MAX_ROWS = 500;
const MAX_RULES = 30;

type OverviewProposal = {
  id: string;
  code: string | null;
  title: string;
  ownerId: string;
  status: string;
  submittedAt: Date | null;
  hostOrganizationUnitId: string;
  proposalTypeCode: string | null;
  researchFieldCode: string | null;
  militaryScope: string | null;
  councilMetadata: unknown;
  owner?: { displayName: string } | null;
  hostOrganizationUnit?: { name: string } | null;
};

/**
 * Trang điều phối đánh giá (/reviews):
 *   - Tổng quan: mọi hồ sơ người xem điều phối được (Trưởng phòng: trong phạm vi đơn vị; chuyên viên: hồ sơ mình
 *     phụ trách), kèm mảng, chuyên viên phụ trách và tiến độ phản biện — một lượt truy vấn cho cả danh sách.
 *   - Mảng phụ trách: Trưởng phòng giao cho mỗi chuyên viên các quy tắc cấp đề tài × tính chất; hồ sơ nộp vào được
 *     tự giao theo mảng (management-portfolio.ts), và giao bù được các hồ sơ chưa có người phụ trách.
 */
@Injectable()
export class EvaluationCoordinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async overview(actor: SafeUserContext) {
    const isHead = isResearchManagementHead(actor);
    if (!isHead && !isResearchManagementStaff(actor)) {
      throw new ForbiddenException({ message: "Trang điều phối đánh giá dành cho Trưởng phòng và chuyên viên quản lý khoa học." });
    }
    const scopeIds = actor.organizationScopes.map((scope) => scope.id);
    const now = new Date();
    const officerRows = isHead
      ? null
      : ((await this.prisma.proposalManagementOfficer.findMany({
          where: { officerUserId: actor.id, status: MANAGEMENT_OFFICER_STATUS.active },
          select: { proposalId: true, effectiveFrom: true, effectiveUntil: true }
        })) as Array<{ proposalId: string; effectiveFrom: Date; effectiveUntil: Date | null }>).filter((row) => row.effectiveFrom <= now && (!row.effectiveUntil || now < row.effectiveUntil));

    const proposals = (await this.prisma.researchProposal.findMany({
      where: {
        status: { in: COORDINATION_STATUSES },
        hostOrganizationUnitId: { in: scopeIds },
        ...(officerRows ? { id: { in: officerRows.map((row) => row.proposalId) } } : {})
      },
      select: {
        id: true, code: true, title: true, ownerId: true, status: true, submittedAt: true, hostOrganizationUnitId: true,
        proposalTypeCode: true, researchFieldCode: true, militaryScope: true, councilMetadata: true,
        owner: { select: { displayName: true } },
        hostOrganizationUnit: { select: { name: true } }
      },
      orderBy: { submittedAt: "desc" },
      take: MAX_ROWS
    } as never)) as unknown as OverviewProposal[];
    const ids = proposals.map((proposal) => proposal.id);

    const [officers, events, assignments, reviews, summaries, levels] = await Promise.all([
      new ProposalManagementOfficerService(this.prisma).resolveForProposals(ids, now),
      ids.length
        ? (this.prisma.proposalSubmissionEvent.findMany({ where: { proposalId: { in: ids } }, select: { id: true, proposalId: true, toStatus: true, submittedAt: true, snapshot: true } }) as Promise<SubmissionEventLike[]>)
        : Promise.resolve([] as SubmissionEventLike[]),
      ids.length
        ? (this.prisma.proposalReviewAssignment.findMany({ where: { proposalId: { in: ids } }, select: { id: true, proposalId: true, status: true, acceptedAt: true, reviewedSubmissionEventId: true, assignmentRole: true } }) as Promise<Array<{ id: string; proposalId: string; status: string; acceptedAt: Date | null; reviewedSubmissionEventId: string | null; assignmentRole: string }>>)
        : Promise.resolve([]),
      ids.length
        ? (this.prisma.proposalReview.findMany({ where: { proposalId: { in: ids }, status: REVIEW_STATUS.submitted }, select: { assignmentId: true, proposalId: true, totalScore: true, submissionEventId: true } }) as Promise<Array<{ assignmentId: string; proposalId: string; totalScore: number | null; submissionEventId: string | null }>>)
        : Promise.resolve([]),
      ids.length
        ? (this.prisma.proposalEvaluationSummary.findMany({ where: { proposalId: { in: ids } }, select: { proposalId: true, status: true } }) as Promise<Array<{ proposalId: string; status: string }>>)
        : Promise.resolve([]),
      this.proposalLevels()
    ]);

    const levelName = new Map(levels.map((level) => [level.code, level.name]));
    const rows = proposals.map((proposal) => {
      const round = currentSubmissionFromEvents(proposal, events.filter((event) => event.proposalId === proposal.id));
      const mine = assignments.filter((item) => item.proposalId === proposal.id && round && item.reviewedSubmissionEventId === round.eventId);
      const active = mine.filter((item) => isRoundActiveStatus(item.status));
      const activeIds = new Set(active.map((item) => item.id));
      const submitted = reviews.filter((review) => activeIds.has(review.assignmentId) && review.submissionEventId === round?.eventId);
      const scores = submitted.map((review) => review.totalScore).filter((score): score is number => typeof score === "number");
      const officer = officers.get(proposal.id)?.officer ?? null;
      const council = (proposal.councilMetadata ?? null) as { status?: string; members?: unknown[] } | null;
      const militaryScope = (proposal.militaryScope ?? defaultMilitaryScope(proposal)) as keyof typeof MILITARY_SCOPE_LABELS;
      return {
        id: proposal.id,
        code: proposal.code ?? "",
        title: proposal.title,
        ownerDisplayName: proposal.owner?.displayName ?? "",
        hostOrganizationUnitName: proposal.hostOrganizationUnit?.name ?? "",
        status: proposal.status,
        statusLabel: PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status,
        submittedAt: proposal.submittedAt?.toISOString() ?? "",
        proposalLevel: proposal.proposalTypeCode ?? "",
        proposalLevelLabel: proposal.proposalTypeCode ? (levelName.get(proposal.proposalTypeCode) ?? proposal.proposalTypeCode) : "Chưa phân cấp",
        militaryScope,
        militaryScopeLabel: MILITARY_SCOPE_LABELS[militaryScope] ?? militaryScope,
        officer: officer ? { userId: officer.officerUserId, displayName: officer.officer?.displayName ?? "", assignedAt: officer.effectiveFrom.toISOString() } : null,
        review: {
          activeCount: active.length,
          scoringCount: active.filter((item) => item.assignmentRole !== "committee_secretary").length,
          submittedCount: submitted.length,
          pendingInvitationCount: mine.filter((item) => (item.status === REVIEW_ASSIGNMENT_STATUS.assigned || item.status === REVIEW_ASSIGNMENT_STATUS.invited) && !item.acceptedAt).length,
          declinedCount: mine.filter((item) => item.status === REVIEW_ASSIGNMENT_STATUS.declined).length,
          averageScore: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null
        },
        councilStatus: council?.status ?? "",
        councilMemberCount: Array.isArray(council?.members) ? council!.members!.length : 0,
        summaryStatus: summaries.find((summary) => summary.proposalId === proposal.id)?.status ?? ""
      };
    });

    return { viewerRole: isHead ? "head" : "officer", truncated: proposals.length === MAX_ROWS, proposals: rows };
  }

  /** Danh sách chuyên viên trong phạm vi của Trưởng phòng, mảng đang phụ trách và số hồ sơ đang phụ trách. */
  async listPortfolios(actor: SafeUserContext) {
    this.assertHead(actor);
    const scopeIds = actor.organizationScopes.map((scope) => scope.id);
    const officers = (await this.prisma.user.findMany({
      where: { status: "active", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationScopes: { some: { organizationUnitId: { in: scopeIds } } } },
      select: { id: true, username: true, displayName: true, unit: true },
      orderBy: { displayName: "asc" }
    })) as Array<{ id: string; username: string | null; displayName: string; unit: string | null }>;
    const officerIds = officers.map((officer) => officer.id);
    const [rules, workload, levels] = await Promise.all([
      officerIds.length ? (this.prisma.managementPortfolio.findMany({ where: { officerUserId: { in: officerIds } }, orderBy: { createdAt: "asc" } }) as Promise<Array<{ id: string; officerUserId: string; proposalLevel: string | null; militaryScope: string | null }>>) : Promise.resolve([]),
      officerIds.length ? (this.prisma.proposalManagementOfficer.findMany({ where: { officerUserId: { in: officerIds }, status: MANAGEMENT_OFFICER_STATUS.active, effectiveUntil: null }, select: { officerUserId: true } }) as Promise<Array<{ officerUserId: string }>>) : Promise.resolve([]),
      this.proposalLevels()
    ]);
    const levelName = new Map(levels.map((level) => [level.code, level.name]));
    return {
      levels,
      militaryScopes: Object.entries(MILITARY_SCOPE_LABELS).map(([code, name]) => ({ code, name })),
      officers: officers.map((officer) => ({
        id: officer.id,
        username: officer.username ?? "",
        displayName: officer.displayName,
        unit: officer.unit ?? "",
        activeProposalCount: workload.filter((row) => row.officerUserId === officer.id).length,
        rules: rules
          .filter((rule) => rule.officerUserId === officer.id)
          .map((rule) => ({
            id: rule.id,
            proposalLevel: rule.proposalLevel,
            militaryScope: rule.militaryScope,
            label: ruleLabel(rule, levelName)
          }))
      }))
    };
  }

  /** Thay toàn bộ mảng phụ trách của một chuyên viên. Không ảnh hưởng hồ sơ đã giao trước đó. */
  async setPortfolio(actor: SafeUserContext, officerUserId: string, input: Record<string, unknown>) {
    this.assertHead(actor);
    const officer = (await this.prisma.user.findUnique({ where: { id: officerUserId }, include: { organizationScopes: true } } as never)) as unknown as {
      id: string; status: string; systemRole: string | null; organizationScopes: Array<{ organizationUnitId: string }>;
    } | null;
    if (!officer || officer.status !== "active" || officer.systemRole !== "RESEARCH_MANAGEMENT_STAFF") throw new NotFoundException({ message: "Không tìm thấy chuyên viên quản lý khoa học đang hoạt động." });
    if (!officer.organizationScopes.some((scope) => actor.organizationScopes.some((own) => own.id === scope.organizationUnitId))) {
      throw new ForbiddenException({ message: "Chuyên viên này không thuộc phạm vi đơn vị của đồng chí." });
    }
    if (!Array.isArray(input.rules) || input.rules.length > MAX_RULES) throw new BadRequestException({ message: `Danh sách mảng không hợp lệ (tối đa ${MAX_RULES} mảng).` });
    const levelCodes = new Set((await this.proposalLevels()).map((level) => level.code));
    const seen = new Set<string>();
    const rules: Array<{ proposalLevel: string | null; militaryScope: string | null }> = [];
    for (const raw of input.rules as unknown[]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException({ message: "Mảng phụ trách không hợp lệ." });
      const item = raw as Record<string, unknown>;
      const proposalLevel = item.proposalLevel === undefined || item.proposalLevel === null || item.proposalLevel === "" ? null : String(item.proposalLevel);
      if (proposalLevel && !levelCodes.has(proposalLevel)) throw new BadRequestException({ message: "Cấp đề tài không có trong danh mục." });
      const militaryScope = readMilitaryScope(item.militaryScope) ?? null;
      if (!proposalLevel && !militaryScope) throw new BadRequestException({ message: "Mỗi mảng cần chọn cấp đề tài, tính chất, hoặc cả hai." });
      const key = `${proposalLevel ?? "*"}|${militaryScope ?? "*"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({ proposalLevel, militaryScope });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.managementPortfolio.deleteMany({ where: { officerUserId } });
      for (const rule of rules) await tx.managementPortfolio.create({ data: { officerUserId, ...rule, createdById: actor.id } });
      await tx.auditLog.create({
        data: { action: "set-management-portfolio", result: "success", actorId: actor.id, targetEntity: "user", targetEntityId: officerUserId, username: actor.username, reason: JSON.stringify({ rules }) }
      });
    });
    return this.listPortfolios(actor);
  }

  /** Giao bù theo mảng cho các hồ sơ đang ở bước tiếp nhận/đánh giá mà chưa có chuyên viên phụ trách. */
  async autoAssignUnassigned(actor: SafeUserContext) {
    this.assertHead(actor);
    const scopeIds = actor.organizationScopes.map((scope) => scope.id);
    const proposals = (await this.prisma.researchProposal.findMany({
      where: { status: { in: ["submitted", "resubmitted", "supplement_requested", "under_review", "ready_for_approval"] }, hostOrganizationUnitId: { in: scopeIds } },
      select: { id: true, ownerId: true, hostOrganizationUnitId: true, proposalTypeCode: true, researchFieldCode: true, militaryScope: true }
    } as never)) as unknown as Array<{ id: string; ownerId: string; hostOrganizationUnitId: string; proposalTypeCode: string | null; researchFieldCode: string | null; militaryScope: string | null }>;
    const officers = await new ProposalManagementOfficerService(this.prisma).resolveForProposals(proposals.map((proposal) => proposal.id));
    let assigned = 0;
    let unmatched = 0;
    for (const proposal of proposals) {
      const current = officers.get(proposal.id);
      if (!current?.resolved || current.officer) continue;
      const members = (await this.prisma.proposalMember.findMany({ where: { proposalId: proposal.id } })) as Array<{ userId: string | null; status?: string; effectiveFrom?: Date; effectiveUntil?: Date | null }>;
      const participants = new Set(members.filter((member) => member.userId && isRelationshipActiveAt(member as never, new Date())).map((member) => member.userId as string));
      const officerUserId = await this.prisma.$transaction((tx) =>
        autoAssignPortfolioOfficer(tx, { ...proposal, militaryScope: proposal.militaryScope ?? defaultMilitaryScope(proposal) }, actor.id, new Date(), participants)
      );
      if (officerUserId) assigned += 1;
      else unmatched += 1;
    }
    await this.auditLog.record({ action: "auto-assign-unassigned-proposals", result: "success", actorId: actor.id, targetEntity: "research-proposal", targetEntityId: "batch", username: actor.username, reason: JSON.stringify({ assigned, unmatched }) });
    return { assigned, unmatched };
  }

  private assertHead(actor: SafeUserContext) {
    if (!isResearchManagementHead(actor)) throw new ForbiddenException({ message: "Chỉ Trưởng phòng quản lý khoa học được phân công mảng cho chuyên viên." });
  }

  private async proposalLevels() {
    return (await this.prisma.catalogItem.findMany({
      where: { type: "proposal-type", status: "active", deletedAt: null },
      select: { code: true, name: true },
      orderBy: { name: "asc" }
    })) as Array<{ code: string; name: string }>;
  }
}

function ruleLabel(rule: { proposalLevel: string | null; militaryScope: string | null }, levelName: Map<string, string>) {
  const parts = [
    rule.proposalLevel ? (levelName.get(rule.proposalLevel) ?? rule.proposalLevel) : "",
    rule.militaryScope ? (MILITARY_SCOPE_LABELS[rule.militaryScope as keyof typeof MILITARY_SCOPE_LABELS] ?? rule.militaryScope) : ""
  ].filter(Boolean);
  return parts.join(" – ");
}
