import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { AuthStore } from "./auth.store.js";
import { PasswordService } from "./password.service.js";
import { AUTH_FAILURE_MESSAGE, type LoginRequest } from "./auth.types.js";
import { validateNewPassword } from "./password-request.pipe.js";
import { isLoginOtpRequiredRole, loginOtpApplies, LoginOtpService, type LoginChallengeResult } from "./login-otp.js";

const DUMMY_PASSWORD_HASH =
  "scrypt:rtms-dummy-user:96634051871e68281b278b3fd4750c99b588a7de2d52473164898e8c8bef8317235443d642c5ecb4b92a434ad6fad6909a16e0642697c58222e82b92e3437589";

type RequestContext = {
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly authStore: AuthStore,
    private readonly passwordService: PasswordService,
    private readonly loginOtp: LoginOtpService
  ) {}

  async login(input: LoginRequest, context: RequestContext) {
    const username = input.username?.trim() ?? "";
    const password = input.password ?? "";
    const rateLimitKey = this.createRateLimitKey(username, context.ip);
    this.rateLimit.assertCanAttempt(rateLimitKey);

    const user = username ? await this.authStore.findUserByUsername(username) : null;
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordIsValid = await this.passwordService.verifyPassword(password, passwordHash);

    if (!user || !passwordIsValid || user.status !== "active") {
      this.rateLimit.recordFailure(rateLimitKey);
      await this.auditLog.record({
        action: "login",
        result: "failure",
        targetEntity: "auth-session",
        targetEntityId: username || "unknown",
        username: username || undefined,
        ip: context.ip,
        userAgent: context.userAgent,
        reason: "invalid_credentials"
      });

      throw new UnauthorizedException({ message: AUTH_FAILURE_MESSAGE });
    }

    this.rateLimit.reset(rateLimitKey);

    // Xác thực hai lớp: mật khẩu đúng chưa cấp phiên, gửi mã qua thư và chờ /auth/login/verify (auth/login-otp.ts).
    if (loginOtpApplies(user)) {
      const challenge = await this.loginOtp.start(user, context).catch(async (error) => {
        await this.auditLog.record({ action: "login-otp-send", result: "failure", actorId: user.id, targetEntity: "auth-session", targetEntityId: user.id, username: user.username, ip: context.ip, userAgent: context.userAgent, reason: (error as { response?: { code?: string } })?.response?.code ?? "send_failed" });
        throw error;
      });
      await this.auditLog.record({ action: "login-otp-send", result: "success", actorId: user.id, targetEntity: "login-challenge", targetEntityId: challenge.challengeId, username: user.username, ip: context.ip, userAgent: context.userAgent });
      return { challenge };
    }

    return this.openSession(user, context);
  }

  /** Nhập đúng mã thì cấp phiên; phiên chỉ cấp được khi mật khẩu chưa đổi từ lúc gửi mã (credentialVersion). */
  async verifyLoginOtp(input: { challengeId?: unknown; code?: unknown }, context: RequestContext) {
    const challengeId = typeof input.challengeId === "string" ? input.challengeId : "";
    const code = typeof input.code === "string" ? input.code.trim() : "";
    let verified: { userId: string; credentialVersion: number };
    try {
      verified = await this.loginOtp.verify(challengeId, code);
    } catch (error) {
      await this.auditLog.record({ action: "login-otp-verify", result: "failure", targetEntity: "login-challenge", targetEntityId: challengeId || "unknown", ip: context.ip, userAgent: context.userAgent, reason: (error as { response?: { code?: string } })?.response?.code ?? "invalid" });
      throw error;
    }
    const user = await this.authStore.findUserById(verified.userId);
    if (!user || user.status !== "active" || user.credentialVersion !== verified.credentialVersion) {
      throw new UnauthorizedException({ code: "LOGIN_OTP_INVALID", message: "Lượt đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại." });
    }
    return this.openSession(user, context, "email-otp");
  }

  async resendLoginOtp(input: { challengeId?: unknown }, context: RequestContext): Promise<LoginChallengeResult> {
    const challengeId = typeof input.challengeId === "string" ? input.challengeId : "";
    const challenge = await this.loginOtp.resend(challengeId, (userId) => this.authStore.findUserById(userId));
    await this.auditLog.record({ action: "login-otp-resend", result: "success", targetEntity: "login-challenge", targetEntityId: challengeId, ip: context.ip, userAgent: context.userAgent });
    return challenge;
  }

  /** Tự bật / tắt xác thực hai lớp. Vai trò bắt buộc không tắt được; bật cần có thư công vụ. */
  async setLoginOtpEnabled(userId: string, enabled: unknown, context: RequestContext) {
    if (typeof enabled !== "boolean") throw new BadRequestException({ message: "Giá trị bật/tắt không hợp lệ." });
    const user = await this.authStore.findUserById(userId);
    if (!user) throw new UnauthorizedException({ message: "Yêu cầu đăng nhập để tiếp tục." });
    if (!enabled && isLoginOtpRequiredRole(user.systemRole)) {
      throw new ForbiddenException({ code: "LOGIN_OTP_REQUIRED", message: "Vai trò của đồng chí bắt buộc xác thực hai lớp, không tắt được." });
    }
    if (enabled && !user.credentialEmail) {
      throw new BadRequestException({ code: "LOGIN_OTP_EMAIL_MISSING", message: "Tài khoản chưa có thư công vụ để nhận mã. Liên hệ quản trị hệ thống để bổ sung." });
    }
    await this.authStore.setLoginOtpEnabled(userId, enabled);
    await this.auditLog.record({ action: enabled ? "login-otp-enable" : "login-otp-disable", result: "success", actorId: userId, targetEntity: "user", targetEntityId: userId, username: user.username, ip: context.ip, userAgent: context.userAgent });
    const updated = await this.authStore.findUserById(userId);
    return { loginOtp: this.authStore.toSafeUser(updated!).loginOtp };
  }

  private async openSession(user: NonNullable<Awaited<ReturnType<AuthStore["findUserById"]>>>, context: RequestContext, method = "password") {
    const session = await this.authStore.createSession(user.id, user.credentialVersion);
    const safeUser = this.authStore.toSafeUser(user);

    await this.auditLog.record({
      action: "login",
      result: "success",
      actorId: user.id,
      targetEntity: "auth-session",
      targetEntityId: session.id,
      username: user.username,
      ip: context.ip,
      userAgent: context.userAgent,
      reason: method === "password" ? undefined : method
    });

    return { session, user: safeUser };
  }

  async logout(sessionId: string | null, context: RequestContext) {
    const session = sessionId ? await this.authStore.revokeSession(sessionId) : null;
    const user = session ? await this.authStore.findUserById(session.userId) : null;

    await this.auditLog.record({
      action: "logout",
      result: session ? "success" : "failure",
      actorId: user?.id,
      targetEntity: "auth-session",
      targetEntityId: sessionId ?? "unknown",
      username: user?.username,
      ip: context.ip,
      userAgent: context.userAgent,
      reason: session ? undefined : "missing_or_invalid_session"
    });

    return { success: true };
  }

  async getUserForSession(sessionId: string | null) {
    if (!sessionId) {
      return null;
    }

    const session = await this.authStore.getActiveSession(sessionId);
    const user = session ? await this.authStore.findUserById(session.userId) : null;

    return user?.status === "active" && session?.credentialVersion === user.credentialVersion ? this.authStore.toSafeUser(user) : null;
  }

  async listAuditLogs() {
    return this.auditLog.list();
  }

  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }, context: RequestContext) {
    const user = await this.authStore.findUserById(userId);
    if (!user || user.status !== "active" || !(await this.passwordService.verifyPassword(input.currentPassword, user.passwordHash))) {
      await this.auditLog.record({ action: "change-password", result: "failure", actorId: userId, targetEntity: "user", targetEntityId: userId, ip: context.ip, userAgent: context.userAgent, reason: "current_password_invalid" });
      throw new BadRequestException({ message: "Mật khẩu hiện tại không chính xác." });
    }
    try {
      validateNewPassword(input.newPassword);
    } catch (error) {
      await this.recordPasswordChangeFailure(user.id, context, "new_password_policy_invalid");
      throw error;
    }
    if (await this.passwordService.verifyPassword(input.newPassword, user.passwordHash)) throw new BadRequestException({ message: "Mật khẩu mới phải khác mật khẩu hiện tại." });
    const changed = await this.authStore.changePassword(user.id, await this.passwordService.hashPassword(input.newPassword), user.credentialVersion, { action: user.mustChangePassword ? "first-password-change" : "change-password", username: user.username, ip: context.ip, userAgent: context.userAgent });
    if (!changed) {
      await this.recordPasswordChangeFailure(user.id, context, "credential_version_mismatch");
      throw new ConflictException({ message: "Thông tin xác thực đã thay đổi. Vui lòng đăng nhập lại." });
    }
  }

  async initiatePasswordReset(actor: { id: string; username: string }, userId: string, context: RequestContext) {
    const user = await this.authStore.findUserById(userId);
    if (!user) {
      await this.auditLog.record({ action: "initiate-password-reset", result: "failure", actorId: actor.id, targetEntity: "user", targetEntityId: userId, username: actor.username, ip: context.ip, userAgent: context.userAgent, reason: "target_not_found_or_unavailable" });
      throw new BadRequestException({ message: "Không tìm thấy người dùng cần đặt lại mật khẩu." });
    }
    const reset = this.passwordService.createResetToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.authStore.createPasswordResetToken(user.id, actor.id, reset.tokenHash, expiresAt);
    await this.auditLog.record({ action: "initiate-password-reset", result: "success", actorId: actor.id, targetEntity: "user", targetEntityId: user.id, username: actor.username, ip: context.ip, userAgent: context.userAgent });
    return { token: reset.token, expiresAt: expiresAt.toISOString() };
  }

  async completePasswordReset(input: { token: string; newPassword: string }, context: RequestContext) {
    const rateLimitKey = `password-reset:${context.ip ?? "unknown"}`;
    this.rateLimit.assertCanAttempt(rateLimitKey);
    try {
      validateNewPassword(input.newPassword);
    } catch (error) {
      await this.recordPasswordResetFailure(context, "new_password_policy_invalid");
      throw error;
    }
    const userId = await this.authStore.completePasswordReset(
      this.passwordService.hashResetToken(input.token),
      await this.passwordService.hashPassword(input.newPassword)
    );
    if (!userId) {
      this.rateLimit.recordFailure(rateLimitKey);
      await this.recordPasswordResetFailure(context, "invalid_or_expired");
      throw new BadRequestException({ message: "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });
    }
    this.rateLimit.reset(rateLimitKey);
    await this.auditLog.record({ action: "complete-password-reset", result: "success", actorId: userId, targetEntity: "user", targetEntityId: userId, ip: context.ip, userAgent: context.userAgent });
  }

  async completeAccountActivation(input: { token: string; password: string }, context: RequestContext) {
    const rateLimitKey = `account-activation:${context.ip ?? "unknown"}`;
    this.rateLimit.assertCanAttempt(rateLimitKey);
    try {
      validateNewPassword(input.password);
    } catch (error) {
      await this.recordAccountActivationFailure(context, "new_password_policy_invalid");
      throw error;
    }
    const userId = await this.authStore.completeAccountActivation(
      this.passwordService.hashResetToken(input.token),
      await this.passwordService.hashPassword(input.password)
    );
    if (!userId) {
      this.rateLimit.recordFailure(rateLimitKey);
      await this.recordAccountActivationFailure(context, "invalid_or_expired");
      throw new BadRequestException({ message: "Liên kết kích hoạt không hợp lệ hoặc đã hết hạn." });
    }
    this.rateLimit.reset(rateLimitKey);
    await this.auditLog.record({ action: "complete-account-activation", result: "success", actorId: userId, targetEntity: "user", targetEntityId: userId, ip: context.ip, userAgent: context.userAgent });
  }

  async recordPasswordChangeFailure(userId: string, context: RequestContext, reason: string) {
    await this.auditLog.record({ action: "change-password", result: "failure", actorId: userId, targetEntity: "user", targetEntityId: userId, ip: context.ip, userAgent: context.userAgent, reason });
  }

  async recordPasswordResetFailure(context: RequestContext, reason: string) {
    await this.auditLog.record({ action: "complete-password-reset", result: "failure", targetEntity: "password-reset", targetEntityId: "unknown", ip: context.ip, userAgent: context.userAgent, reason });
  }

  async recordAccountActivationFailure(context: RequestContext, reason: string) {
    await this.auditLog.record({ action: "complete-account-activation", result: "failure", targetEntity: "account-activation", targetEntityId: "unknown", ip: context.ip, userAgent: context.userAgent, reason });
  }

  private createRateLimitKey(username: string, ip?: string) {
    return `${ip ?? "unknown"}:${username.trim().toLowerCase()}`;
  }
}
