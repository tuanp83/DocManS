import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logJson } from "../infrastructure/observability/log.js";
import { readSessionCookie } from "./session-cookie.js";

/**
 * Chống giả mạo yêu cầu (CSRF) cho mọi yêu cầu ghi tới /api/:
 *  1. Chỉ nhận thân JSON hoặc multipart (tải tệp): biểu mẫu HTML của trang khác không gửi được JSON.
 *  2. Nguồn gửi (Origin, hoặc Referer nếu thiếu) phải là một trong các nguồn web được phép (WEB_ORIGIN);
 *     trình duyệt báo Sec-Fetch-Site: cross-site thì từ chối.
 *  3. Yêu cầu mang cookie phiên phải gửi kèm X-CSRF-Token = HMAC(CSRF_SECRET, mã phiên). Mã trả về ở
 *     /auth/login và /auth/me; không lưu thêm gì trong CSDL và tự đổi khi phiên đổi.
 * Các endpoint không cần phiên (đăng nhập, đăng xuất, đặt lại mật khẩu, kích hoạt, thư mời công khai) chỉ kiểm
 * tra bước 1–2: người dùng có thể còn giữ cookie của phiên đã hết hạn khi đăng nhập lại.
 */

export const CSRF_HEADER = "x-csrf-token";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_CONTENT_TYPES = ["application/json", "multipart/form-data"];
const TOKEN_EXEMPT_PATHS = [
  /^\/api\/v1\/auth\/(login|logout|password-reset\/complete|account-activation\/complete)$/,
  /^\/api\/v1\/public\//
];

let secret: Buffer | null = null;

function csrfSecret() {
  if (secret) return secret;
  const configured = process.env.CSRF_SECRET?.trim();
  if (configured && configured.length >= 32) {
    secret = Buffer.from(configured, "utf8");
  } else {
    // Không cấu hình: dùng khoá ngẫu nhiên theo tiến trình (mã CSRF mất hiệu lực khi API khởi động lại).
    // docker-compose.prod.yml bắt buộc CSRF_SECRET nên trường hợp này chỉ xảy ra ở môi trường phát triển.
    console.warn("CSRF_SECRET chưa được cấu hình (cần ít nhất 32 ký tự): dùng khoá ngẫu nhiên theo tiến trình.");
    secret = randomBytes(32);
  }
  return secret;
}

export function csrfTokenForSession(sessionId: string) {
  return createHmac("sha256", csrfSecret()).update(`csrf:${sessionId}`).digest("base64url");
}

export function isValidCsrfToken(sessionId: string, token: unknown) {
  if (typeof token !== "string" || !token) return false;
  const expected = Buffer.from(csrfTokenForSession(sessionId));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requestOrigin(request: Request) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin && origin !== "null") return origin;
  const referer = request.headers.referer;
  if (typeof referer !== "string" || !referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function hasBody(request: Request) {
  const length = request.headers["content-length"];
  return Boolean(request.headers["transfer-encoding"]) || (length !== undefined && length !== "0");
}

function reject(request: Request, response: Response, status: number, code: string, message: string) {
  // Log mặc định chỉ ghi lỗi 5xx: ghi riêng yêu cầu bị chặn để tra cứu (dc logs api | grep CSRF).
  logJson("warn", "csrf_rejected", {
    requestId: (request as Request & { requestId?: string }).requestId,
    code,
    method: request.method,
    path: request.path,
    origin: request.headers.origin ?? null,
    secFetchSite: request.headers["sec-fetch-site"] ?? null
  });
  response.status(status).json({ statusCode: status, code, message });
}

export function csrfProtection(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((origin) => origin.replace(/\/+$/, "")));

  return (request: Request, response: Response, next: NextFunction) => {
    const path = request.path;
    if (!UNSAFE_METHODS.has(request.method) || !path.startsWith("/api/")) return next();

    const contentType = String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if ((contentType || hasBody(request)) && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return reject(request, response, 415, "CONTENT_TYPE_REJECTED", "Kiểu dữ liệu gửi lên không được chấp nhận.");
    }

    const origin = requestOrigin(request);
    if (!origin || !allowed.has(origin) || request.headers["sec-fetch-site"] === "cross-site") {
      return reject(request, response, 403, "CSRF_ORIGIN_REJECTED", "Yêu cầu không đến từ trang của hệ thống. Vui lòng tải lại trang và thử lại.");
    }

    if (TOKEN_EXEMPT_PATHS.some((pattern) => pattern.test(path))) return next();

    const sessionId = readSessionCookie(request.headers.cookie);
    if (sessionId && !isValidCsrfToken(sessionId, request.headers[CSRF_HEADER])) {
      return reject(request, response, 403, "CSRF_TOKEN_INVALID", "Phiên làm việc đã thay đổi. Vui lòng tải lại trang và thử lại.");
    }
    return next();
  };
}
