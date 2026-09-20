import { Controller, Get, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";

@Controller("api/v1/dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("stats")
  async getStats() {
    return this.dashboardService.getStats();
  }
}
