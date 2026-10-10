import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalManagementOfficerService } from "../proposals-shared/proposal-management-officer.service.js";
import { ProposalDeliverablesController } from "./proposal-deliverables.controller.js";
import { ProposalDeliverablesService } from "./proposal-deliverables.service.js";
import { ProposalParticipationService } from "./proposal-participation.service.js";
import { ResearchProposalsController } from "./research-proposals.controller.js";
import { ResearchProposalsService } from "./research-proposals.service.js";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ResearchProposalsController, ProposalDeliverablesController],
  providers: [
    ResearchProposalsService,
    ProposalParticipationService,
    ProposalReviewAccessService,
    ProposalManagementOfficerService,
    AuditLogService,
    PrismaService,
    ProposalDeliverablesService
  ],
  exports: [ProposalParticipationService, ProposalReviewAccessService, ProposalManagementOfficerService]
})
export class ResearchProposalsModule {}
