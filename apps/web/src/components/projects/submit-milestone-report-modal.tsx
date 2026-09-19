"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Upload, X, AlertCircle } from "lucide-react";

export type ProjectMilestone = {
  id: string;
  proposalId: string;
  proposalCode: string;
  proposalTitle: string;
  piName: string;
  piId: string;
  unitName: string;
  milestoneName: string;
  milestoneType: "periodic_6m" | "midterm" | "periodic_18m" | "final_acceptance";
  dueDate: string;
  status: "pending" | "submitted" | "approved" | "overdue";
  daysRemaining: number;
  submittedAt?: string;
  completionPercent?: number;
  reportSummary?: string;
  fileName?: string;
};

type SubmitMilestoneReportModalProps = {
  milestone: ProjectMilestone;
  onClose: () => void;
  onSubmitSuccess: (milestoneId: string, data: { completionPercent: number; summary: string; fileName: string }) => void;
};

export function SubmitMilestoneReportModal({
  milestone,
  onClose,
  onSubmitSuccess
}: SubmitMilestoneReportModalProps) {
  const [completionPercent, setCompletionPercent] = useState<number>(milestone.completionPercent || 70);
  const [summary, setSummary] = useState(milestone.reportSummary || "");
  const [fileName, setFileName] = useState(milestone.fileName || "");
  const [difficulties, setDifficulties] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setErrorMessage("Vui lòng nhập tóm tắt kết quả nghiên cứu và khối lượng thực hiện.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onSubmitSuccess(milestone.id, {
        completionPercent,
        summary,
        fileName: fileName || "Bao_cao_tien_do_dinh_ky.pdf"
      });
    }, 600);
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
          maxWidth: "640px",
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
            <div style={{ background: "#ecfdf5", color: "#065f46", padding: "8px", borderRadius: "8px" }}>
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Nộp Báo cáo Tiến độ Định kỳ
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                Mốc: {milestone.milestoneName}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          {errorMessage && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecdd3", color: "#b91c1c", fontSize: "12.5px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#334155", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div><strong>Đề tài:</strong> [{milestone.proposalCode}] {milestone.proposalTitle}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span><strong>Chủ nhiệm:</strong> {milestone.piName}</span>
              <span><strong>Đơn vị:</strong> {milestone.unitName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span><strong>Hạn nộp:</strong> {milestone.dueDate}</span>
              <span>
                <strong>Tình trạng: </strong>
                {milestone.daysRemaining < 0 ? (
                  <span style={{ color: "#be123c", fontWeight: 700 }}>Trễ hạn {Math.abs(milestone.daysRemaining)} ngày</span>
                ) : (
                  <span style={{ color: "#b45309", fontWeight: 700 }}>Còn {milestone.daysRemaining} ngày</span>
                )}
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Tiến độ khối lượng hoàn thành của mốc này (%) *
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={completionPercent}
                onChange={(e) => setCompletionPercent(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#064e3b" }}
              />
              <span style={{ width: "50px", textAlign: "center", fontWeight: 800, color: "#064e3b", background: "#ecfdf5", padding: "4px", borderRadius: "4px", border: "1px solid #a7f3d0", fontSize: "13px" }}>
                {completionPercent}%
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
              Tóm tắt kết quả nghiên cứu và nội dung đã triển khai *
            </label>
            <textarea
              rows={4}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Nêu rõ các nội dung công việc đã hoàn thành theo thuyết minh, sản phẩm đạt được (số liệu thử nghiệm, bệnh án nghiên cứu, chuyên đề, bài báo khoa học...)..."
              style={{ width: "100%", fontSize: "12.5px", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Khó khăn, vướng mắc phát sinh (nếu có)
              </label>
              <textarea
                rows={2}
                value={difficulties}
                onChange={(e) => setDifficulties(e.target.value)}
                placeholder="Mẫu bệnh phẩm, vật tư hóa chất..."
                style={{ width: "100%", fontSize: "12px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Kiến nghị & Đề xuất với Học viện
              </label>
              <textarea
                rows={2}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="Gia hạn, hỗ trợ thí nghiệm..."
                style={{ width: "100%", fontSize: "12px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
              Đính kèm Tệp Báo cáo Tiến độ (PDF, DOCX) *
            </label>
            <div
              style={{
                border: "2px dashed #cbd5e1",
                borderRadius: "8px",
                padding: "14px",
                textAlign: "center",
                background: "#f8fafc",
                cursor: "pointer"
              }}
            >
              <input
                type="file"
                id="milestone-file-input"
                style={{ display: "none" }}
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFileName(file.name);
                }}
              />
              <label htmlFor="milestone-file-input" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <Upload size={24} color="#64748b" />
                <span style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                  {fileName ? (
                    <span style={{ color: "#065f46", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle2 size={14} /> {fileName}
                    </span>
                  ) : (
                    "Bấm để chọn tệp báo cáo hoặc kéo thả vào đây (Mẫu 07/BC-KHQS)"
                  )}
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Hỗ trợ tệp PDF, Word dung lượng tối đa 25MB</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="button"
              style={{ background: "#064e3b", color: "#ffffff", display: "flex", alignItems: "center", gap: "6px" }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Đang gửi..."
              ) : (
                <>
                  <CheckCircle2 size={16} /> Xác nhận nộp báo cáo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
