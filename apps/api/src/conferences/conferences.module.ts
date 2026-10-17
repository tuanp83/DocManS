import { Module } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { PasswordService } from "../auth/password.service.js";
import { MinioObjectStorageService } from "../infrastructure/minio/minio-object-storage.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { MailModule } from "../mail/mail.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { ConferenceInvitationsService } from "./conference-invitations.service.js";
import { ConferencePapersService } from "./conference-papers.service.js";
import { ConferencePapersController, ConferencesController, MyConferencesController, PublicConferenceInvitationsController } from "./conferences.controller.js";
import { ConferencesService } from "./conferences.service.js";

// AuthModule cung cấp SessionAuthGuard; PrismaService, AuditLogService và kho tệp khai báo như StudentResearchModule.
@Module({
  imports: [AuthModule, MailModule, NotificationsModule],
  controllers: [ConferencesController, MyConferencesController, ConferencePapersController, PublicConferenceInvitationsController],
  providers: [
    AuditLogService,
    PasswordService,
    MinioObjectStorageService,
    ConferencesService,
    ConferenceInvitationsService,
    {
      provide: ConferencePapersService,
      useFactory: (prisma: PrismaService, auditLog: AuditLogService, storage: MinioObjectStorageService, notifications: NotificationsService) => new ConferencePapersService(prisma, auditLog, storage, notifications),
      inject: [PrismaService, AuditLogService, MinioObjectStorageService, NotificationsService]
    }
  ]
})
export class ConferencesModule {}
