import { Injectable } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ApprovedProjectsService } from "./approved-projects.service.js";
import { projectWorkItems, reviewWorkItems, sortWorkItems, summarizeWorkItems } from "./work-queue-items.js";

@Injectable()
export class WorkQueueService {
  constructor(private readonly prisma: PrismaService, private readonly projects: ApprovedProjectsService) {}

  /** Mọi việc đang chờ người dùng: chỉ dựa trên đề tài họ được xem và phiếu phản biện giao cho chính họ. */
  async forUser(actor: SafeUserContext, today = new Date()) {
    const projects = await this.projects.listProjects(actor, { skipUnresolved: true });
    const assignments = await (this.prisma as any).proposalReviewAssignment.findMany({
      where: { reviewerUserId: actor.id, status: "assigned", revokedAt: null, completedAt: null, effectiveFrom: { lte: today }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: today } }] },
      include: { proposal: { select: { id: true, title: true } }, review: { select: { status: true } } },
      orderBy: { dueDate: "asc" }
    });
    const items = sortWorkItems([...projects.flatMap((project: Record<string, any>) => projectWorkItems(project, actor, today)), ...reviewWorkItems(assignments, today)]);
    return { items, summary: summarizeWorkItems(items), asOf: today.toISOString() };
  }
}
