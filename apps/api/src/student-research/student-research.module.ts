import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { StudentResearchController } from "./student-research.controller.js";
import { StudentResearchService } from "./student-research.service.js";

// AuthModule cung cấp SessionAuthGuard (cần AuthService); PrismaService và AuditLogService khai báo như các module khác.
@Module({
  imports: [AuthModule],
  controllers: [StudentResearchController],
  providers: [StudentResearchService, PrismaService, AuditLogService],
  exports: [StudentResearchService]
})
export class StudentResearchModule {}
