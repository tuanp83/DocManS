import { Module } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { PasswordService } from "../auth/password.service.js";
import { MailService } from "../notifications/mail.service.js";
import { ResearcherProfilesController } from "./researcher-profiles.controller.js";
import { ResearcherProfilesService } from "./researcher-profiles.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ResearcherProfilesController],
  providers: [ResearcherProfilesService, AuditLogService, MailService, PasswordService]
})
export class ResearcherProfilesModule {}
