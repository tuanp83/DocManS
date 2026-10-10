import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { label, leadershipUserIds, NOTIFICATION_TYPES, projectLink, researchManagersInScope, vnDate } from "../notifications/workflow-events.js";
import { readTransactionClockV1 } from "../permissions/authorization-v1.service.js";
import { readAcceptanceMembers, readAcceptanceScores, readCouncilType, readOptionalText, readResolution, type AcceptanceMemberInput } from "../proposal-evaluations/acceptance-council.js";
import { computeDisbursementTotals, readApprovedBudget, readDisbursementInput, stampMilestoneDates } from "../proposal-evaluations/disbursement.js";
import { ApprovedProjectsService, closureFacts, openAcceptanceRound, type NotifyFn } from "./approved-projects.service.js";
import { ACCEPTANCE_ROUND_STATUSES as R, LIQUIDATION_STATUSES, PROJECT_STATUSES, SUPERIOR_ACCEPTANCE_LEVELS, SUPERIOR_STATUSES } from "./project-capability-v1.js";
import { money, readDay, readFileIds, readMoney, readRequiredText, toDisbursementRecord } from "./project-closure-model.js";

type AnyRecord = Record<string, any>;

const VOUCHER_PURPOSE = "disbursement_voucher";
const ACCEPTANCE_DOSSIER_PURPOSE = "acceptance_dossier";
const LIQUIDATION_RECORD_PURPOSE = "liquidation_record";
const PRODUCT_EVIDENCE_PURPOSE = "product_evidence";
const PRODUCT_REVIEW_MINUTES_PURPOSE = "product_review_minutes";
const SUPERIOR_DOSSIER_PURPOSE = "superior_dossier";
const SUPERIOR_DEADLINE_DAYS = 30;
const PRODUCT_FORMS = [1, 2, 3, 4, 5, 6];
const PANEL_ROLES = ["LEADER", "MEMBER"];
const OPEN_REQUEST_STATUSES = ["submitted", "under_staff_review", "supplement_requested", "under_staff_validation", "ready_for_head_decision"];
const PENDING_REPORT_STATUSES = ["submitted", "under_review"];

const ACCEPTANCE_DECISION_NUMBER = { scope: "acceptance-council-decision", format: (year: number, sequence: string) => `${sequence}/QĐ-HVQY-NT/${year}`, takenMessage: "Số quyết định thành lập Hội đồng nghiệm thu đã được dùng." };
const LIQUIDATION_NUMBER = { scope: "project-liquidation", format: (year: number, sequence: string) => `${sequence}/BBTL-HVQY/${year}`, takenMessage: "Số biên bản thanh lý đã được dùng cho đề tài khác." };

/**
 * Nghiệm thu, kinh phí (giải ngân/quyết toán), thanh lý và đóng đề tài.
 * Thiết kế và quy tắc: docs/design/nghiem-thu-thanh-ly-dong-de-tai.md.
 *
 * Mọi thao tác ghi đi qua `ApprovedProjectsService.mutate` (khoá dòng đề tài, Serializable, contextVersion),
 * kiểm tra quyền bằng chính capability trả về cho giao diện (một nguồn sự thật), ghi lịch sử đề tài
 * (append-only) và audit log trong cùng giao dịch, và chỉ gửi thông báo sau khi commit.
 */
@Injectable()
export class ProjectClosureService {
  constructor(private readonly prisma: PrismaService, private readonly projects: ApprovedProjectsService) {}

  // ---- Đọc --------------------------------------------------------------------------------------

  async getFinance(actor: SafeUserContext, projectId: string) {
    const loaded = await this.projects.loadAuthorized(this.prisma, actor, projectId);
    this.assertAllowed(loaded.capability, "project.finance.read");
    const client = this.prisma as any;
    const [finance, tranches, costItems] = await Promise.all([
      client.projectFinance.findUnique({ where: { projectId }, include: { updatedBy: { select: { displayName: true } } } }),
      client.projectDisbursement.findMany({ where: { projectId }, orderBy: { position: "asc" } }),
      client.projectCostItem.findMany({ where: { projectId }, orderBy: { position: "asc" } })
    ]);
    return {
      projectId,
      disbursement: toDisbursementRecord(finance, tranches, costItems, this.approvedBudget(loaded.project, null)),
      projectMilestones: (loaded.project.milestones ?? []).map((item: AnyRecord) => ({ id: item.id, title: item.title, dueDate: item.dueDate?.toISOString?.() ?? null, status: item.status })),
      canManage: loaded.capability.allowedActions.includes("project.finance.manage"),
      manageDeniedReason: loaded.capability.blockedActions.find((item: AnyRecord) => item.action === "project.finance.manage")?.reason ?? null,
      contextVersion: loaded.capability.contextVersion
    };
  }

