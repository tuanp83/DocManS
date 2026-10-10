import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { MinioObjectStorageService } from "../infrastructure/minio/minio-object-storage.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { StudentResearchController } from "./student-research.controller.js";
import { StudentResearchService } from "./student-research.service.js";

// AuthModule cung cấp SessionAuthGuard (cần AuthService); PrismaService, AuditLogService và kho tệp khai báo như FilesModule.
@Module({
  imports: [AuthModule],
  controllers: [StudentResearchController],
  providers: [
    PrismaService,
    AuditLogService,
    MinioObjectStorageService,
    {
      provide: StudentResearchService,
      useFactory: (prisma: PrismaService, auditLog: AuditLogService, storage: MinioObjectStorageService) => new StudentResearchService(prisma, auditLog, storage),
      inject: [PrismaService, AuditLogService, MinioObjectStorageService]
    }
  ],
  exports: [StudentResearchService]
})
export class StudentResearchModule {}
