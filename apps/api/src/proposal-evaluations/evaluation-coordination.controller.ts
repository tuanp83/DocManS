import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { EvaluationCoordinationService } from "./evaluation-coordination.service.js";

/** Trang điều phối đánh giá: tổng quan hồ sơ và phân công chuyên viên theo mảng đề tài. */
@Controller("api/v1/evaluation-coordination")
@UseGuards(SessionAuthGuard)
export class EvaluationCoordinationController {
  constructor(private readonly coordination: EvaluationCoordinationService) {}

  @Get("overview")
  async overview(@Req() request: RequestWithCurrentUser) {
    return this.coordination.overview(request.currentUser!);
  }

  @Get("portfolios")
  async listPortfolios(@Req() request: RequestWithCurrentUser) {
    return this.coordination.listPortfolios(request.currentUser!);
  }

  @Put("portfolios/:officerUserId")
  async setPortfolio(@Req() request: RequestWithCurrentUser, @Param("officerUserId") officerUserId: string, @Body() body: unknown) {
    const input = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    return this.coordination.setPortfolio(request.currentUser!, officerUserId, input);
  }

  @Post("auto-assign")
  async autoAssign(@Req() request: RequestWithCurrentUser) {
    return this.coordination.autoAssignUnassigned(request.currentUser!);
  }
}
