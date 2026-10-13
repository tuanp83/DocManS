import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthStore } from "./auth.store.js";
import { PasswordService } from "./password.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [AuditLogService, AuthRateLimitService, AuthService, AuthStore, PasswordService, SessionAuthGuard],
  exports: [AuthService, SessionAuthGuard]
})
export class AuthModule {}
