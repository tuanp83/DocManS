import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { MailModule } from "../mail/mail.module.js";
import { DeadlineReminderService } from "./deadline-reminder.service.js";

@Module({
  imports: [AuthModule, MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, DeadlineReminderService, PrismaService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
