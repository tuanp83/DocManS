import { Controller, Get, Query, UseGuards, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { DashboardService } from "./dashboard.service.js";
import { DashboardExportService } from "./dashboard-export.service.js";
import { DashboardAnalyticsService } from "./dashboard-analytics.service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";

@Controller("api/v1/dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly exportService: DashboardExportService,
    private readonly analytics: DashboardAnalyticsService
  ) {}

  @Get("stats")
  async getStats(@Req() request: RequestWithCurrentUser) {
    return this.dashboardService.getStats(request.currentUser);
  }

  /** Chuỗi theo tuần từ ảnh chụp sức khoẻ đề tài (+ điểm hiện tại). ?from=&to=&unitId=&level=&field= */
  @Get("trends")
  async getTrends(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>) {
    return this.analytics.trends(request.currentUser, query);
  }

  /** Phân bố theo đơn vị / cấp / lĩnh vực / trạng thái (/ sức khoẻ). ?subject=projects|proposals&unitId=&level=&field=&year=&status= */
  @Get("distribution")
  async getDistribution(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>) {
    return this.analytics.distribution(request.currentUser, query);
  }

  /** Sản phẩm đề tài theo dạng 1–6 và trạng thái; sản phẩm đầu ra của hồ sơ theo loại. */
  @Get("products")
  async getProducts(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>) {
    return this.analytics.products(request.currentUser, query);
  }

  /** Danh sách chi tiết sau một con số: ?metric=projects|proposals|products|deliverables + bộ lọc theo metric. */
  @Get("drill-down")
  async getDrillDown(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>) {
    return this.analytics.drillDown(request.currentUser, query);
  }

  /** Toàn bộ danh sách chi tiết (mọi trang) ra Excel: cùng tham số với drill-down, không có page / pageSize. */
  @Get("drill-down/export")
  async exportDrillDown(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>, @Res() res: Response) {
    const { buffer, fileName } = await this.exportService.exportDrillDownToExcel(request.currentUser, query);
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  }

  @Get("export-proposals")
  async exportProposals(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>, @Res() res: Response) {
    const buffer = await this.exportService.exportProposalsToExcel(request.currentUser, query);
    res.setHeader("Content-Disposition", "attachment; filename=Danh_sach_de_tai.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  }
}
