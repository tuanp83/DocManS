import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ResearchProposalsModule } from "../research-proposals/research-proposals.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardExportService } from "./dashboard-export.service.js";
import { DashboardAnalyticsService } from "./dashboard-analytics.service.js";
import { ProjectHealthSnapshotService } from "./project-health-snapshot.service.js";
import { ApprovedProjectsModule } from "../approved-projects/approved-projects.module.js";

@Module({
  imports: [AuthModule, ResearchProposalsModule, ApprovedProjectsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardExportService, DashboardAnalyticsService, ProjectHealthSnapshotService, AuditLogService, PrismaService],
  exports: [DashboardService, DashboardExportService, DashboardAnalyticsService]
})
export class DashboardModule {}
