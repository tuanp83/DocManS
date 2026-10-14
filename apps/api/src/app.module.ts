import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AppExceptionFilter } from "./infrastructure/observability/app-exception.filter.js";
import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { FilesModule } from "./modules/files/files.module.js";
import { ProposalEvaluationsModule } from "./proposal-evaluations/proposal-evaluations.module.js";
import { ProposalIntakePeriodsModule } from "./proposal-intake-periods/proposal-intake-periods.module.js";
import { ResearchProposalsModule } from "./research-proposals/research-proposals.module.js";
import { ResearcherProfilesModule } from "./researcher-profiles/researcher-profiles.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ScientificDocumentsModule } from "./scientific-documents/scientific-documents.module.js";

import { MailModule } from "./mail/mail.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { ApprovedProjectsModule } from "./approved-projects/approved-projects.module.js";
import { StudentResearchModule } from "./student-research/student-research.module.js";

import { PrismaModule } from "./infrastructure/prisma/prisma.module.js";
import { HealthController } from "./infrastructure/health/health.controller.js";
import { MinioObjectStorageService } from "./infrastructure/minio/minio-object-storage.service.js";
import { ScheduleModule } from "@nestjs/schedule";
import { TasksModule } from "./tasks/tasks.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule,
    AdminModule,
    FilesModule,
    ProposalIntakePeriodsModule,
    ResearchProposalsModule,
    ProposalEvaluationsModule,
    ApprovalsModule,
    ResearcherProfilesModule,
    NotificationsModule,
    ScientificDocumentsModule,
    MailModule,
    DashboardModule,
    ApprovedProjectsModule,
    StudentResearchModule,
    TasksModule
  ],
  controllers: [HealthController],
  providers: [MinioObjectStorageService, { provide: APP_FILTER, useClass: AppExceptionFilter }]
})
export class AppModule {}
