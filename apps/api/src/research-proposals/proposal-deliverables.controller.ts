import { Controller, Get, Post, Body, Param, UseGuards, Req } from "@nestjs/common";
import { ProposalDeliverablesService } from "./proposal-deliverables.service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";

@Controller("api/v1/proposals/:proposalId/deliverables")
@UseGuards(SessionAuthGuard)
export class ProposalDeliverablesController {
  constructor(private readonly deliverablesService: ProposalDeliverablesService) {}

  @Get()
  async getDeliverables(
    @Req() request: RequestWithCurrentUser,
    @Param("proposalId") proposalId: string
  ) {
    return this.deliverablesService.getDeliverables(proposalId, request.currentUser!);
  }

  @Post()
  async createDeliverable(
    @Req() request: RequestWithCurrentUser,
    @Param("proposalId") proposalId: string,
    @Body() body: { type: string; title: string; description?: string; proofFileName?: string; proofStorageKey?: string; publishedAt?: string }
  ) {
    return this.deliverablesService.createDeliverable(proposalId, body, request.currentUser!);
  }
}