  /** Ứng viên hội đồng nghiệm thu: hồ sơ nhà khoa học đang hoạt động; người tham gia đề tài bị đánh dấu xung đột. */
  async councilCandidates(actor: SafeUserContext, projectId: string) {
    const loaded = await this.projects.loadAuthorized(this.prisma, actor, projectId);
    if (!loaded.capability.allowedActions.includes("project.product.review")) this.assertAllowed(loaded.capability, "project.acceptance.council.propose");
    const teamUserIds = new Set((loaded.project.members ?? []).map((member: AnyRecord) => member.userId).filter(Boolean));
    const profiles = (await (this.prisma as any).researcherProfile.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, title: true, linkedUserId: true, managementOrganizationUnitId: true, managementOrganizationUnit: { select: { name: true } } },
      orderBy: { fullName: "asc" }
    })) as AnyRecord[];
    return profiles.map((profile) => {
      const conflicted = !!profile.linkedUserId && teamUserIds.has(profile.linkedUserId);
      const sameUnit = profile.managementOrganizationUnitId === loaded.project.hostOrganizationUnitId;
      return {
        profileId: profile.id,
        fullName: profile.fullName,
        academicTitle: profile.title ?? "",
        unit: profile.managementOrganizationUnit?.name ?? "",
        userId: profile.linkedUserId ?? null,
        isConflicted: conflicted,
        conflictReason: conflicted ? "Là chủ nhiệm hoặc thành viên đề tài" : sameUnit ? "Cùng đơn vị chủ trì — cân nhắc tính khách quan" : null
      };
    });
  }

  // ---- Kinh phí -----------------------------------------------------------------------------------

  async updateFinance(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
      this.assertAllowed(loaded.capability, "project.finance.manage");
      const previous = await tx.projectFinance.findUnique({ where: { projectId } });
      const expectedVersion = input.financeVersion === undefined || input.financeVersion === null ? null : Number(input.financeVersion);
      if (expectedVersion === null || !Number.isInteger(expectedVersion) || expectedVersion !== (previous?.version ?? 0)) {
        throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Dữ liệu kinh phí đã được người khác cập nhật. Vui lòng tải lại trước khi lưu." });
      }
      const previousTranches = await tx.projectDisbursement.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      const previousCostItems = await tx.projectCostItem.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      const previousRecord = toDisbursementRecord(previous, previousTranches, previousCostItems, 0);

      const totalBudget = this.approvedBudget(project, previous);
      const accepted = readDisbursementInput(input, totalBudget);
      const milestones = stampMilestoneDates(accepted.milestones, previousRecord);
      const projectMilestoneIds = new Set((project.milestones ?? []).map((item: AnyRecord) => item.id));
      for (const milestone of milestones) {
        if (milestone.projectMilestoneId && !projectMilestoneIds.has(milestone.projectMilestoneId)) {
          throw new BadRequestException({ code: "DISBURSEMENT_INVALID", message: `Đợt "${milestone.name}" gắn với mốc không thuộc đề tài.` });
        }
      }
      // Chứng từ phải là tệp đang hoạt động, thuộc chính đề tài, đúng mục đích "chứng từ giải ngân"; tên tệp lấy từ CSDL.
      const attachmentIds = [...new Set(milestones.flatMap((milestone) => milestone.attachments.map((item) => item.id)))];
      const files = attachmentIds.length
        ? await tx.fileRecord.findMany({ where: { id: { in: attachmentIds }, relatedEntityType: "approved_project", relatedEntityId: projectId, filePurpose: VOUCHER_PURPOSE, status: "active", deletedAt: null } })
        : [];
      const fileById = new Map(files.map((file: AnyRecord) => [file.id, file]));
      for (const milestone of milestones) {
        milestone.attachments = milestone.attachments.map((item) => {
          const file = fileById.get(item.id) as AnyRecord | undefined;
          if (!file) throw new BadRequestException({ code: "DISBURSEMENT_INVALID", message: `Chứng từ "${item.fileName}" không thuộc đề tài này hoặc đã bị xoá.` });
          return { ...item, fileName: file.originalFileName, fileSize: file.sizeBytes ?? item.fileSize };
        });
      }
      const totals = computeDisbursementTotals(milestones, accepted.costItems);
      const now = await readTransactionClockV1(tx);
      const data = { totalBudget: BigInt(totalBudget), totalDisbursed: BigInt(totals.totalDisbursed), totalSettled: BigInt(totals.totalSettled), settlementStatus: accepted.settlementStatus, notes: accepted.notes, updatedById: currentActor.id };
      await tx.projectFinance.upsert({ where: { projectId }, create: { projectId, ...data, version: 1 }, update: { ...data, version: { increment: 1 } } });
      await tx.projectDisbursement.deleteMany({ where: { projectId } });
      await tx.projectCostItem.deleteMany({ where: { projectId } });
      if (milestones.length) {
        await tx.projectDisbursement.createMany({ data: milestones.map((milestone, position) => ({
          projectId, trancheKey: milestone.id, position, name: milestone.name, percentage: milestone.percentage,
          expectedAmount: BigInt(milestone.expectedAmount), disbursedAmount: BigInt(milestone.disbursedAmount), status: milestone.status,
          disbursedDate: milestone.disbursedDate ? readDay(milestone.disbursedDate, "Ngày giải ngân") : null,
          settledDate: milestone.settledDate ? readDay(milestone.settledDate, "Ngày quyết toán") : null,
          evidenceNotes: milestone.evidenceNotes ?? null, attachments: milestone.attachments, projectMilestoneId: milestone.projectMilestoneId ?? null
        })) });
      }
      if (accepted.costItems.length) {
        await tx.projectCostItem.createMany({ data: accepted.costItems.map((item, position) => ({ projectId, position, code: item.code, name: item.name, allocatedAmount: BigInt(item.allocatedAmount), spentAmount: BigInt(item.spentAmount), settledAmount: BigInt(item.settledAmount) })) });
      }
      const after = { totalBudget, ...totals, settlementStatus: accepted.settlementStatus, milestones: milestones.length, costItems: accepted.costItems.length };
      const before = previous ? { totalBudget: money(previous.totalBudget), totalDisbursed: money(previous.totalDisbursed), totalSettled: money(previous.totalSettled), settlementStatus: previous.settlementStatus } : null;
      await tx.projectHistory.create({ data: { projectId, actorId: currentActor.id, action: "project.finance.update", reason: "Cập nhật giải ngân và quyết toán", beforeFacts: before, afterFacts: after, createdAt: now } });
      await new AuditLogService(tx).record({ action: "update-project-finance", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: projectId, username: currentActor.username, beforeFacts: previous ? { disbursement: previousRecord } : undefined, afterFacts: { disbursement: { ...accepted, milestones, ...totals, totalBudget } } });
      const recipients = this.projects.projectRecipients(project, loaded.officer);
      notify({ type: NOTIFICATION_TYPES.disbursementUpdate, userIds: recipients.pi, excludeUserIds: [currentActor.id], title: "Cập nhật giải ngân", message: `Thông tin giải ngân, quyết toán của đề tài ${label(project)} vừa được cập nhật.`, link: projectLink(projectId), metadata: { projectId } });

      const saved = await tx.projectFinance.findUnique({ where: { projectId }, include: { updatedBy: { select: { displayName: true } } } });
      const tranches = await tx.projectDisbursement.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      const costItems = await tx.projectCostItem.findMany({ where: { projectId }, orderBy: { position: "asc" } });
      return { projectId, disbursement: toDisbursementRecord(saved, tranches, costItems, totalBudget) };
    });
  }

  // ---- Nghiệm thu ---------------------------------------------------------------------------------

  /** Chủ nhiệm nộp hồ sơ nghiệm thu: báo cáo tổng kết, sản phẩm, tự đánh giá và tệp minh chứng. */
  async submitAcceptance(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
      this.assertAllowed(loaded.capability, "project.acceptance.submit");
      if (openAcceptanceRound(project)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Đề tài đang có vòng nghiệm thu chưa kết thúc." });
      // Bước 1: mọi sản phẩm (nội dung công việc trong thuyết minh) phải được tổ chuyên gia nghiệm thu đạt.
      const products = (project.products ?? []) as AnyRecord[];
      if (!products.length) throw new BadRequestException({ code: "ACCEPTANCE_NOT_READY", message: "Đề tài chưa có danh sách sản phẩm (nội dung công việc). Chuyên viên phụ trách cần nhập danh sách sản phẩm theo thuyết minh." });
      const pendingProducts = products.filter((item) => item.status !== "PASSED");
      if (pendingProducts.length) throw new BadRequestException({ code: "ACCEPTANCE_NOT_READY", message: `Còn ${pendingProducts.length} sản phẩm chưa được tổ chuyên gia nghiệm thu đạt (${pendingProducts.slice(0, 3).map((item) => item.title).join("; ")}).` });
      if ((project.requests ?? []).some((item: AnyRecord) => OPEN_REQUEST_STATUSES.includes(item.status))) throw new BadRequestException({ code: "ACCEPTANCE_NOT_READY", message: "Còn yêu cầu điều chỉnh/gia hạn đang xử lý." });
      if ((project.reports ?? []).some((item: AnyRecord) => PENDING_REPORT_STATUSES.includes(item.status))) throw new BadRequestException({ code: "ACCEPTANCE_NOT_READY", message: "Còn báo cáo tiến độ đang chờ chuyên viên xem xét." });
      const dossier = await this.readDossier(tx, projectId, input, true);
      const now = await readTransactionClockV1(tx);
      const round = ((project.acceptances ?? []).reduce((max: number, row: AnyRecord) => Math.max(max, row.round), 0) as number) + 1;
      const created = await tx.projectAcceptance.create({ data: { projectId, round, status: R.submitted, dossier: { ...dossier, submittedAt: now.toISOString() }, submittedById: currentActor.id, submittedAt: now } });
      await this.transition(tx, currentActor, project, PROJECT_STATUSES.pendingAcceptance, "project.acceptance.submit", "Chủ nhiệm nộp hồ sơ nghiệm thu", { acceptanceId: created.id, round, evidenceFileIds: dossier.evidenceFileIds }, now);
      const officerIds = loaded.officer ? [loaded.officer.officerUserId] : await researchManagersInScope(tx, project.hostOrganizationUnitId);
      notify({ type: NOTIFICATION_TYPES.acceptanceSubmitted, userIds: officerIds, excludeUserIds: [currentActor.id], title: `Hồ sơ nghiệm thu: ${project.title}`, message: `Chủ nhiệm đã nộp hồ sơ nghiệm thu (vòng ${round}) của đề tài ${label(project)}. Vui lòng kiểm tra và đề xuất hội đồng.`, link: projectLink(projectId), metadata: { projectId, acceptanceId: created.id, round } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Chuyên viên trả hồ sơ nghiệm thu chưa đạt yêu cầu; đề tài quay lại "đang thực hiện". */
  async returnAcceptance(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.acceptance.return");
      const round = this.currentRound(project, [R.submitted]);
      const reason = readRequiredText(input.reason, "Lý do trả hồ sơ", 2000);
      const now = await readTransactionClockV1(tx);
      await tx.projectAcceptance.update({ where: { id: round.id }, data: { status: R.returned, returnReason: reason, completedAt: now } });
      await this.transition(tx, currentActor, project, PROJECT_STATUSES.executing, "project.acceptance.return", reason, { acceptanceId: round.id, round: round.round }, now);
      notify({ type: NOTIFICATION_TYPES.acceptanceReturned, userIds: this.projects.projectRecipients(project, loaded.officer).pi, title: `Hồ sơ nghiệm thu bị trả lại: ${project.title}`, message: `Hồ sơ nghiệm thu vòng ${round.round} của đề tài ${label(project)} cần hoàn thiện và nộp lại. Lý do: ${reason}`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  async proposeCouncil(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.authorizeOperator(tx, currentActor, project, "project.acceptance.council.propose");
      const round = this.currentRound(project, [R.submitted, R.councilProposed]);
      const members = await this.resolveCouncilMembers(tx, project, readAcceptanceMembers(input.members));
      const now = await readTransactionClockV1(tx);
      const data = {
        status: R.councilProposed,
        councilType: readCouncilType(input.councilType || "FACILITY"),
        councilMembers: members,
        meetingDate: readDay(input.meetingDate, "Ngày họp dự kiến"),
        meetingLocation: readOptionalText(input.meetingLocation, "Địa điểm họp", 300) || null,
        tentativeAgenda: readOptionalText(input.tentativeAgenda, "Chương trình dự kiến", 2000) || null,
        councilProposedAt: now
      };
      await tx.projectAcceptance.update({ where: { id: round.id }, data });
      await this.record(tx, currentActor, project, "project.acceptance.council.propose", "Đề xuất hội đồng nghiệm thu", { acceptanceId: round.id, councilType: data.councilType, members: members.map((member) => ({ profileId: member.profileId, role: member.role })) }, now);
      if (round.status !== R.councilProposed) {
        notify({ type: NOTIFICATION_TYPES.acceptanceCouncilProposed, userIds: await leadershipUserIds(tx), excludeUserIds: [currentActor.id, ...this.projects.projectRecipients(project).team], title: `Đề xuất hội đồng nghiệm thu: ${project.title}`, message: `Chuyên viên đã đề xuất hội đồng nghiệm thu đề tài ${label(project)}. Vui lòng xem xét, ký quyết định thành lập.`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id } });
      }
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Lãnh đạo ký quyết định thành lập hội đồng nghiệm thu (số quyết định tự cấp nếu không nhập). */
  async establishCouncil(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    try {
      return await this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
        const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
        this.assertAllowed(loaded.capability, "project.acceptance.council.establish");
        await this.projects.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
        const round = this.currentRound(project, [R.councilProposed]);
        const decisionDate = readDay(input.decisionDate, "Ngày quyết định") ?? await readTransactionClockV1(tx);
        const requested = typeof input.decisionNumber === "string" ? input.decisionNumber.trim() : "";
        if (requested.length > 100) throw new BadRequestException({ message: "Số quyết định không được vượt quá 100 ký tự." });
        const decisionNumber = await this.documentNumber(tx, ACCEPTANCE_DECISION_NUMBER, requested, decisionDate, (number) => this.acceptanceNumberTaken(tx, number, round.id, project.proposalId));
        const now = await readTransactionClockV1(tx);
        await tx.projectAcceptance.update({ where: { id: round.id }, data: { status: R.councilEstablished, decisionNumber, decisionDate, establishedById: currentActor.id, establishedAt: now } });
        await this.record(tx, currentActor, project, "project.acceptance.council.establish", `Quyết định thành lập hội đồng nghiệm thu số ${decisionNumber}`, { acceptanceId: round.id, decisionNumber }, now);
        const recipients = this.projects.projectRecipients(project, loaded.officer);
        const councilUserIds = (Array.isArray(round.councilMembers) ? round.councilMembers : []).map((member: AnyRecord) => member.userId).filter(Boolean);
        notify({ type: NOTIFICATION_TYPES.acceptanceCouncilEstablished, userIds: [...recipients.pi, ...recipients.officer], excludeUserIds: [currentActor.id], title: `Đã thành lập hội đồng nghiệm thu: ${project.title}`, message: `Quyết định số ${decisionNumber} thành lập hội đồng nghiệm thu đề tài ${label(project)}. Ngày họp dự kiến: ${vnDate(round.meetingDate)}.`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id, decisionNumber } });
        notify({ type: NOTIFICATION_TYPES.reviewInvitation, userIds: councilUserIds, excludeUserIds: [currentActor.id], title: `Mời tham gia hội đồng nghiệm thu: ${project.title}`, message: `Bạn có tên trong hội đồng nghiệm thu đề tài ${label(project)} (quyết định số ${decisionNumber}). Ngày họp dự kiến: ${vnDate(round.meetingDate)}${round.meetingLocation ? `, tại ${round.meetingLocation}` : ""}. Phòng Quản lý khoa học sẽ gửi hồ sơ nghiệm thu tới thành viên hội đồng.`, metadata: { projectId, acceptanceId: round.id, decisionNumber } });
        return this.reload(tx, currentActor, projectId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException({ code: "ACCEPTANCE_DECISION_NUMBER_TAKEN", message: ACCEPTANCE_DECISION_NUMBER.takenMessage });
      throw error;
    }
  }

  /** Biên bản họp hội đồng: điểm bắt buộc, kết luận đạt / hoàn thiện / không đạt. */
  async recordMinutes(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.acceptance.minutes.record");
      const round = this.currentRound(project, [R.councilEstablished]);
      const evaluationResult = { ...readAcceptanceScores(input), assessmentComments: readOptionalText(input.assessmentComments, "Nhận xét của hội đồng", 4000) };
      const resolution = readResolution(input.resolution, evaluationResult.classification);
      const now = await readTransactionClockV1(tx);
      const status = resolution === "approved" ? R.passed : resolution === "rejected" ? R.failed : R.revisionRequired;
      // Ngày họp quyết định hạn 30 ngày đề nghị cấp trên: không ở tương lai, không trước khi nộp hồ sơ / có quyết định thành lập.
      const meetingDay = readDay(input.meetingDate, "Ngày họp") ?? (round.meetingDate instanceof Date ? round.meetingDate : null);
      if (meetingDay) {
        const earliest = [round.submittedAt ? localDay(round.submittedAt) : null, round.decisionDate instanceof Date ? round.decisionDate.toISOString().slice(0, 10) : null].filter(Boolean).sort().at(-1) as string | undefined;
        const meeting = meetingDay.toISOString().slice(0, 10);
        if (meeting > localDay(now)) throw new BadRequestException({ code: "MEETING_DATE_INVALID", message: "Ngày họp hội đồng không được ở tương lai." });
        if (earliest && meeting < earliest) throw new BadRequestException({ code: "MEETING_DATE_INVALID", message: "Ngày họp hội đồng không được trước ngày nộp hồ sơ hoặc ngày quyết định thành lập hội đồng." });
      }
      await tx.projectAcceptance.update({ where: { id: round.id }, data: {
        status, evaluationResult, resolution,
        meetingDate: meetingDay ?? null,
        meetingLocation: readOptionalText(input.meetingLocation, "Địa điểm họp", 300) || round.meetingLocation || null,
        minutesNotes: readOptionalText(input.minutesNotes, "Ghi chú biên bản", 4000) || null,
        minutesRecordedById: currentActor.id, evaluatedAt: now,
        ...(status === R.revisionRequired ? {} : { completedAt: now })
      } });
      const facts = { acceptanceId: round.id, resolution, totalScore: evaluationResult.totalScore, classification: evaluationResult.classification };
      if (status === R.revisionRequired) await this.record(tx, currentActor, project, "project.acceptance.minutes.record", "Hội đồng yêu cầu hoàn thiện hồ sơ", facts, now);
      else if (status === R.failed) await this.transition(tx, currentActor, project, PROJECT_STATUSES.failed, "project.acceptance.minutes.record", "Hội đồng nghiệm thu cơ sở: không đạt", facts, now);
      else await this.concludeFacilityAcceptance(tx, currentActor, project, round.id, meetingDay ?? now, "project.acceptance.minutes.record", "Hội đồng nghiệm thu cơ sở: đạt", facts, now, notify);
      const recipients = this.projects.projectRecipients(project, loaded.officer);
      const outcome = status === R.passed ? `ĐẠT (${evaluationResult.totalScore} điểm)` : status === R.failed ? `KHÔNG ĐẠT (${evaluationResult.totalScore} điểm)` : `cần hoàn thiện hồ sơ (${evaluationResult.totalScore} điểm)`;
      notify({ type: status === R.revisionRequired ? NOTIFICATION_TYPES.acceptanceRevision : NOTIFICATION_TYPES.acceptanceResult, userIds: recipients.team, excludeUserIds: [currentActor.id], title: `Kết quả nghiệm thu: ${project.title}`, message: `Hội đồng nghiệm thu kết luận đề tài ${label(project)} ${outcome}.${status === R.revisionRequired ? " Chủ nhiệm hoàn thiện theo góp ý và nộp bản hoàn thiện." : ""}`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id, resolution } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  async submitRevision(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
      this.assertAllowed(loaded.capability, "project.acceptance.revision.submit");
      const round = this.currentRound(project, [R.revisionRequired]);
      const dossier = await this.readDossier(tx, projectId, input, false);
      const now = await readTransactionClockV1(tx);
      // Giữ mọi lần nộp bản hoàn thiện: lần trước chuyển vào `previous`, tệp của mọi lần nằm trong `allEvidenceFileIds` (bị khoá).
      const prior = (round.revisionDossier ?? null) as AnyRecord | null;
      const previous = prior ? [...(Array.isArray(prior.previous) ? prior.previous : []), { finalReportSummary: prior.finalReportSummary, evidenceFileIds: prior.evidenceFileIds ?? [], submittedAt: prior.submittedAt ?? null, returnNote: round.revisionNote ?? null }] : [];
      const allEvidenceFileIds = [...new Set([...(Array.isArray(prior?.allEvidenceFileIds) ? prior!.allEvidenceFileIds : prior?.evidenceFileIds ?? []), ...dossier.evidenceFileIds])];
      await tx.projectAcceptance.update({ where: { id: round.id }, data: { status: R.revisionSubmitted, revisionDossier: { ...dossier, submittedAt: now.toISOString(), previous, allEvidenceFileIds } } });
      await this.record(tx, currentActor, project, "project.acceptance.revision.submit", "Chủ nhiệm nộp bản hoàn thiện sau nghiệm thu", { acceptanceId: round.id, evidenceFileIds: dossier.evidenceFileIds }, now);
      notify({ type: NOTIFICATION_TYPES.acceptanceRevision, userIds: loaded.officer ? [loaded.officer.officerUserId] : await researchManagersInScope(tx, project.hostOrganizationUnitId), excludeUserIds: [currentActor.id], title: `Bản hoàn thiện sau nghiệm thu: ${project.title}`, message: `Chủ nhiệm đã nộp bản hoàn thiện hồ sơ đề tài ${label(project)} theo kết luận của hội đồng.`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Chuyên viên xác nhận bản hoàn thiện (đề tài được nghiệm thu) hoặc yêu cầu hoàn thiện tiếp. */
  async confirmRevision(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.acceptance.revision.confirm");
      const round = this.currentRound(project, [R.revisionSubmitted]);
      if (input.outcome !== "accept" && input.outcome !== "return") throw new BadRequestException({ message: "Kết quả xác nhận không hợp lệ (accept hoặc return)." });
      const note = input.outcome === "return" ? readRequiredText(input.note, "Nội dung cần hoàn thiện tiếp", 2000) : readOptionalText(input.note, "Ghi chú", 2000) || null;
      const now = await readTransactionClockV1(tx);
      if (input.outcome === "accept") {
        await tx.projectAcceptance.update({ where: { id: round.id }, data: { status: R.passed, revisionNote: note, completedAt: now } });
        await this.concludeFacilityAcceptance(tx, currentActor, project, round.id, now, "project.acceptance.revision.confirm", note ?? "Xác nhận đã hoàn thiện theo kết luận hội đồng", { acceptanceId: round.id }, now, notify);
      } else {
        await tx.projectAcceptance.update({ where: { id: round.id }, data: { status: R.revisionRequired, revisionNote: note } });
        await this.record(tx, currentActor, project, "project.acceptance.revision.return", note!, { acceptanceId: round.id }, now);
      }
      notify({ type: input.outcome === "accept" ? NOTIFICATION_TYPES.acceptanceResult : NOTIFICATION_TYPES.acceptanceRevision, userIds: this.projects.projectRecipients(project, loaded.officer).team, excludeUserIds: [currentActor.id], title: input.outcome === "accept" ? `Đề tài đã được nghiệm thu: ${project.title}` : `Cần hoàn thiện tiếp: ${project.title}`, message: input.outcome === "accept" ? `Bản hoàn thiện của đề tài ${label(project)} đã được xác nhận; ${this.needsSuperior(project) ? "đề tài đã nghiệm thu cơ sở, Học viện sẽ đề nghị cấp trên nghiệm thu." : "đề tài được nghiệm thu."}` : `Bản hoàn thiện của đề tài ${label(project)} chưa đạt yêu cầu: ${note}`, link: projectLink(projectId), metadata: { projectId, acceptanceId: round.id } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  // ---- Thanh lý và đóng ---------------------------------------------------------------------------

  async prepareLiquidation(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.authorizeOperator(tx, currentActor, project, "project.liquidation.prepare");
      const finance = await tx.projectFinance.findUnique({ where: { projectId } });
      const totals = { approvedBudget: this.approvedBudget(project, finance), totalDisbursed: money(finance?.totalDisbursed), totalSettled: money(finance?.totalSettled) };
      const recoveredAmount = readMoney(input.recoveredAmount, "Số tiền thu hồi");
      if (recoveredAmount > totals.totalDisbursed) throw new BadRequestException({ code: "LIQUIDATION_INVALID", message: "Số tiền thu hồi không được lớn hơn số đã giải ngân." });
      const evidenceFileIds = readFileIds(input.evidenceFileIds, "Tệp biên bản thanh lý");
      await this.assertProjectFiles(tx, projectId, evidenceFileIds, LIQUIDATION_RECORD_PURPOSE);
      const now = await readTransactionClockV1(tx);
      const data = {
        status: LIQUIDATION_STATUSES.draft,
        outcome: project.status,
        liquidationDate: readDay(input.liquidationDate, "Ngày thanh lý"),
        approvedBudget: BigInt(totals.approvedBudget), totalDisbursed: BigInt(totals.totalDisbursed), totalSettled: BigInt(totals.totalSettled), recoveredAmount: BigInt(recoveredAmount),
        productsHandedOver: readOptionalText(input.productsHandedOver, "Sản phẩm bàn giao", 4000) || null,
        notes: readOptionalText(input.notes, "Ghi chú", 4000) || null,
        evidenceFileIds, preparedById: currentActor.id, preparedAt: now
      };
      const existed = !!project.liquidation;
      await tx.projectLiquidation.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
      await tx.approvedProject.update({ where: { id: projectId }, data: { aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await this.record(tx, currentActor, project, "project.liquidation.prepare", existed ? "Cập nhật dự thảo biên bản thanh lý" : "Lập biên bản thanh lý", { ...totals, recoveredAmount, outstanding: totals.totalDisbursed - totals.totalSettled - recoveredAmount }, now);
      if (!existed) notify({ type: NOTIFICATION_TYPES.liquidationPrepared, userIds: await leadershipUserIds(tx), excludeUserIds: [currentActor.id, ...this.projects.projectRecipients(project).team], title: `Biên bản thanh lý chờ phê duyệt: ${project.title}`, message: `Chuyên viên đã lập biên bản thanh lý đề tài ${label(project)}. Vui lòng xem xét, phê duyệt.`, link: projectLink(projectId), metadata: { projectId } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Lãnh đạo phê duyệt thanh lý: số liệu chốt lại theo kinh phí hiện tại và phải cân (quyết toán + thu hồi = đã cấp). */
  async approveLiquidation(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    try {
      return await this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
        const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
        this.assertAllowed(loaded.capability, "project.liquidation.approve");
        await this.projects.assertNoEvaluationConflict(tx, currentActor.id, project.proposalId);
        const liquidation = project.liquidation;
        if (!liquidation || liquidation.status !== LIQUIDATION_STATUSES.draft) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chưa có dự thảo biên bản thanh lý." });
        // Tệp kèm dự thảo có thể đã bị xoá sau khi lập: kiểm tra lại trước khi khoá vĩnh viễn.
        await this.assertProjectFiles(tx, projectId, Array.isArray(liquidation.evidenceFileIds) ? liquidation.evidenceFileIds : [], LIQUIDATION_RECORD_PURPOSE);
        const finance = await tx.projectFinance.findUnique({ where: { projectId } });
        const totalDisbursed = money(finance?.totalDisbursed);
        const totalSettled = money(finance?.totalSettled);
        const recovered = money(liquidation.recoveredAmount);
        if (totalSettled + recovered !== totalDisbursed) {
          throw new BadRequestException({ code: "LIQUIDATION_UNBALANCED", message: `Chưa cân đối kinh phí: đã giải ngân ${totalDisbursed.toLocaleString("vi-VN")} đ, đã quyết toán ${totalSettled.toLocaleString("vi-VN")} đ, thu hồi ${recovered.toLocaleString("vi-VN")} đ. Phần chênh lệch phải được quyết toán hoặc thu hồi trước khi phê duyệt.` });
        }
        const now = await readTransactionClockV1(tx);
        const liquidationDate = liquidation.liquidationDate ?? now;
        const requested = typeof input.liquidationNumber === "string" ? input.liquidationNumber.trim() : "";
        if (requested.length > 100) throw new BadRequestException({ message: "Số biên bản không được vượt quá 100 ký tự." });
        const liquidationNumber = await this.documentNumber(tx, LIQUIDATION_NUMBER, requested, liquidationDate, async (number) => !!(await tx.projectLiquidation.findFirst({ where: { liquidationNumber: number, NOT: { projectId } } })));
        await tx.projectLiquidation.update({ where: { projectId }, data: { status: LIQUIDATION_STATUSES.approved, liquidationNumber, liquidationDate, totalDisbursed: BigInt(totalDisbursed), totalSettled: BigInt(totalSettled), approvedBudget: BigInt(this.approvedBudget(project, finance)), approvedById: currentActor.id, approvedAt: now } });
        await tx.approvedProject.update({ where: { id: projectId }, data: { aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
        await this.record(tx, currentActor, project, "project.liquidation.approve", `Phê duyệt biên bản thanh lý số ${liquidationNumber}`, { liquidationNumber, totalDisbursed, totalSettled, recoveredAmount: recovered }, now);
        const recipients = this.projects.projectRecipients(project, loaded.officer);
        notify({ type: NOTIFICATION_TYPES.liquidationApproved, userIds: [...recipients.pi, ...recipients.officer], excludeUserIds: [currentActor.id], title: `Đã phê duyệt thanh lý: ${project.title}`, message: `Biên bản thanh lý số ${liquidationNumber} của đề tài ${label(project)} đã được phê duyệt. Chuyên viên phụ trách có thể đóng đề tài.`, link: projectLink(projectId), metadata: { projectId, liquidationNumber } });
        return this.reload(tx, currentActor, projectId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException({ code: "LIQUIDATION_NUMBER_TAKEN", message: LIQUIDATION_NUMBER.takenMessage });
      throw error;
    }
  }

  async closeProject(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.close");
      if ((project.requests ?? []).some((item: AnyRecord) => OPEN_REQUEST_STATUSES.includes(item.status))) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Còn yêu cầu điều chỉnh/gia hạn chưa xử lý xong." });
      const note = readOptionalText(input.note, "Ghi chú đóng đề tài", 2000) || null;
      const now = await readTransactionClockV1(tx);
      await tx.approvedProject.update({ where: { id: projectId }, data: { status: PROJECT_STATUSES.closed, closedAt: now, closedById: currentActor.id, closureNote: note, aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
      await tx.projectHistory.create({ data: { projectId, actorId: currentActor.id, action: "project.close", fromStatus: project.status, toStatus: PROJECT_STATUSES.closed, reason: note ?? "Đóng đề tài sau thanh lý", beforeFacts: { status: project.status }, afterFacts: { status: PROJECT_STATUSES.closed, liquidationNumber: project.liquidation?.liquidationNumber ?? null }, createdAt: now } });
      await new AuditLogService(tx).record({ action: "close-approved-project", result: "success", actorId: currentActor.id, targetEntity: "approved-project", targetEntityId: projectId, username: currentActor.username, reason: note ?? undefined, beforeFacts: { status: project.status }, afterFacts: { status: PROJECT_STATUSES.closed } });
      const recipients = this.projects.projectRecipients(project, loaded.officer);
      notify({ type: NOTIFICATION_TYPES.projectClosed, userIds: recipients.team, excludeUserIds: [currentActor.id], title: `Đề tài đã đóng: ${project.title}`, message: `Đề tài ${label(project)} đã hoàn tất nghiệm thu, thanh lý và được đóng hồ sơ.`, link: projectLink(projectId), metadata: { projectId } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  // ---- Bước 1: sản phẩm và tổ chuyên gia ------------------------------------------------------------

  /**
   * Danh sách sản phẩm = các nội dung công việc trong thuyết minh (dạng 1–6). Chuyên viên phụ trách lập và sửa;
   * sản phẩm đã nộp minh chứng không đổi tên / dạng và không xoá được.
   */
  async saveProducts(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.authorizeOperator(tx, currentActor, project, "project.product.manage");
      if (!Array.isArray(input.products) || input.products.length > 100) throw new BadRequestException({ message: "Danh sách sản phẩm không hợp lệ (tối đa 100)." });
      const existing = new Map(((project.products ?? []) as AnyRecord[]).map((item) => [item.id, item]));
      const milestoneIds = new Set((project.milestones ?? []).map((item: AnyRecord) => item.id));
      const keep = new Set<string>();
      const rows = input.products.map((item: AnyRecord, position: number) => {
        const label = `Sản phẩm #${position + 1}`;
        const title = readRequiredText(item?.title, `${label}: nội dung công việc`, 1000);
        const productForm = Number(item?.productForm);
        if (!PRODUCT_FORMS.includes(productForm)) throw new BadRequestException({ message: `${label}: dạng sản phẩm phải từ 1 đến 6.` });
        const milestoneId = item?.milestoneId ? String(item.milestoneId) : null;
        if (milestoneId && !milestoneIds.has(milestoneId)) throw new BadRequestException({ message: `${label}: mốc liên kết không thuộc đề tài.` });
        const requirements = readOptionalText(item?.requirements, `${label}: yêu cầu khoa học`, 4000) || null;
        const id = typeof item?.id === "string" && item.id ? item.id : null;
        if (id) {
          const before = existing.get(id);
          if (!before) throw new BadRequestException({ message: `${label}: không tìm thấy sản phẩm.` });
          if (keep.has(id)) throw new BadRequestException({ message: `${label}: sản phẩm bị lặp.` });
          keep.add(id);
          if (before.status !== "PLANNED" && (before.title !== title || before.productForm !== productForm || (before.requirements ?? null) !== requirements)) throw new BadRequestException({ message: `${label}: sản phẩm đã nộp minh chứng thì không đổi nội dung, dạng hay yêu cầu khoa học.` });
        }
        return { id, position, title, productForm, requirements, milestoneId };
      });
      for (const [id, before] of existing) {
        if (!keep.has(id) && before.status !== "PLANNED") throw new BadRequestException({ message: `Không xoá được sản phẩm "${before.title}" vì đã nộp minh chứng.` });
      }
      const removed = [...existing.keys()].filter((id) => !keep.has(id));
      if (removed.length) await tx.projectProduct.deleteMany({ where: { id: { in: removed }, status: "PLANNED" } });
      for (const row of rows) {
        if (row.id) await tx.projectProduct.update({ where: { id: row.id }, data: { position: row.position, title: row.title, productForm: row.productForm, requirements: row.requirements, milestoneId: row.milestoneId } });
        else await tx.projectProduct.create({ data: { projectId, status: "PLANNED", position: row.position, title: row.title, productForm: row.productForm, requirements: row.requirements, milestoneId: row.milestoneId, createdById: currentActor.id } });
      }
      const now = await readTransactionClockV1(tx);
      await this.record(tx, currentActor, project, "project.product.manage", "Cập nhật danh sách sản phẩm theo thuyết minh", { products: rows.map((row: AnyRecord) => ({ title: row.title, productForm: row.productForm, requirements: row.requirements })), removed: removed.map((id) => ({ id, title: existing.get(id)?.title, productForm: existing.get(id)?.productForm })) }, now);
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Chủ nhiệm nộp minh chứng một sản phẩm (lần đầu hoặc nộp lại sau khi tổ chuyên gia kết luận không đạt). */
  async submitProduct(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.projects.loadAuthorized(tx, currentActor, projectId, project);
      this.assertAllowed(loaded.capability, "project.product.submit");
      const product = this.findProduct(project, input.productId, ["PLANNED", "FAILED", "SUBMITTED"]);
      const evidenceFileIds = readFileIds(input.evidenceFileIds, "Minh chứng sản phẩm");
      if (!evidenceFileIds.length) throw new BadRequestException({ message: "Cần đính kèm ít nhất một tệp minh chứng sản phẩm." });
      await this.assertProjectFiles(tx, projectId, evidenceFileIds, PRODUCT_EVIDENCE_PURPOSE);
      const now = await readTransactionClockV1(tx);
      const submission = { note: readOptionalText(input.note, "Mô tả sản phẩm", 4000), evidenceFileIds, submittedAt: now.toISOString(), submittedById: currentActor.id };
      await tx.projectProduct.update({ where: { id: product.id }, data: { status: "SUBMITTED", submission } });
      await this.record(tx, currentActor, project, "project.product.submit", `Nộp minh chứng sản phẩm: ${product.title}`, { productId: product.id, evidenceFileIds }, now);
      notify({ type: NOTIFICATION_TYPES.productSubmitted, userIds: loaded.officer ? [loaded.officer.officerUserId] : await researchManagersInScope(tx, project.hostOrganizationUnitId), excludeUserIds: [currentActor.id], title: `Sản phẩm chờ nghiệm thu: ${product.title}`, message: `Chủ nhiệm đề tài ${label(project)} đã nộp minh chứng sản phẩm dạng ${product.productForm} "${product.title}". Vui lòng lập tổ chuyên gia nghiệm thu.`, link: projectLink(projectId), metadata: { projectId, productId: product.id } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Chuyên viên lập tổ chuyên gia 3–5 người (đúng một tổ trưởng; không có người tham gia đề tài). */
  async formProductPanel(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.authorizeOperator(tx, currentActor, project, "project.product.review");
      const product = this.findProduct(project, input.productId, ["SUBMITTED"]);
      // Minh chứng phải còn nguyên khi đưa ra tổ chuyên gia (từ đây tệp bị khoá).
      const submittedFiles = Array.isArray(product.submission?.evidenceFileIds) ? product.submission.evidenceFileIds as string[] : [];
      if (!submittedFiles.length) throw new BadRequestException({ message: "Sản phẩm chưa có minh chứng." });
      await this.assertProjectFiles(tx, projectId, submittedFiles, PRODUCT_EVIDENCE_PURPOSE);
      if (!Array.isArray(input.members) || input.members.length < 3 || input.members.length > 5) throw new BadRequestException({ message: "Tổ chuyên gia gồm từ 3 đến 5 người." });
      const requested = input.members.map((item: AnyRecord, index: number) => {
        if (!item || typeof item.profileId !== "string" || !item.profileId.trim()) throw new BadRequestException({ message: `Thành viên #${index + 1} không hợp lệ.` });
        if (!PANEL_ROLES.includes(item.role)) throw new BadRequestException({ message: `Vai trò của thành viên #${index + 1} không hợp lệ.` });
        return { profileId: item.profileId.trim(), role: item.role as string };
      });
      if (new Set(requested.map((item: AnyRecord) => item.profileId)).size !== requested.length) throw new BadRequestException({ message: "Một người không thể có tên hai lần trong tổ chuyên gia." });
      if (requested.filter((item: AnyRecord) => item.role === "LEADER").length !== 1) throw new BadRequestException({ message: "Tổ chuyên gia phải có đúng một tổ trưởng." });
      const members = await this.resolveProfiles(tx, project, requested, "tổ chuyên gia nghiệm thu sản phẩm");
      const now = await readTransactionClockV1(tx);
      const round = ((product.reviews ?? []) as AnyRecord[]).reduce((max, row) => Math.max(max, row.round), 0) + 1;
      const reviewDate = readDay(input.reviewDate, "Ngày nghiệm thu");
      const location = readOptionalText(input.location, "Địa điểm", 300) || null;
      await tx.projectProductReview.create({ data: { productId: product.id, projectId, round, status: "PANEL_FORMED", panelMembers: members, reviewDate, location, submissionSnapshot: product.submission ?? {}, formedById: currentActor.id, formedAt: now } });
      await tx.projectProduct.update({ where: { id: product.id }, data: { status: "UNDER_REVIEW" } });
      await this.record(tx, currentActor, project, "project.product.panel", `Lập tổ chuyên gia nghiệm thu sản phẩm: ${product.title}`, { productId: product.id, round, members: members.map((member) => ({ profileId: member.profileId, role: member.role })) }, now);
      const recipients = this.projects.projectRecipients(project);
      notify({ type: NOTIFICATION_TYPES.productPanelFormed, userIds: recipients.pi, excludeUserIds: [currentActor.id], title: `Đã lập tổ chuyên gia: ${product.title}`, message: `Sản phẩm "${product.title}" của đề tài ${label(project)} sẽ được tổ chuyên gia nghiệm thu${reviewDate ? ` ngày ${vnDate(reviewDate)}` : ""}${location ? ` tại ${location}` : ""}.`, link: projectLink(projectId), metadata: { projectId, productId: product.id } });
      notify({ type: NOTIFICATION_TYPES.reviewInvitation, userIds: members.map((member) => member.userId), excludeUserIds: [currentActor.id], title: `Mời tham gia tổ chuyên gia nghiệm thu sản phẩm`, message: `Bạn có tên trong tổ chuyên gia nghiệm thu sản phẩm "${product.title}" của đề tài ${label(project)}${reviewDate ? `, ngày ${vnDate(reviewDate)}` : ""}${location ? ` tại ${location}` : ""}. Phòng Quản lý khoa học sẽ gửi minh chứng sản phẩm tới tổ chuyên gia.`, metadata: { projectId, productId: product.id } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Chuyên viên ghi kết luận của tổ chuyên gia: đạt, hoặc không đạt (chủ nhiệm hoàn thiện và nộp lại). */
  async recordProductReview(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      await this.authorizeOperator(tx, currentActor, project, "project.product.review");
      const product = this.findProduct(project, input.productId, ["UNDER_REVIEW"]);
      const review = ((product.reviews ?? []) as AnyRecord[]).find((row) => row.status === "PANEL_FORMED");
      if (!review) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Sản phẩm chưa có tổ chuyên gia." });
      if (input.result !== "PASSED" && input.result !== "FAILED") throw new BadRequestException({ message: "Kết luận phải là đạt (PASSED) hoặc không đạt (FAILED)." });
      const conclusion = input.result === "FAILED" ? readRequiredText(input.conclusion, "Ý kiến của tổ chuyên gia (lý do không đạt)", 4000) : readOptionalText(input.conclusion, "Ý kiến của tổ chuyên gia", 4000) || null;
      const minutesFileIds = readFileIds(input.minutesFileIds, "Biên bản tổ chuyên gia");
      if (!minutesFileIds.length) throw new BadRequestException({ message: "Cần đính kèm biên bản nghiệm thu của tổ chuyên gia." });
      await this.assertProjectFiles(tx, projectId, minutesFileIds, PRODUCT_REVIEW_MINUTES_PURPOSE);
      const reviewDate = readDay(input.reviewDate, "Ngày nghiệm thu") ?? review.reviewDate ?? null;
      if (!reviewDate) throw new BadRequestException({ message: "Ngày nghiệm thu là bắt buộc." });
      const now = await readTransactionClockV1(tx);
      await tx.projectProductReview.update({ where: { id: review.id }, data: { status: "CONCLUDED", result: input.result, conclusion, minutesFileIds, reviewDate, recordedById: currentActor.id, concludedAt: now } });
      await tx.projectProduct.update({ where: { id: product.id }, data: { status: input.result } });
      await this.record(tx, currentActor, project, "project.product.review", `Tổ chuyên gia kết luận sản phẩm "${product.title}": ${input.result === "PASSED" ? "đạt" : "không đạt"}`, { productId: product.id, round: review.round, result: input.result }, now);
      const remaining = ((project.products ?? []) as AnyRecord[]).filter((item) => item.id !== product.id && item.status !== "PASSED").length;
      notify({ type: NOTIFICATION_TYPES.productResult, userIds: this.projects.projectRecipients(project).pi, excludeUserIds: [currentActor.id], title: `Kết quả nghiệm thu sản phẩm: ${product.title}`, message: input.result === "PASSED" ? `Sản phẩm "${product.title}" của đề tài ${label(project)} đạt.${remaining === 0 ? " Tất cả sản phẩm đã đạt — chủ nhiệm có thể nộp hồ sơ nghiệm thu cơ sở." : ` Còn ${remaining} sản phẩm chưa đạt.`}` : `Sản phẩm "${product.title}" của đề tài ${label(project)} không đạt: ${conclusion}. Chủ nhiệm hoàn thiện và nộp lại minh chứng.`, link: projectLink(projectId), metadata: { projectId, productId: product.id, result: input.result } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  // ---- Bước 3: đề nghị cấp trên nghiệm thu (cấp Bộ / Nhà nước) ------------------------------------

  /** Chuyên viên cập nhật danh mục hồ sơ cấp trên yêu cầu (tự đặt tên từng mục) và thông tin công văn đề nghị. */
  async saveSuperiorDossier(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project) => {
      await this.authorizeOperator(tx, currentActor, project, "project.superior.prepare");
      const checklist = this.readChecklist(input.checklist);
      for (const item of checklist) await this.assertProjectFiles(tx, projectId, item.fileIds, SUPERIOR_DOSSIER_PURPOSE);
      const letterFileIds = readFileIds(input.letterFileIds, "Công văn đề nghị");
      await this.assertProjectFiles(tx, projectId, letterFileIds, SUPERIOR_DOSSIER_PURPOSE);
      const letterNumber = typeof input.letterNumber === "string" && input.letterNumber.trim() ? readRequiredText(input.letterNumber, "Số công văn", 100) : null;
      const data = { checklist, letterNumber, letterDate: readDay(input.letterDate, "Ngày công văn"), recipient: readOptionalText(input.recipient, "Nơi nhận", 500) || null, letterFileIds };
      await tx.projectSuperiorAcceptance.update({ where: { projectId }, data });
      const now = await readTransactionClockV1(tx);
      await this.record(tx, currentActor, project, "project.superior.prepare", "Cập nhật hồ sơ đề nghị cấp trên nghiệm thu", { items: checklist.length, done: checklist.filter((item) => item.done).length, letterNumber }, now);
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Gửi công văn đề nghị: đủ số, ngày, tệp công văn và mọi mục hồ sơ đã hoàn thành. */
  async sendSuperiorRequest(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.superior.send");
      const superior = project.superiorAcceptance as AnyRecord;
      const checklist = Array.isArray(superior.checklist) ? superior.checklist as AnyRecord[] : [];
      if (!checklist.length) throw new BadRequestException({ code: "SUPERIOR_NOT_READY", message: "Chưa có danh mục hồ sơ theo yêu cầu của cấp trên." });
      const missing = checklist.filter((item) => !item.done || !Array.isArray(item.fileIds) || !item.fileIds.length);
      if (missing.length) throw new BadRequestException({ code: "SUPERIOR_NOT_READY", message: `Còn ${missing.length} mục hồ sơ chưa hoàn thành hoặc chưa có tệp: ${missing.slice(0, 3).map((item) => item.title).join("; ")}.` });
      if (!superior.letterNumber || !superior.letterDate || !Array.isArray(superior.letterFileIds) || !superior.letterFileIds.length) throw new BadRequestException({ code: "SUPERIOR_NOT_READY", message: "Cần số, ngày và tệp công văn đề nghị nghiệm thu." });
      await this.assertProjectFiles(tx, projectId, [...superior.letterFileIds, ...checklist.flatMap((item) => item.fileIds)], SUPERIOR_DOSSIER_PURPOSE);
      const now = await readTransactionClockV1(tx);
      await tx.projectSuperiorAcceptance.update({ where: { projectId }, data: { status: SUPERIOR_STATUSES.sent, sentAt: now, sentById: currentActor.id } });
      const late = localDay(now) > (superior.dueDate as Date).toISOString().slice(0, 10);
      await this.record(tx, currentActor, project, "project.superior.send", `Gửi công văn số ${superior.letterNumber} đề nghị cấp trên nghiệm thu${late ? " (quá hạn 30 ngày)" : ""}`, { letterNumber: superior.letterNumber, dueDate: superior.dueDate, late }, now);
      const recipients = this.projects.projectRecipients(project, loaded.officer);
      notify({ type: NOTIFICATION_TYPES.superiorRequestSent, userIds: [...recipients.pi, ...(await leadershipUserIds(tx))], excludeUserIds: [currentActor.id], title: `Đã gửi đề nghị cấp trên nghiệm thu: ${project.title}`, message: `Học viện đã gửi công văn số ${superior.letterNumber} đề nghị ${superior.recipient ?? "cấp trên"} nghiệm thu đề tài ${label(project)}.`, link: projectLink(projectId), metadata: { projectId } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Ghi kết quả nghiệm thu của cấp trên: đạt → đã nghiệm thu; không đạt → không đạt. */
  async recordSuperiorResult(actor: SafeUserContext, projectId: string, input: AnyRecord) {
    return this.projects.mutate(actor, projectId, input.contextVersion, async (tx, currentActor, project, notify) => {
      const loaded = await this.authorizeOperator(tx, currentActor, project, "project.superior.result");
      if (input.result !== "PASSED" && input.result !== "FAILED") throw new BadRequestException({ message: "Kết quả phải là đạt (PASSED) hoặc không đạt (FAILED)." });
      const resultFileIds = readFileIds(input.resultFileIds, "Quyết định / biên bản của cấp trên");
      if (!resultFileIds.length) throw new BadRequestException({ message: "Cần đính kèm quyết định hoặc biên bản nghiệm thu của cấp trên." });
      await this.assertProjectFiles(tx, projectId, resultFileIds, SUPERIOR_DOSSIER_PURPOSE);
      const resultDate = readDay(input.resultDate, "Ngày quyết định của cấp trên", true);
      const now = await readTransactionClockV1(tx);
      await tx.projectSuperiorAcceptance.update({ where: { projectId }, data: {
        status: input.result, result: input.result, resultDecisionNumber: readOptionalText(input.decisionNumber, "Số quyết định", 100) || null, resultDate,
        resultNote: readOptionalText(input.note, "Ghi chú", 4000) || null, resultFileIds, resultRecordedById: currentActor.id, resultRecordedAt: now
      } });
      const passed = input.result === "PASSED";
      await this.transition(tx, currentActor, project, passed ? PROJECT_STATUSES.accepted : PROJECT_STATUSES.failed, "project.superior.result", passed ? "Cấp trên nghiệm thu: đạt" : "Cấp trên nghiệm thu: không đạt", { result: input.result }, now);
      const recipients = this.projects.projectRecipients(project, loaded.officer);
      notify({ type: NOTIFICATION_TYPES.acceptanceResult, userIds: [...recipients.team, ...(await leadershipUserIds(tx))], excludeUserIds: [currentActor.id], title: `Kết quả nghiệm thu cấp trên: ${project.title}`, message: `Cấp trên kết luận đề tài ${label(project)} ${passed ? "ĐẠT" : "KHÔNG ĐẠT"}.${passed ? " Chuyên viên phụ trách tiến hành thanh lý." : ""}`, link: projectLink(projectId), metadata: { projectId, result: input.result } });
      return this.reload(tx, currentActor, projectId);
    });
  }

  /** Đề tài cấp Bộ / Nhà nước phải được cấp trên nghiệm thu sau nghiệm thu cơ sở. */
  needsSuperior(project: AnyRecord) {
    return SUPERIOR_ACCEPTANCE_LEVELS.includes(String((project.scopeSnapshot as AnyRecord | null)?.proposalTypeCode ?? ""));
  }

  /**
   * Nghiệm thu cơ sở đạt. Đề tài cấp Học viện: đã nghiệm thu. Cấp Bộ / Nhà nước: chờ cấp trên, hạn gửi đề nghị
   * 30 ngày kể từ ngày nghiệm thu cơ sở xong.
   */
  private async concludeFacilityAcceptance(tx: any, actor: SafeUserContext, project: AnyRecord, acceptanceId: string, acceptedOn: Date, action: string, reason: string, facts: AnyRecord, now: Date, notify: NotifyFn) {
    if (!this.needsSuperior(project)) {
      await this.transition(tx, actor, project, PROJECT_STATUSES.accepted, action, reason, facts, now);
      return;
    }
    const facilityAcceptedOn = new Date(`${(acceptedOn instanceof Date ? (acceptedOn.getUTCHours() === 0 && acceptedOn.getUTCMinutes() === 0 ? acceptedOn.toISOString().slice(0, 10) : localDay(acceptedOn)) : String(acceptedOn).slice(0, 10))}T00:00:00.000Z`);
    const dueDate = new Date(facilityAcceptedOn.getTime() + SUPERIOR_DEADLINE_DAYS * 86_400_000);
    const level = String((project.scopeSnapshot as AnyRecord).proposalTypeCode);
    await tx.projectSuperiorAcceptance.upsert({ where: { projectId: project.id }, create: { projectId: project.id, level, acceptanceId, facilityAcceptedOn, dueDate, status: SUPERIOR_STATUSES.preparing }, update: { level, acceptanceId, facilityAcceptedOn, dueDate, status: SUPERIOR_STATUSES.preparing } });
    await this.transition(tx, actor, project, PROJECT_STATUSES.pendingSuperiorAcceptance, action, `${reason}; chờ đề nghị cấp trên nghiệm thu (hạn ${vnDate(dueDate)})`, { ...facts, facilityAcceptedOn: facilityAcceptedOn.toISOString().slice(0, 10), superiorDueDate: dueDate.toISOString().slice(0, 10) }, now);
    const officer = await this.projects.currentOfficer(tx, project.id);
    notify({ type: NOTIFICATION_TYPES.superiorRequestDue, userIds: [...(officer ? [officer.officerUserId] : []), ...(await leadershipUserIds(tx))], excludeUserIds: [actor.id], title: `Cần đề nghị cấp trên nghiệm thu: ${project.title}`, message: `Đề tài ${label(project)} (${level === "national-level" ? "cấp Nhà nước" : "cấp Bộ"}) đã nghiệm thu cơ sở ngày ${vnDate(facilityAcceptedOn)}. Học viện phải gửi công văn đề nghị nghiệm thu và hoàn thành hồ sơ cấp trên yêu cầu trước ${vnDate(dueDate)}.`, link: projectLink(project.id), metadata: { projectId: project.id, dueDate: dueDate.toISOString().slice(0, 10) } });
  }

  private readChecklist(value: unknown) {
    if (!Array.isArray(value) || value.length > 100) throw new BadRequestException({ message: "Danh mục hồ sơ không hợp lệ (tối đa 100 mục)." });
    const ids = new Set<string>();
    return value.map((item: AnyRecord, index: number) => {
      const id = typeof item?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item.id) ? item.id : `item-${index + 1}-${Date.now().toString(36)}`;
      if (ids.has(id)) throw new BadRequestException({ message: `Mục hồ sơ #${index + 1} bị trùng mã.` });
      ids.add(id);
      return {
        id,
        title: readRequiredText(item?.title, `Mục hồ sơ #${index + 1}: tên đề mục`, 500),
        done: item?.done === true,
        fileIds: readFileIds(item?.fileIds, `Mục hồ sơ #${index + 1}: tệp`),
        note: readOptionalText(item?.note, `Mục hồ sơ #${index + 1}: ghi chú`, 2000) || null
      };
    });
  }

  private findProduct(project: AnyRecord, productId: unknown, allowed: string[]) {
    const product = ((project.products ?? []) as AnyRecord[]).find((item) => item.id === productId);
    if (!product) throw new BadRequestException({ message: "Không tìm thấy sản phẩm của đề tài." });
    if (!allowed.includes(product.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Sản phẩm không ở bước cho phép thao tác này." });
    return product;
  }

  // ---- Hỗ trợ -------------------------------------------------------------------------------------

  private assertAllowed(capability: AnyRecord, action: string) {
    if (capability.allowedActions?.includes(action)) return;
    const denial = capability.blockedActions?.find((item: AnyRecord) => item.action === action);
    if (denial?.code === "WORKFLOW_STATE_DENIED") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: denial.reason ?? "Thao tác không phù hợp với trạng thái hiện tại của đề tài." });
    throw new ForbiddenException({ code: denial?.code ?? "ACTION_NOT_GRANTED", message: denial?.reason ?? "Bạn không có quyền thực hiện thao tác này." });
  }

  /** Thao tác của chuyên viên phụ trách: capability + kiểm tra lại phân công, xung đột lợi ích trong giao dịch. */
  private async authorizeOperator(tx: any, actor: SafeUserContext, project: AnyRecord, action: string) {
    const loaded = await this.projects.loadAuthorized(tx, actor, project.id, project);
    this.assertAllowed(loaded.capability, action);
    await this.projects.assertOfficer(tx, actor, project);
    return loaded;
  }

  private currentRound(project: AnyRecord, allowed: string[]) {
    const round = closureFacts(project).latestAcceptance;
    if (!round || !allowed.includes(round.status)) throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Vòng nghiệm thu không ở bước cho phép thao tác này." });
    return round;
  }

  private approvedBudget(project: AnyRecord, finance: AnyRecord | null) {
    return readApprovedBudget(project.proposal?.budgetMetadata) || readApprovedBudget((project.scopeSnapshot as AnyRecord | null)?.budgetMetadata) || money(finance?.totalBudget);
  }

  private async readDossier(tx: any, projectId: string, input: AnyRecord, initial: boolean) {
    const evidenceFileIds = readFileIds(input.evidenceFileIds, "Tệp hồ sơ nghiệm thu");
    if (!evidenceFileIds.length) throw new BadRequestException({ message: "Cần đính kèm ít nhất một tệp (báo cáo tổng kết hoặc bản hoàn thiện)." });
    await this.assertProjectFiles(tx, projectId, evidenceFileIds, ACCEPTANCE_DOSSIER_PURPOSE);
    return {
      finalReportSummary: readRequiredText(input.finalReportSummary, initial ? "Tóm tắt báo cáo tổng kết" : "Nội dung đã hoàn thiện", 8000),
      products: readOptionalText(input.products, "Sản phẩm khoa học, đào tạo", 4000),
      selfAssessment: readOptionalText(input.selfAssessment, "Tự đánh giá", 4000),
      evidenceFileIds
    };
  }

  /** Tệp phải thuộc chính đề tài, còn hoạt động và đúng loại (hồ sơ nghiệm thu / biên bản thanh lý): tệp đã gắn sẽ bị khoá vĩnh viễn. */
  private async assertProjectFiles(tx: any, projectId: string, fileIds: string[], filePurpose: string) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) return;
    const files = await tx.fileRecord.findMany({ where: { id: { in: ids }, relatedEntityType: "approved_project", relatedEntityId: projectId, filePurpose, status: "active", deletedAt: null }, select: { id: true } });
    if (files.length !== ids.length) throw new BadRequestException({ code: "EVIDENCE_INVALID", message: "Có tệp không thuộc đề tài này, không đúng loại tệp hoặc đã bị xoá." });
  }

  /** Thành viên hội đồng lấy từ hồ sơ nhà khoa học; chủ nhiệm và thành viên đề tài (kể cả đã kết thúc) không được tham gia. */
  private async resolveCouncilMembers(tx: any, project: AnyRecord, requested: AcceptanceMemberInput[]) {
    return this.resolveProfiles(tx, project, requested, "hội đồng nghiệm thu") as Promise<Array<{ profileId: string; fullName: string; academicTitle?: string; unit?: string; userId?: string; role: AcceptanceMemberInput["role"] }>>;
  }

  private async resolveProfiles(tx: any, project: AnyRecord, requested: Array<{ profileId: string; role: string }>, body: string) {
    const profiles = (await tx.researcherProfile.findMany({ where: { id: { in: requested.map((member) => member.profileId) } }, select: { id: true, fullName: true, title: true, status: true, linkedUserId: true, managementOrganizationUnit: { select: { name: true } } } })) as AnyRecord[];
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    const teamUserIds = new Set((project.members ?? []).map((member: AnyRecord) => member.userId).filter(Boolean));
    return requested.map((member) => {
      const profile = byId.get(member.profileId);
      if (!profile || profile.status !== "ACTIVE") throw new BadRequestException({ code: "ACCEPTANCE_INVALID", message: `Có thành viên ${body} không tồn tại hoặc hồ sơ đã ngừng hoạt động.` });
      if (profile.linkedUserId && teamUserIds.has(profile.linkedUserId)) throw new ForbiddenException({ code: "CONFLICT_DENIED", message: `${profile.fullName} là chủ nhiệm hoặc thành viên đề tài nên không thể tham gia ${body}.` });
      return { profileId: profile.id as string, fullName: profile.fullName as string, academicTitle: (profile.title ?? undefined) as string | undefined, unit: (profile.managementOrganizationUnit?.name ?? undefined) as string | undefined, userId: (profile.linkedUserId ?? undefined) as string | undefined, role: member.role };
    });
  }

  private async acceptanceNumberTaken(tx: any, number: string, acceptanceId: string, proposalId: string) {
    if (await tx.projectAcceptance.findFirst({ where: { decisionNumber: number, NOT: { id: acceptanceId } }, select: { id: true } })) return true;
    // Số đã cấp theo luồng cũ (trên đề xuất chưa có đề tài) vẫn được giữ chỗ.
    const legacy = await tx.$queryRaw`SELECT id FROM research_proposals WHERE id <> ${proposalId} AND acceptance_council_metadata->>'decisionNumber' = ${number} LIMIT 1`;
    return Array.isArray(legacy) && legacy.length > 0;
  }

  /** Số văn bản: dùng số người dùng nhập (kiểm tra trùng) hoặc cấp số kế tiếp theo năm. */
  private async documentNumber(tx: any, kind: { scope: string; format: (year: number, sequence: string) => string; takenMessage: string }, requested: string, date: Date, isTaken: (number: string) => Promise<boolean>) {
    if (requested) {
      if (await isTaken(requested)) throw new ConflictException({ code: "DOCUMENT_NUMBER_TAKEN", message: kind.takenMessage });
      return requested;
    }
    const year = date.getUTCFullYear();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [row] = await tx.$queryRaw`
        INSERT INTO document_number_counters (scope, year, last_value) VALUES (${kind.scope}, ${year}, 1)
        ON CONFLICT (scope, year) DO UPDATE SET last_value = document_number_counters.last_value + 1
        RETURNING last_value AS value`;
      const candidate = kind.format(year, String(row.value).padStart(3, "0"));
      if (!(await isTaken(candidate))) return candidate;
    }
    throw new ConflictException({ code: "DOCUMENT_NUMBER_TAKEN", message: kind.takenMessage });
  }

  private async transition(tx: any, actor: SafeUserContext, project: AnyRecord, toStatus: string, action: string, reason: string, facts: AnyRecord, now: Date) {
    await tx.approvedProject.update({ where: { id: project.id }, data: { status: toStatus, aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
    await tx.projectHistory.create({ data: { projectId: project.id, actorId: actor.id, action, fromStatus: project.status, toStatus, reason, beforeFacts: { status: project.status }, afterFacts: { status: toStatus, ...facts }, createdAt: now } });
    await new AuditLogService(tx).record({ action, result: "success", actorId: actor.id, targetEntity: "approved-project", targetEntityId: project.id, username: actor.username, reason, beforeFacts: { status: project.status }, afterFacts: { status: toStatus, ...facts } });
  }

  /** Bước nghiệp vụ không đổi trạng thái đề tài: vẫn tăng aggregateVersion để giao diện cũ phải tải lại. */
  private async record(tx: any, actor: SafeUserContext, project: AnyRecord, action: string, reason: string, facts: AnyRecord, now: Date) {
    await tx.approvedProject.update({ where: { id: project.id }, data: { aggregateVersion: { increment: 1 }, authorizationContextUpdatedAt: now } });
    await tx.projectHistory.create({ data: { projectId: project.id, actorId: actor.id, action, reason, afterFacts: facts, createdAt: now } });
    await new AuditLogService(tx).record({ action, result: "success", actorId: actor.id, targetEntity: "approved-project", targetEntityId: project.id, username: actor.username, reason, afterFacts: facts });
  }

  private async reload(tx: any, actor: SafeUserContext, projectId: string) {
    const loaded = await this.projects.loadAuthorized(tx, actor, projectId);
    return this.projects.toProjectResponse(loaded.project, loaded.capability, loaded.officer, actor);
  }
}

/** Ngày lịch Việt Nam (YYYY-MM-DD) của một thời điểm. */
function localDay(value: Date) {
  return new Date(value.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
