import { getApiBaseUrl } from "@/lib/session";

/**
 * Mã chống giả mạo yêu cầu (CSRF) của phiên hiện tại: API trả về ở /auth/login và /auth/me, giao diện giữ trong
 * bộ nhớ (không lưu vào storage) và gửi kèm header X-CSRF-Token ở mọi yêu cầu ghi.
 */

export const CSRF_HEADER = "X-CSRF-Token";

let csrfToken: string | null = null;

export function setCsrfToken(token: unknown) {
  csrfToken = typeof token === "string" && token ? token : null;
}

/** Header cần thêm cho một yêu cầu: chỉ yêu cầu ghi mới mang mã. */
export function csrfHeaders(method: string | undefined): Record<string, string> {
  const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
  return unsafe && csrfToken ? { [CSRF_HEADER]: csrfToken } : {};
}

/** Lấy lại mã từ /auth/me (sau khi tải lại trang hoặc khi API báo mã không hợp lệ). */
export async function refreshCsrfToken() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return false;
    const body = (await response.json()) as { csrfToken?: unknown };
    setCsrfToken(body.csrfToken);
    return Boolean(csrfToken);
  } catch {
    return false;
  }
}
