import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { ApprovalRoutingService } from "./approval-routing.service.js";

function body(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Hồ sơ trình qua Phòng KHQS: hàng chờ, trình/duyệt, trả lại, lịch sử theo đối tượng. */
@Controller("api/v1/approval-submissions")
@UseGuards(SessionAuthGuard)
export class ApprovalRoutingController {
  constructor(private readonly routing: ApprovalRoutingService) {}

  @Get("inbox")
  async inbox(@Req() request: RequestWithCurrentUser) {
    return this.routing.inbox(request.currentUser!);
  }

  @Get("pending")
  async pending(@Req() request: RequestWithCurrentUser, @Query("subjectType") subjectType: string) {
    return this.routing.pending(request.currentUser!, subjectType);
  }

  @Get("subject")
  async forSubject(@Req() request: RequestWithCurrentUser, @Query("type") type: string, @Query("id") id: string) {
    return this.routing.forSubject(request.currentUser!, type, id);
  }

  @Post(":id/advance")
  async advance(@Req() request: RequestWithCurrentUser, @Param("id") id: string, @Body() payload: unknown) {
    return { submission: await this.routing.advance(request.currentUser!, id, body(payload)) };
  }

  @Post(":id/return")
  async returnToStaff(@Req() request: RequestWithCurrentUser, @Param("id") id: string, @Body() payload: unknown) {
    return { submission: await this.routing.returnToStaff(request.currentUser!, id, body(payload)) };
  }
}
