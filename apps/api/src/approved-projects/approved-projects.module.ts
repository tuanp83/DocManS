import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ApprovedProjectsController } from "./approved-projects.controller.js";
import { ApprovedProjectsService } from "./approved-projects.service.js";
import { ProjectClosureService } from "./project-closure.service.js";
import { WorkQueueController } from "./work-queue.controller.js";
import { WorkQueueService } from "./work-queue.service.js";

@Module({ imports: [AuthModule, NotificationsModule], controllers: [ApprovedProjectsController, WorkQueueController], providers: [ApprovedProjectsService, ProjectClosureService, WorkQueueService, AuditLogService, PrismaService], exports: [ApprovedProjectsService, ProjectClosureService, WorkQueueService] })
export class ApprovedProjectsModule {}
