import { apiRequest } from "@/lib/api-client";
import { csrfHeaders, setCsrfToken } from "@/lib/csrf";
import { getApiBaseUrl, type CurrentUser } from "@/lib/session";
import { SYSTEM_ROLES } from "@rtms/permissions";

/** Lượt đăng nhập chờ mã xác thực gửi qua thư (apps/api/src/auth/login-otp.ts). */
export type LoginOtpChallenge = { challengeId: string; emailHint: string; expiresAt: string; resendAfterSeconds: number };

export type LoginResult =
  | {
      ok: true;
      user: CurrentUser;
    }
  | {
      ok: true;
      otp: LoginOtpChallenge;
    }
  | {
      ok: false;
      message: string;
    };

function isOtpChallenge(value: unknown): value is LoginOtpChallenge & { otpRequired: true } {
  const body = value as Record<string, unknown> | null;
  return Boolean(body && body.otpRequired === true && typeof body.challengeId === "string" && typeof body.emailHint === "string");
}

/** Lỗi đăng nhập: sai mật khẩu luôn chỉ báo chung; lỗi khác (giới hạn, chưa có thư, không gửi được mã) báo đúng nội dung. */
async function loginErrorMessage(response: Response) {
  if (response.status === 401) return safeAuthError;
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  return typeof body.message === "string" ? body.message : safeAuthError;
}

const safeAuthError = "Tên đăng nhập hoặc mật khẩu không hợp lệ.";

function isCurrentUser(value: unknown): value is CurrentUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.displayName === "string" &&
    typeof user.systemRole === "string" &&
    SYSTEM_ROLES.includes(user.systemRole as (typeof SYSTEM_ROLES)[number]) &&
    typeof user.unit === "string"
  );
}

export async function loginWithPassword(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      return { ok: false, message: await loginErrorMessage(response) };
    }

    const body = (await response.json()) as { user?: unknown; csrfToken?: unknown };
    if (isOtpChallenge(body)) {
      return { ok: true, otp: { challengeId: body.challengeId, emailHint: body.emailHint, expiresAt: body.expiresAt, resendAfterSeconds: body.resendAfterSeconds } };
    }
    if (!isCurrentUser(body.user)) {
      return { ok: false, message: safeAuthError };
    }

    setCsrfToken(body.csrfToken);
    return { ok: true, user: body.user };
  } catch {
    return { ok: false, message: safeAuthError };
  }
}

/** Nhập mã xác thực; đúng thì API cấp phiên (cookie) như đăng nhập thường. */
export async function verifyLoginOtp(challengeId: string, code: string): Promise<{ ok: true; user: CurrentUser } | { ok: false; message: string; expired: boolean }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ challengeId, code })
    });
    const body = (await response.json().catch(() => ({}))) as { user?: unknown; csrfToken?: unknown; message?: unknown; code?: unknown };
    if (!response.ok || !isCurrentUser(body.user)) {
      return { ok: false, message: typeof body.message === "string" ? body.message : "Mã xác thực không đúng.", expired: body.code === "LOGIN_OTP_INVALID" };
    }
    setCsrfToken(body.csrfToken);
    return { ok: true, user: body.user };
  } catch {
    return { ok: false, message: "Không kết nối được tới máy chủ. Kiểm tra kết nối và thử lại.", expired: false };
  }
}

export async function resendLoginOtp(challengeId: string): Promise<{ ok: true; otp: LoginOtpChallenge } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ challengeId })
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || !isOtpChallenge(body)) return { ok: false, message: typeof body.message === "string" ? body.message : "Không gửi lại được mã." };
    return { ok: true, otp: { challengeId: body.challengeId, emailHint: body.emailHint, expiresAt: body.expiresAt, resendAfterSeconds: body.resendAfterSeconds } };
  } catch {
    return { ok: false, message: "Không kết nối được tới máy chủ. Kiểm tra kết nối và thử lại." };
  }
}

export async function setLoginOtpEnabled(enabled: boolean) {
  return apiRequest<{ loginOtp: { required: boolean; enabled: boolean } }>("/auth/login-otp", { method: "POST", body: JSON.stringify({ enabled }) }, "Không thể thay đổi xác thực hai lớp.");
}

export async function logoutSession() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: csrfHeaders("POST"),
      credentials: "include"
    });

    setCsrfToken(null);
    return response.ok;
  } catch {
    return false;
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await apiRequest("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, "Không thể đổi mật khẩu.");
}

export async function completePasswordReset(token: string, newPassword: string) {
  await apiRequest("/auth/password-reset/complete", { method: "POST", body: JSON.stringify({ token, newPassword }) }, "Không thể đặt lại mật khẩu.");
}

export async function completeAccountActivation(token: string, password: string, passwordConfirmation: string) {
  await apiRequest("/auth/account-activation/complete", { method: "POST", body: JSON.stringify({ token, password, passwordConfirmation }) }, "Không thể kích hoạt tài khoản.");
}

export async function getCurrentUser() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { user?: unknown; csrfToken?: unknown };
    setCsrfToken(body.csrfToken);
    return isCurrentUser(body.user) ? body.user : null;
  } catch {
    return null;
  }
}
