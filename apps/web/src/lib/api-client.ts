import { getApiBaseUrl } from "@/lib/session";

/**
 * Lỗi từ API: `message` là thông báo cho người dùng, `status` là mã HTTP (0 = không kết nối được).
 * Các trường khác trong thân phản hồi lỗi (missingFields, fieldErrors, pendingReviewers...) được giữ
 * nguyên trên đối tượng lỗi để từng màn hình đọc.
 */
export type ApiError = Error & { status: number } & Record<string, unknown>;

/**
 * Gọi API kèm cookie phiên và đọc JSON. Thân FormData không gắn Content-Type để trình duyệt tự đặt
 * boundary. Lỗi ném ra luôn có thông báo tiếng Việt: lấy từ API nếu có, nếu không dùng `fallbackMessage`.
 */
export async function apiRequest<T>(path: string, init: RequestInit | undefined, fallbackMessage: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers
      }
    });
  } catch (cause) {
    if ((cause as Error)?.name === "AbortError") throw cause;
    throw Object.assign(new Error("Không kết nối được tới máy chủ. Kiểm tra kết nối và thử lại."), { status: 0 }) as ApiError;
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const { message, ...details } = body;
    const text = typeof message === "string"
      ? message
      : Array.isArray(message) && message.every((item) => typeof item === "string")
        ? message.join(" ")
        : response.status === 413 ? "Tệp vượt quá dung lượng cho phép." : fallbackMessage;
    throw Object.assign(new Error(text), details, { status: response.status }) as ApiError;
  }

  return body as T;
}
