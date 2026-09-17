"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Clock, ExternalLink, Inbox } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  loadMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type UserNotificationItem
} from "@/lib/notifications-api";

function formatFullTime(isoDate: string) {
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
  } catch {
    return isoDate;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

  async function fetchNotifications() {
    try {
      setLoading(true);
      const data = await loadMyNotifications(false, 50);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchNotifications();
  }, []);

  async function handleMarkOne(id: string) {
    try {
      await markNotificationAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  }

  const displayedList =
    filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Thông báo" }
        ]}
      />
      <PageHeader
        eyebrow="Hệ thống thông báo"
        title="Hộp thông báo"
        description="Toàn bộ thông báo nghiệp vụ, lời mời phản biện và các cập nhật mới nhất dành cho bạn."
        actions={
          unreadCount > 0 ? (
            <button className="button" type="button" onClick={handleMarkAll}>
              <CheckCheck size={16} />
              Đánh dấu tất cả đã đọc
            </button>
          ) : undefined
        }
      />

      <SectionCard
        title="Danh sách thông báo"
        subtitle={`${notifications.length} thông báo · ${unreadCount} chưa đọc`}
      >
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              border: "1px solid",
              borderColor: filter === "all" ? "#1e3a8a" : "#cbd5e1",
              background: filter === "all" ? "#1e3a8a" : "#ffffff",
              color: filter === "all" ? "#ffffff" : "#475569"
            }}
          >
            Tất cả ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              border: "1px solid",
              borderColor: filter === "unread" ? "#dc2626" : "#cbd5e1",
              background: filter === "unread" ? "#fee2e2" : "#ffffff",
              color: filter === "unread" ? "#b91c1c" : "#475569"
            }}
          >
            Chưa đọc ({unreadCount})
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
            <Clock size={24} className="animate-spin" style={{ margin: "0 auto 8px auto" }} />
            <p>Đang tải thông báo...</p>
          </div>
        ) : displayedList.length === 0 ? (
          <EmptyState
            title="Không có thông báo nào"
            message={
              filter === "unread"
                ? "Bạn đã đọc hết các thông báo."
                : "Hộp thông báo hiện tại đang trống."
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {displayedList.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: item.isRead ? "#e2e8f0" : "#bae6fd",
                  background: item.isRead ? "#ffffff" : "#f0f9ff",
                  transition: "background 0.15s"
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: item.isRead ? "transparent" : "#0284c7",
                    marginTop: "6px",
                    flexShrink: 0
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "600", color: "#0f172a" }}>
                      {item.title}
                    </h4>
                    <span style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {formatFullTime(item.createdAt)}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                    {item.message}
                  </p>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    {item.link && (
                      <Link
                        href={item.link}
                        onClick={() => {
                          if (!item.isRead) void handleMarkOne(item.id);
                        }}
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#1e3a8a",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          textDecoration: "none"
                        }}
                      >
                        <span>Đi đến trang chi tiết</span>
                        <ExternalLink size={13} />
                      </Link>
                    )}
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkOne(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          fontSize: "12px",
                          cursor: "pointer",
                          padding: 0
                        }}
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
