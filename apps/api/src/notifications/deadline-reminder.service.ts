import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { collectProjectReminders, collectProposalSupplementReminders, collectSuperiorReminders, type ReminderProject } from "./deadline-reminders.js";
import { NotificationsService } from "./notifications.service.js";
import { leadershipUserIds, researchManagersInScope, type WorkflowEvent } from "./workflow-events.js";

/**
 * Nhắc hạn báo cáo / hạn bổ sung hằng ngày lúc 07:00 giờ Việt Nam. Chống gửi trùng bằng dedupKey nên chạy
 * lại (khởi động lại máy chủ, nhiều bản API) không làm người dùng nhận thông báo lặp.
 */
@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  @Cron("0 7 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async handleCron() {
    if (process.env.DEADLINE_REMINDERS_ENABLED === "false") return;
    try {
      const sent = await this.run(new Date());
      this.logger.log(`Nhắc hạn: đã tạo ${sent} thông báo.`);
    } catch (error) {
      this.logger.error(`Nhắc hạn thất bại: ${(error as Error)?.message ?? error}`);
    }
  }

  async run(now: Date): Promise<number> {
    const events: WorkflowEvent[] = [];
    const prisma = this.prisma as any;
    const projects = await prisma.approvedProject.findMany({
      where: { status: { in: ["executing", "paused"] } },
      select: {
        id: true, code: true, title: true, status: true, endDate: true,
        members: { where: { participationRole: "TOPIC_PI", status: "ACTIVE" }, select: { userId: true, effectiveFrom: true, effectiveUntil: true } },
        managementOfficers: { where: { status: "ACTIVE" }, select: { officerUserId: true, effectiveFrom: true, effectiveUntil: true } },
        checkpoints: { where: { status: "open" }, select: { id: true, title: true, dueDate: true, status: true } },
        reports: { select: { id: true, checkpointId: true, status: true, revision: true, responseDeadline: true } },
        requests: { where: { status: "supplement_requested" }, select: { id: true, requestType: true, status: true, responseDeadline: true } }
      }
    });
    const active = (row: { effectiveFrom: Date; effectiveUntil: Date | null }) => row.effectiveFrom <= now && (!row.effectiveUntil || now < row.effectiveUntil);
    for (const project of projects) {
      const reminder: ReminderProject = {
        ...project,
        piUserId: project.members.find(active)?.userId ?? null,
        officerUserId: project.managementOfficers.find(active)?.officerUserId ?? null
      };
      events.push(...collectProjectReminders(reminder, now));
    }

    const supplements = await prisma.proposalSupplementRequest.findMany({
      where: { status: "open" },
      select: { id: true, proposalId: true, dueDate: true, proposal: { select: { code: true, title: true, ownerId: true, status: true } } }
    });
    for (const request of supplements) events.push(...collectProposalSupplementReminders(request, now));

    const superiors = await prisma.projectSuperiorAcceptance.findMany({
      where: { status: "PREPARING" },
      select: {
        projectId: true, level: true, dueDate: true, facilityAcceptedOn: true, status: true,
        project: { select: { code: true, title: true, hostOrganizationUnitId: true, managementOfficers: { where: { status: "ACTIVE" }, select: { officerUserId: true, effectiveFrom: true, effectiveUntil: true } } } }
      }
    });
    if (superiors.length) {
      const leaders = await leadershipUserIds(prisma);
      for (const row of superiors) {
        const officerUserId = row.project.managementOfficers.find(active)?.officerUserId ?? null;
        // Chưa có chuyên viên phụ trách: nhắc cán bộ QLKH có phạm vi đơn vị chủ trì.
        const fallback = officerUserId ? [] : await researchManagersInScope(prisma, row.project.hostOrganizationUnitId);
        for (const event of collectSuperiorReminders({ projectId: row.projectId, code: row.project.code, title: row.project.title, level: row.level, dueDate: row.dueDate, facilityAcceptedOn: row.facilityAcceptedOn, status: row.status, officerUserId, leadershipUserIds: leaders }, now)) {
          events.push({ ...event, userIds: [...event.userIds, ...fallback] });
        }
      }
    }

    return this.notifications.dispatch(events);
  }
}
