"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ExternalLink, Inbox } from "lucide-react";
import {
  loadMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type UserNotificationItem
} from "@/lib/notifications-api";

function formatRelativeTime(isoDate: string) {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return isoDate;
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function fetchNotifications() {
    try {
      const data = await loadMyNotifications(false, 15);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Ignore background fetch errors
    }
  }

  useEffect(() => {
    void fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  async function handleItemClick(item: UserNotificationItem) {
    if (!item.isRead) {
      try {
        await markNotificationAsRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {}
    }
    setIsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      setLoading(true);
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        className="icon-button notification-bell-btn"
        type="button"
        aria-label="Thông báo"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            void fetchNotifications();
          }
        }}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="notification-badge" aria-label={`${unreadCount} thông báo chưa đọc`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen && (
        <div className="notification-popover" role="dialog" aria-label="Hộp thông báo">
          <div className="notification-popover-header">
            <div className="notification-popover-title">
              <strong>Thông báo</strong>
              {unreadCount > 0 && <span className="notification-unread-tag">{unreadCount} mới</span>}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all-btn"
                onClick={handleMarkAllAsRead}
                disabled={loading}
                title="Đánh dấu tất cả đã đọc"
              >
                <CheckCheck size={14} />
                <span>Đã đọc tất cả</span>
              </button>
            )}
          </div>

          <div className="notification-popover-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <Inbox size={32} />
                <p>Không có thông báo nào</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`notification-item ${!item.isRead ? "unread" : ""}`}
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void handleItemClick(item);
                    }
                  }}
                >
                  <div className="notification-item-indicator" />
                  <div className="notification-item-content">
                    <p className="notification-item-title">{item.title}</p>
                    <p className="notification-item-message">{item.message}</p>
                    <span className="notification-item-time">{formatRelativeTime(item.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="notification-popover-footer">
            <Link
              href="/invitation-to-review"
              className="notification-footer-link"
              onClick={() => setIsOpen(false)}
            >
              <span>Xem hồ sơ được mời phản biện</span>
              <ExternalLink size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
