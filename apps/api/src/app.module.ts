import { Controller, Get, Module, Res } from "@nestjs/common";
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

import { PrismaService } from "./infrastructure/prisma/prisma.service.js";
import { ScheduleModule } from "@nestjs/schedule";
import { TasksModule } from "./tasks/tasks.module.js";

@Controller("api/v1/health")
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(@Res() res: any) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return res.status(200).json({
        status: "ok",
        service: "DocManSystem API",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(503).json({
        status: "error",
        service: "DocManSystem API",
        database: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    AdminModule,
    FilesModule,
    ProposalIntakePeriodsModule,
    ResearchProposalsModule,
    ProposalEvaluationsModule,
    ResearcherProfilesModule,
    NotificationsModule,
    ScientificDocumentsModule,
    MailModule,
    DashboardModule,
    TasksModule
  ],
  controllers: [HealthController],
  providers: [PrismaService]
})
export class AppModule {}
