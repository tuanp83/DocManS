import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { WorkQueueService } from "./work-queue.service.js";

@Controller("api/v1/work-queue")
@UseGuards(SessionAuthGuard)
export class WorkQueueController {
  constructor(private readonly workQueue: WorkQueueService) {}

  @Get()
  async mine(@Req() req: RequestWithCurrentUser) { return this.workQueue.forUser(req.currentUser!); }
}
