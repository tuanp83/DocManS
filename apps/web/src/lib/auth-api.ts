import { apiRequest } from "@/lib/api-client";
import { csrfHeaders, setCsrfToken } from "@/lib/csrf";
import { getApiBaseUrl, type CurrentUser } from "@/lib/session";
import { SYSTEM_ROLES } from "@rtms/permissions";

export type LoginResult =
  | {
      ok: true;
      user: CurrentUser;
    }
  | {
      ok: false;
      message: string;
    };

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
      return { ok: false, message: safeAuthError };
    }

    const body = (await response.json()) as { user?: unknown; csrfToken?: unknown };
    if (!isCurrentUser(body.user)) {
      return { ok: false, message: safeAuthError };
    }

    setCsrfToken(body.csrfToken);
    return { ok: true, user: body.user };
  } catch {
    return { ok: false, message: safeAuthError };
  }
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
