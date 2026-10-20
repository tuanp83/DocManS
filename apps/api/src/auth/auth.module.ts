import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { AuditLogService } from "./audit-log.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthStore } from "./auth.store.js";
import { LoginOtpService } from "./login-otp.js";
import { PasswordService } from "./password.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuditLogService, AuthRateLimitService, AuthService, AuthStore, LoginOtpService, PasswordService, SessionAuthGuard],
  exports: [AuthService, SessionAuthGuard]
})
export class AuthModule {}
