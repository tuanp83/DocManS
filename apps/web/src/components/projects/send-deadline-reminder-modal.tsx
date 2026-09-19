"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, Mail, Send, X, CheckCircle2 } from "lucide-react";
import type { ProjectMilestone } from "./submit-milestone-report-modal";

type SendDeadlineReminderModalProps = {
  milestone: ProjectMilestone;
  onClose: () => void;
  onSendSuccess: (milestoneId: string, reminderMessage: string) => void;
};

export function SendDeadlineReminderModal({
  milestone,
  onClose,
  onSendSuccess
}: SendDeadlineReminderModalProps) {
  const isOverdue = milestone.daysRemaining < 0;
  const defaultTitle = isOverdue
    ? `[CẢNH BÁO QUÁ HẠN] Đôn đốc nộp ${milestone.milestoneName} - Đề tài [${milestone.proposalCode}]`
    : `[NHẮC NHỞ HẠN NỘP] Chuẩn bị nộp ${milestone.milestoneName} - Đề tài [${milestone.proposalCode}]`;

  const defaultMessage = isOverdue
    ? `Kính gửi đồng chí ${milestone.piName} - Chủ nhiệm đề tài [${milestone.proposalCode}] ${milestone.proposalTitle}.\n\nTheo tiến độ đã được phê duyệt, mốc "${milestone.milestoneName}" có hạn nộp vào ngày ${milestone.dueDate}. Đến nay đề tài đã quá hạn ${Math.abs(milestone.daysRemaining)} ngày nhưng hệ thống chưa ghi nhận báo cáo tiến độ hợp lệ.\n\nPhòng Khoa học quân sự yêu cầu đồng chí Chủ nhiệm đề tài khẩn trương hoàn thiện báo cáo và nộp trên hệ thống trước ngày quy định, hoặc có văn bản giải trình lý do chậm muộn để báo cáo Ban Giám đốc Học viện.`
    : `Kính gửi đồng chí ${milestone.piName} - Chủ nhiệm đề tài [${milestone.proposalCode}] ${milestone.proposalTitle}.\n\nPhòng Khoa học quân sự xin thông báo: Mốc "${milestone.milestoneName}" của đề tài sẽ đến hạn nộp vào ngày ${milestone.dueDate} (còn ${milestone.daysRemaining} ngày).\n\nĐề nghị đồng chí chủ động chuẩn bị hồ sơ, số liệu và nộp Báo cáo tiến độ theo đúng thời gian quy định.`;

  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSystemNotification, setSendSystemNotification] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      setTimeout(() => {
        onSendSuccess(milestone.id, message);
      }, 1000);
    }, 700);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px"
      }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                background: isOverdue ? "#ffe4e6" : "#fef3c7",
                color: isOverdue ? "#be123c" : "#b45309",
                padding: "8px",
                borderRadius: "8px"
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                {isOverdue ? "Gửi Cảnh báo Trễ hạn" : "Gửi Nhắc nhở Tiến độ"}
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                Đôn đốc Chủ nhiệm: {milestone.piName} ({milestone.unitName})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {sentSuccess ? (
          <div style={{ padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "48px", height: "48px", background: "#d1fae5", color: "#065f46", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={28} />
            </div>
            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Đã gửi thông báo đôn đốc thành công!</h4>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
              Hệ thống đã gửi văn bản cảnh báo đến Chủ nhiệm đề tài <strong>{milestone.piName}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><strong>Đề tài:</strong> [{milestone.proposalCode}] {milestone.proposalTitle}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>Chủ nhiệm (PI):</strong> {milestone.piName}</span>
                <span><strong>Đơn vị:</strong> {milestone.unitName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span><strong>Mốc báo cáo:</strong> {milestone.milestoneName}</span>
                <span>
                  <strong>Hạn nộp:</strong> {milestone.dueDate}{" "}
                  {isOverdue ? (
                    <span style={{ color: "#be123c", fontWeight: 700 }}>(Quá hạn {Math.abs(milestone.daysRemaining)} ngày)</span>
                  ) : (
                    <span style={{ color: "#b45309", fontWeight: 700 }}>(Còn {milestone.daysRemaining} ngày)</span>
                  )}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Tiêu đề thông báo / công văn đôn đốc *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%", fontSize: "12.5px", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Nội dung cảnh báo & chỉ đạo của Phòng KHQS *
              </label>
              <textarea
                rows={6}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ width: "100%", fontSize: "12px", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", fontFamily: "monospace", lineHeight: 1.4 }}
              />
            </div>

            <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>Kênh gửi thông báo:</span>
              <div style={{ display: "flex", gap: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={sendSystemNotification}
                    onChange={(e) => setSendSystemNotification(e.target.checked)}
                    style={{ accentColor: "#064e3b" }}
                  />
                  <BellRing size={14} color="#064e3b" />
                  <span>Thông báo nội bộ trên DocManS</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#334155", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    style={{ accentColor: "#064e3b" }}
                  />
                  <Mail size={14} color="#2563eb" />
                  <span>Gửi Email tự động</span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
                disabled={isSending}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="button"
                style={{
                  background: isOverdue ? "#e11d48" : "#d97706",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
                disabled={isSending}
              >
                {isSending ? (
                  "Đang gửi..."
                ) : (
                  <>
                    <Send size={14} /> Gửi thông báo đôn đốc
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
