import { Controller, Get, Post, Body, Param, UseGuards, Request } from "@nestjs/common";
import { ProposalDeliverablesService } from "./proposal-deliverables.service.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";

@Controller("api/v1/proposals/:proposalId/deliverables")
@UseGuards(SessionAuthGuard)
export class ProposalDeliverablesController {
  constructor(private readonly deliverablesService: ProposalDeliverablesService) {}

  @Get()
  async getDeliverables(@Param("proposalId") proposalId: string) {
    return this.deliverablesService.getDeliverables(proposalId);
  }

  @Post()
  async createDeliverable(
    @Param("proposalId") proposalId: string,
    @Body() body: any,
    @Request() req: any
  ) {
    const userId = req.user.id;
    return this.deliverablesService.createDeliverable(proposalId, body, userId);
  }
}
