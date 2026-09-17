import { getApiBaseUrl } from "@/lib/session";

export type UserNotificationItem = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  metadata?: Record<string, any> | null;
  createdAt: string;
};

export type NotificationListResponse = {
  notifications: UserNotificationItem[];
  unreadCount: number;
};

export async function notificationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/notifications${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Không thể xử lý thông báo.");
  return body as T;
}

export const loadMyNotifications = (unreadOnly = false, limit = 20) =>
  notificationRequest<NotificationListResponse>(`?unreadOnly=${unreadOnly}&limit=${limit}`);

export const markNotificationAsRead = (id: string) =>
  notificationRequest<{ notification: UserNotificationItem; unreadCount: number }>(`/${id}/read`, { method: "POST" });

export const markAllNotificationsAsRead = () =>
  notificationRequest<{ success: boolean; unreadCount: number }>("/read-all", { method: "POST" });
