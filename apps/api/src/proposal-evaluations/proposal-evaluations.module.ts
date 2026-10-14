import { Module } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ProposalReviewAccessService } from "../proposals-shared/proposal-review-access.service.js";
import { ProposalParticipationService } from "../research-proposals/proposal-participation.service.js";
import { ProposalDecisionsService } from "./proposal-decisions.service.js";
import { ProposalEvaluationSummaryService } from "./proposal-evaluation-summary.service.js";
import { ProposalEvaluationsController } from "./proposal-evaluations.controller.js";
import { EvaluationCoordinationController } from "./evaluation-coordination.controller.js";
import { EvaluationCoordinationService } from "./evaluation-coordination.service.js";
import { ProposalReviewAssignmentsService } from "./proposal-review-assignments.service.js";
import { ProposalReviewsService } from "./proposal-reviews.service.js";

/**
 * EP-03 stories 3.2 to 3.5. `ProposalParticipationService` and `ProposalReviewAccessService` depend
 * on Prisma alone, so they are provided directly rather than imported from `ResearchProposalsModule`
 * — that keeps the two proposal modules free of a circular import.
 */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ProposalEvaluationsController, EvaluationCoordinationController],
  providers: [
    AuditLogService,
    ProposalParticipationService,
    ProposalReviewAccessService,
    ProposalReviewAssignmentsService,
    ProposalReviewsService,
    ProposalEvaluationSummaryService,
    ProposalDecisionsService,
    EvaluationCoordinationService
  ],
  exports: [ProposalReviewAccessService]
})
export class ProposalEvaluationsModule {}
