import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardExportService } from "./dashboard-export.service.js";

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardExportService, PrismaService],
  exports: [DashboardService, DashboardExportService]
})
export class DashboardModule {}
