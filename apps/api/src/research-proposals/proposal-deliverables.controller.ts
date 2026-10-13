import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ProposalDeliverablesService } from "./proposal-deliverables.service.js";
import { createDeliverablePipe, updateDeliverablePipe, type DeliverableInput } from "./proposal-deliverables.dto.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";

@Controller("api/v1/proposals/:proposalId/deliverables")
@UseGuards(SessionAuthGuard)
export class ProposalDeliverablesController {
  constructor(private readonly deliverablesService: ProposalDeliverablesService) {}

  @Get()
  async getDeliverables(@Req() request: RequestWithCurrentUser, @Param("proposalId") proposalId: string) {
    return this.deliverablesService.getDeliverables(proposalId, request.currentUser!);
  }

  @Post()
  async createDeliverable(@Req() request: RequestWithCurrentUser, @Param("proposalId") proposalId: string, @Body(createDeliverablePipe) body: DeliverableInput) {
    return { deliverable: await this.deliverablesService.createDeliverable(proposalId, body, request.currentUser!) };
  }

  @Patch(":deliverableId")
  async updateDeliverable(@Req() request: RequestWithCurrentUser, @Param("proposalId") proposalId: string, @Param("deliverableId") deliverableId: string, @Body(updateDeliverablePipe) body: DeliverableInput) {
    return { deliverable: await this.deliverablesService.updateDeliverable(proposalId, deliverableId, body, request.currentUser!) };
  }

  @Delete(":deliverableId")
  async deleteDeliverable(@Req() request: RequestWithCurrentUser, @Param("proposalId") proposalId: string, @Param("deliverableId") deliverableId: string) {
    return this.deliverablesService.deleteDeliverable(proposalId, deliverableId, request.currentUser!);
  }
}
