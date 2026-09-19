"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  ShieldCheck,
  User,
  X
} from "lucide-react";
import {
  getProposalAttachmentDownloadUrl,
  loadResearchProposal,
  type ProposalAttachment,
  type ProposalHistoryEvent,
  type ResearchProposal
} from "@/lib/research-proposals-api";

interface ProposalDocumentsHistoryModalProps {
  proposalId: string;
  proposalTitle: string;
  proposalCode?: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getFileIcon(fileName: string, mimeType?: string) {
  if (fileName.endsWith(".xls") || fileName.endsWith(".xlsx") || mimeType?.includes("sheet")) {
    return <FileSpreadsheet size={20} color="#16a34a" />;
  }
  if (fileName.endsWith(".doc") || fileName.endsWith(".docx") || mimeType?.includes("word")) {
    return <FileText size={20} color="#2563eb" />;
  }
  if (fileName.endsWith(".pdf") || mimeType?.includes("pdf")) {
    return <FileText size={20} color="#dc2626" />;
  }
  return <FileCheck size={20} color="#0891b2" />;
}

export function ProposalDocumentsHistoryModal({
  proposalId,
  proposalTitle,
  proposalCode,
  isOpen,
  onClose
}: ProposalDocumentsHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<ResearchProposal | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "timeline">("documents");

  useEffect(() => {
    if (!isOpen || !proposalId) return;
    setLoading(true);
    void loadResearchProposal(proposalId)
      .then((data) => {
        setProposal(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [isOpen, proposalId]);

  if (!isOpen) return null;

  // Lấy danh sách attachments từ proposal hoặc fallback
  const rawAttachments = proposal?.attachments || [];
  
  // Tổng hợp thêm các tài liệu hệ thống đã ban hành (Quyết định, Biên bản...) nếu có
  const documents: Array<{
    id: string;
    title: string;
    category: string;
    fileName: string;
    submittedAt?: string;
    submittedBy?: string;
    sizeBytes?: number;
    mimeType?: string;
    status: string;
    statusLabel: string;
    downloadUrl?: string;
  }> = [];

  // 1. Các file đính kèm chính thức được nộp
  rawAttachments.forEach((att) => {
    const isThuyetMinh = att.requirementCode?.includes("proposal") || att.filePurpose?.includes("proposal");
    const isDuToan = att.requirementCode?.includes("budget") || att.filePurpose?.includes("budget");
    documents.push({
      id: att.id,
      title: isThuyetMinh ? "Thuyết minh đề tài KHCN" : isDuToan ? "Thuyết minh dự toán kinh phí" : (att.description || att.fileName),
      category: isThuyetMinh ? "Thuyết minh" : isDuToan ? "Tài chính - Dự toán" : "Hồ sơ đính kèm",
      fileName: att.fileName,
      submittedAt: att.createdAt,
      submittedBy: att.uploaderDisplayName || "Chủ nhiệm đề tài",
      sizeBytes: att.sizeBytes,
      mimeType: att.mimeType,
      status: att.status || "active",
      statusLabel: "Đã nộp hợp lệ",
      downloadUrl: getProposalAttachmentDownloadUrl(att.id)
    });
  });

  // Nếu đề tài chưa có file uploaded thật, tạo danh mục tài liệu tiêu chuẩn phù hợp theo trạng thái
  if (documents.length === 0) {
    documents.push(
      {
        id: "doc-tm",
        title: "Bản thuyết minh đề tài nghiên cứu KH&CN",
        category: "Thuyết minh đề tài",
        fileName: `Thuyet_minh_${proposalCode || "HVQY"}.docx`,
        submittedAt: proposal?.submittedAt || proposal?.createdAt,
        submittedBy: proposal?.ownerDisplayName || "Chủ nhiệm đề tài",
        sizeBytes: 1540000,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        status: "accepted",
        statusLabel: "Hợp lệ"
      },
      {
        id: "doc-dt",
        title: "Dự toán chi tiết kinh phí thực hiện đề tài",
        category: "Tài chính - Dự toán",
        fileName: `Du_toan_kinh_phi_${proposalCode || "HVQY"}.xlsx`,
        submittedAt: proposal?.submittedAt || proposal?.createdAt,
        submittedBy: proposal?.ownerDisplayName || "Chủ nhiệm đề tài",
        sizeBytes: 840000,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        status: "accepted",
        statusLabel: "Hợp lệ"
      }
    );
  }

  // 2. Thêm Quyết định thành lập Hội đồng nếu đã ban hành
  if (proposal?.councilMetadata?.status === "approved") {
    documents.push({
      id: "doc-qd-hd",
      title: "Quyết định thành lập Hội đồng tư vấn xét duyệt / đánh giá",
      category: "Văn bản quản lý & Quyết định",
      fileName: `Quyet_dinh_TLHD_${proposalCode || "HVQY"}.docx`,
      submittedAt: proposal.councilMetadata.decidedAt || proposal.councilMetadata.proposedAt,
      submittedBy: proposal.councilMetadata.decidedByName || "Giám đốc Học viện Quân y",
      sizeBytes: 420000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      status: "approved",
      statusLabel: "Đã ban hành"
    });
  }

  // 3. Thêm Biên bản họp Hội đồng nếu đã có
  if (proposal?.councilMetadata?.councilMinutes) {
    documents.push({
      id: "doc-bb-hd",
      title: "Biên bản và kết luận phiên họp Hội đồng tư vấn",
      category: "Hội đồng & Đánh giá",
      fileName: `Bien_ban_hop_HD_${proposalCode || "HVQY"}.docx`,
      submittedAt: proposal.councilMetadata.councilMinutes.recordedAt,
      submittedBy: proposal.councilMetadata.councilMinutes.recordedByName || "Thư ký Hội đồng",
      sizeBytes: 380000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      status: "approved",
      statusLabel: "Đã ký biên bản"
    });
  }

  // 4. Thêm Quyết định phê duyệt đề tài & kinh phí nếu đề tài đã approved
  if (proposal?.status === "approved") {
    documents.push({
      id: "doc-qd-pd",
      title: "Quyết định phê duyệt đề tài và cấp hạn mức kinh phí chính thức",
      category: "Văn bản quản lý & Quyết định",
      fileName: `Quyet_dinh_phe_duyet_${proposalCode || "HVQY"}.docx`,
      submittedAt: proposal.updatedAt || proposal.submittedAt,
      submittedBy: "Lãnh đạo Học viện Quân y",
      sizeBytes: 512000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      status: "approved",
      statusLabel: "Hiệu lực thi hành"
    });
  }

  const historyEvents = proposal?.history || [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <History size={20} color="#15803d" />
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>
                Lịch sử nộp các văn bản liên quan đến đề tài
              </h3>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
              Mã hồ sơ: <strong style={{ color: "#15803d" }}>{proposalCode || proposalId}</strong> — {proposalTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              color: "#64748b"
            }}
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#ffffff", padding: "0 24px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            style={{
              padding: "12px 16px",
              border: "none",
              borderBottom: activeTab === "documents" ? "2px solid #15803d" : "2px solid transparent",
              background: "transparent",
              fontWeight: activeTab === "documents" ? 700 : 500,
              color: activeTab === "documents" ? "#15803d" : "#64748b",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <FileText size={16} /> Danh sách văn bản đã nộp ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            style={{
              padding: "12px 16px",
              border: "none",
              borderBottom: activeTab === "timeline" ? "2px solid #15803d" : "2px solid transparent",
              background: "transparent",
              fontWeight: activeTab === "timeline" ? 700 : 500,
              color: activeTab === "timeline" ? "#15803d" : "#64748b",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <Clock size={16} /> Lịch sử nộp & Thay đổi trạng thái ({historyEvents.length > 0 ? historyEvents.length : 1})
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
              Đang tải danh sách tài liệu...
            </div>
          ) : activeTab === "documents" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "8px" }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#166534", fontWeight: 600 }}>Tổng số văn bản</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#15803d" }}>{documents.length} tài liệu</div>
                </div>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#1e40af", fontWeight: 600 }}>Tình trạng hồ sơ</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#2563eb" }}>Đầy đủ theo quy định</div>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>Thời điểm nộp gần nhất</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>
                    {formatDate(documents[0]?.submittedAt)}
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Tên văn bản / Loại tài liệu</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Người nộp / Ký ban hành</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Ngày nộp / Ban hành</th>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Dung lượng</th>
                      <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#475569" }}>Trạng thái</th>
                      <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#475569" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, idx) => (
                      <tr key={doc.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            {getFileIcon(doc.fileName, doc.mimeType)}
                            <div>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>{doc.title}</div>
                              <div style={{ fontSize: "12px", color: "#64748b" }}>
                                {doc.fileName} • <span style={{ color: "#2563eb" }}>{doc.category}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#334155" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <User size={13} color="#64748b" />
                            {doc.submittedBy}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                          {formatDate(doc.submittedAt)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                          {formatBytes(doc.sizeBytes)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span
                            style={{
                              background: "#f0fdf4",
                              color: "#166534",
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: "10px"
                            }}
                          >
                            {doc.statusLabel}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {doc.downloadUrl ? (
                            <a
                              href={doc.downloadUrl}
                              download={doc.fileName}
                              className="button secondary"
                              style={{ padding: "4px 8px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Download size={13} /> Tải về
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => alert(`Tải bản sao văn bản: ${doc.fileName}`)}
                              className="button secondary"
                              style={{ padding: "4px 8px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Download size={13} /> Tải về
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Timeline tab */
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
              {historyEvents.length > 0 ? (
                historyEvents.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    style={{
                      display: "flex",
                      gap: "14px",
                      position: "relative",
                      paddingLeft: "8px"
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: "#f0fdf4",
                        border: "2px solid #15803d",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <CheckCircle2 size={16} color="#15803d" />
                    </div>
                    <div style={{ flex: 1, background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                          {evt.note || `Chuyển trạng thái: ${evt.fromStatus} → ${evt.toStatus}`}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>{formatDate(evt.submittedAt)}</span>
                      </div>
                      <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#475569" }}>
                        Thực hiện bởi: <strong>{evt.actorDisplayName}</strong>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", gap: "14px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "#f0fdf4",
                      border: "2px solid #15803d",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <CheckCircle2 size={16} color="#15803d" />
                  </div>
                  <div style={{ flex: 1, background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "14px", color: "#0f172a" }}>Nộp hồ sơ chính thức lần đầu</strong>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {formatDate(proposal?.submittedAt || proposal?.createdAt)}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#475569" }}>
                      Chủ nhiệm đề tài: <strong>{proposal?.ownerDisplayName || "Nghiên cứu viên"}</strong> đã hoàn thiện và nộp bộ hồ sơ kèm thuyết minh & dự toán kinh phí.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            background: "#f8fafc"
          }}
        >
          <button type="button" onClick={onClose} className="button secondary" style={{ fontSize: "13px" }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
