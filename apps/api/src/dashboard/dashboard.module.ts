import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ResearchProposalsModule } from "../research-proposals/research-proposals.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardExportService } from "./dashboard-export.service.js";

@Module({
  imports: [AuthModule, ResearchProposalsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardExportService, AuditLogService, PrismaService],
  exports: [DashboardService, DashboardExportService]
})
export class DashboardModule {}
