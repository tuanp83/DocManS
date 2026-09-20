import { Controller, Get, UseGuards, Res } from "@nestjs/common";
import type { Response } from "express";
import { DashboardService } from "./dashboard.service.js";
import { DashboardExportService } from "./dashboard-export.service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";

@Controller("api/v1/dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: DashboardExportService
  ) {}

  @Get("stats")
  async getStats() {
    return this.dashboardService.getStats();
  }

  @Get("export-proposals")
  async exportProposals(@Res() res: Response) {
    const buffer = await this.exportService.exportProposalsToExcel();
    res.setHeader("Content-Disposition", "attachment; filename=Danh_sach_de_tai.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  }
}
