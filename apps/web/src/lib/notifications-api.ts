import { apiRequest } from "@/lib/api-client";

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

export const notificationRequest = <T>(path: string, init?: RequestInit) =>
  apiRequest<T>(`/notifications${path}`, { ...init, cache: "no-store" }, "Không thể xử lý thông báo.");

export const loadMyNotifications = (unreadOnly = false, limit = 20) =>
  notificationRequest<NotificationListResponse>(`?unreadOnly=${unreadOnly}&limit=${limit}`);

export const markNotificationAsRead = (id: string) =>
  notificationRequest<{ notification: UserNotificationItem; unreadCount: number }>(`/${id}/read`, { method: "POST" });

export const markAllNotificationsAsRead = () =>
  notificationRequest<{ success: boolean; unreadCount: number }>("/read-all", { method: "POST" });
