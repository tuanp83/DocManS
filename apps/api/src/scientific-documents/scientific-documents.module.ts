import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { MinioObjectStorageService } from "../infrastructure/minio/minio-object-storage.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { ScientificDocumentsController } from "./scientific-documents.controller.js";
import { ScientificDocumentsService } from "./scientific-documents.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ScientificDocumentsController],
  providers: [
    ScientificDocumentsService,
    AuditLogService,
    MinioObjectStorageService,
    PrismaService
  ],
  exports: [ScientificDocumentsService]
})
export class ScientificDocumentsModule {}
