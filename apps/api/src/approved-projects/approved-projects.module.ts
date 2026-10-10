import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ApprovedProjectsController } from "./approved-projects.controller.js";
import { ApprovedProjectsService } from "./approved-projects.service.js";
import { WorkQueueController } from "./work-queue.controller.js";
import { WorkQueueService } from "./work-queue.service.js";

@Module({ imports: [AuthModule], controllers: [ApprovedProjectsController, WorkQueueController], providers: [ApprovedProjectsService, WorkQueueService, AuditLogService, PrismaService], exports: [ApprovedProjectsService, WorkQueueService] })
export class ApprovedProjectsModule {}
