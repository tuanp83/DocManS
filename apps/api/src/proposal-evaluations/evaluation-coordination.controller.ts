import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { EvaluationCoordinationService } from "./evaluation-coordination.service.js";
import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { MAX_PORTFOLIO_RULES } from "./evaluation-coordination.service.js";

/** Mảng phụ trách của chuyên viên: thay toàn bộ danh sách; từng quy tắc được kiểm tra chặt ở service. */
const portfolioPipe: PipeTransform<unknown, { rules: unknown[] }> = {
  transform(value: unknown) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (!input || !Array.isArray(input.rules) || input.rules.length > MAX_PORTFOLIO_RULES) {
      throw new BadRequestException({ message: `Danh sách mảng không hợp lệ (tối đa ${MAX_PORTFOLIO_RULES}).` });
    }
    return { rules: input.rules };
  }
};

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
  async setPortfolio(@Req() request: RequestWithCurrentUser, @Param("officerUserId") officerUserId: string, @Body(portfolioPipe) body: { rules: unknown[] }) {
    return this.coordination.setPortfolio(request.currentUser!, officerUserId, body);
  }

  @Post("auto-assign")
  async autoAssign(@Req() request: RequestWithCurrentUser) {
    return this.coordination.autoAssignUnassigned(request.currentUser!);
  }
}
