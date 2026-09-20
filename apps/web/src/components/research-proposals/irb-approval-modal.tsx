"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  HeartPulse,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Save,
  CheckCircle2,
  Calendar,
  Download,
  FileText,
  UserCheck,
  Users
} from "lucide-react";
import {
  IRBMetadata,
  fetchIRBInfo,
  proposeIrbCouncil,
  approveIrbCouncil,
  submitIrbReview,
  updateIRBStatus,
  IRBMember
} from "@/lib/proposal-evaluations-api";
import { exportIrbCertificateWord, ProposalExportData } from "@/lib/word-export";
import "@/styles/council-modals.css";

interface IRBApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: {
    id: string;
    code?: string;
    title: string;
    ownerDisplayName?: string;
    hostOrganizationUnit?: string;
    irbMetadata?: IRBMetadata | null;
  };
  currentUserRole?: string;
  currentUserUsername?: string;
  onSuccess?: () => void;
}

export function IRBApprovalModal({
  isOpen,
  onClose,
  proposal,
  currentUserRole,
  currentUserUsername,
  onSuccess
}: IRBApprovalModalProps) {
  const isScientificManagement = ["nmphuong", "dmtrung", "admin", "admin2"].includes(currentUserUsername || "") || currentUserRole === "SCIENTIFIC_MANAGEMENT";
  const isLeadership = ["tvtien", "admin", "admin2"].includes(currentUserUsername || "") || currentUserRole === "LEADERSHIP_APPROVAL_AUTHORITY";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [irbData, setIrbData] = useState<IRBMetadata | null>(null);
  
  // Council Form State
  const [councilMembers, setCouncilMembers] = useState<IRBMember[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserRole, setNewUserRole] = useState("Ủy viên");
  
  // Review Form State
  const [reviewComment, setReviewComment] = useState("");
  const [reviewRecommendation, setReviewRecommendation] = useState("Đồng ý thông qua");

  // Certificate Form State
  const [certificateStatus, setCertificateStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [riskLevel, setRiskLevel] = useState<"MINIMAL" | "LOW" | "HIGH">("LOW");
  const [ethicsNotes, setEthicsNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadIRBData();
    }
  }, [isOpen, proposal.id]);

  const loadIRBData = async () => {
    try {
      setLoading(true);
      const res = await fetchIRBInfo(proposal.id);
      if (res && res.irb) {
        setIrbData(res.irb);
        if (res.irb.council?.members) {
          setCouncilMembers(res.irb.council.members);
        }
        if (res.irb.certificate) {
          setCertificateStatus(res.irb.certificate.status);
          setCertificateNumber(res.irb.certificate.certificateNumber || "");
          setApprovalDate(res.irb.certificate.decisionDate || "");
          setValidUntil(res.irb.certificate.validUntil || "");
          setRiskLevel((res.irb.certificate.riskLevel as any) || "LOW");
          setEthicsNotes(res.irb.certificate.ethicsNotes || "");
        } else {
          setCertificateNumber(`IRB-HVQY-2026-${proposal.code?.slice(-3) || "088"}`);
          setApprovalDate(new Date().toISOString().split("T")[0]);
          setValidUntil("2027-12-31");
          setEthicsNotes("Nghiên cứu can thiệp y dược học đáp ứng đầy đủ các tiêu chuẩn đạo đức theo Hướng dẫn Quốc gia và Tuyên ngôn Helsinki.");
        }
      }
    } catch (err) {
      console.error("Failed to load IRB info", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    if (newUserId && newUserDisplayName) {
      setCouncilMembers([...councilMembers, { userId: newUserId, displayName: newUserDisplayName, role: newUserRole }]);
      setNewUserId("");
      setNewUserDisplayName("");
    }
  };

  const handleProposeCouncil = async () => {
    if (!isScientificManagement) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await proposeIrbCouncil(proposal.id, councilMembers, "");
      if (res.success) {
        setIrbData(res.irb);
        setMessage({ type: "success", text: "Trình danh sách Hội đồng Y đức thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi lưu hội đồng" });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCouncil = async () => {
    if (!isLeadership) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await approveIrbCouncil(proposal.id);
      if (res.success) {
        setIrbData(res.irb);
        setMessage({ type: "success", text: "Phê duyệt Hội đồng Y đức thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi duyệt hội đồng" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await submitIrbReview(proposal.id, { comment: reviewComment, recommendation: reviewRecommendation });
      if (res.success) {
        setIrbData(res.irb);
        setMessage({ type: "success", text: "Gửi nhận xét thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi gửi nhận xét" });
    } finally {
      setSaving(false);
    }
  };

  const handleIssueCertificate = async () => {
    if (!isScientificManagement && !isLeadership) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateIRBStatus(proposal.id, {
        status: certificateStatus,
        certificateNumber,
        decisionDate: approvalDate,
        validUntil,
        riskLevel,
        ethicsNotes,
      });
      if (res.success) {
        setIrbData(res.irb);
        setMessage({ type: "success", text: "Đã cấp/cập nhật Giấy chứng nhận IRB thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi cấp chứng nhận" });
    } finally {
      setSaving(false);
    }
  };

  const handleExportWord = () => {
    const exportData: ProposalExportData = {
      code: proposal.code || "HVQY-NCKH",
      title: proposal.title,
      ownerDisplayName: proposal.ownerDisplayName || "Chủ nhiệm đề tài",
      hostOrganizationUnit: proposal.hostOrganizationUnit || "Học viện Quân y"
    };

    exportIrbCertificateWord(exportData, {
      certificateNumber,
      approvalDate,
      validUntil,
      riskLevel,
      councilPresident: "GS. TS. Nguyễn Minh Phương",
      ethicsNotes
    });
  };

  if (!isOpen) return null;

  const councilStatus = irbData?.council?.status || "draft";
  const hasCertificate = !!irbData?.certificate;

  return (
    <div className="cmd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd-modal" style={{ maxWidth: "900px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="cmd-header" style={{ flexShrink: 0 }}>
          <div className="cmd-header-left">
            <div className="cmd-header-icon rose">
              <HeartPulse size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 className="cmd-header-title">
                  Quản lý Hội đồng Đạo đức Y sinh (IRB)
                </h2>
              </div>
              <p className="cmd-header-subtitle">
                {proposal.code} - {proposal.title}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="cmd-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="cmd-body" style={{ overflowY: "auto", flex: 1 }}>
          {message && (
            <div className={`cmd-alert ${message.type === "success" ? "success" : "error"}`}>
              {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Section 1: Phân công Hội đồng */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
              <Users size={16} color="#475569" />
              1. Danh sách Hội đồng IRB
              <span style={{ marginLeft: "auto", fontSize: "12px", background: councilStatus === "approved" ? "#dcfce7" : councilStatus === "submitted" ? "#fef08a" : "#e2e8f0", color: councilStatus === "approved" ? "#166534" : "#854d0e", padding: "2px 8px", borderRadius: "4px" }}>
                {councilStatus === "draft" ? "Đang soạn" : councilStatus === "submitted" ? "Chờ duyệt" : "Đã phê duyệt"}
              </span>
            </h3>
            
            {councilStatus === "draft" && isScientificManagement && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input type="text" placeholder="ID User" value={newUserId} onChange={e => setNewUserId(e.target.value)} className="cmd-input" style={{ width: "120px" }} />
                <input type="text" placeholder="Họ tên nhà khoa học" value={newUserDisplayName} onChange={e => setNewUserDisplayName(e.target.value)} className="cmd-input" style={{ flex: 1 }} />
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className="cmd-select" style={{ width: "150px" }}>
                  <option value="Chủ tịch">Chủ tịch</option>
                  <option value="Ủy viên phản biện">Ủy viên phản biện</option>
                  <option value="Ủy viên">Ủy viên</option>
                  <option value="Thư ký">Thư ký</option>
                </select>
                <button type="button" onClick={handleAddMember} className="cmd-btn outline">Thêm</button>
              </div>
            )}
            
            {councilMembers.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
                    <th style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Vai trò</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Tên thành viên</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Tài khoản</th>
                  </tr>
                </thead>
                <tbody>
                  {councilMembers.map((m, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "8px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>{m.role}</td>
                      <td style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>{m.displayName}</td>
                      <td style={{ padding: "8px", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>{m.userId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#64748b", fontSize: "14px" }}>Chưa có thành viên nào.</p>
            )}

            <div style={{ marginTop: "12px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              {councilStatus === "draft" && isScientificManagement && (
                <button onClick={handleProposeCouncil} disabled={saving || councilMembers.length === 0} className="cmd-btn rose">
                  Trình duyệt Hội đồng
                </button>
              )}
              {councilStatus === "submitted" && isLeadership && (
                <button onClick={handleApproveCouncil} disabled={saving} className="cmd-btn rose">
                  Giám đốc phê duyệt Hội đồng
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Nhận xét của thành viên */}
          {councilStatus === "approved" && (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                <FileText size={16} color="#475569" />
                2. Phiếu nhận xét của Hội đồng
              </h3>
              
              {irbData?.reviews && irbData.reviews.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                  {irbData.reviews.map((r, idx) => (
                    <div key={idx} style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{r.reviewerName}</span>
                        <span style={{ fontSize: "12px", color: "#15803d", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>{r.recommendation}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>{r.comment}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "16px" }}>Chưa có nhận xét nào.</p>
              )}

              {/* Form nhận xét nếu là thành viên */}
              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "12px" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Form Nhập nhận xét (Dành cho thành viên HĐ)</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <select value={reviewRecommendation} onChange={e => setReviewRecommendation(e.target.value)} className="cmd-select">
                    <option value="Đồng ý thông qua">Đồng ý thông qua</option>
                    <option value="Thông qua có sửa chữa">Thông qua có sửa chữa</option>
                    <option value="Không thông qua">Không thông qua</option>
                  </select>
                  <textarea 
                    rows={3} 
                    placeholder="Nội dung nhận xét về mặt đạo đức..." 
                    value={reviewComment} 
                    onChange={e => setReviewComment(e.target.value)} 
                    className="cmd-textarea" 
                  />
                  <div style={{ alignSelf: "flex-end" }}>
                    <button onClick={handleSubmitReview} disabled={saving} className="cmd-btn outline">Gửi Nhận xét</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Cấp giấy chứng nhận */}
          {councilStatus === "approved" && (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                <ShieldCheck size={16} color="#e11d48" />
                3. Quyết định & Cấp Chứng nhận IRB
                {hasCertificate && (
                  <span style={{ marginLeft: "auto", fontSize: "12px", background: certificateStatus === "APPROVED" ? "#dcfce7" : "#fee2e2", color: certificateStatus === "APPROVED" ? "#166534" : "#991b1b", padding: "2px 8px", borderRadius: "4px" }}>
                    {certificateStatus === "APPROVED" ? "Đã cấp chứng nhận" : "Bị từ chối"}
                  </span>
                )}
              </h3>
              
              <div className="cmd-grid-2" style={{ marginBottom: "12px" }}>
                <div className="cmd-form-group">
                  <label className="cmd-label">Trạng thái phê duyệt</label>
                  <select disabled={!isScientificManagement && !isLeadership} value={certificateStatus} onChange={e => setCertificateStatus(e.target.value as any)} className="cmd-select">
                    <option value="APPROVED">Chấp thuận (Cấp giấy)</option>
                    <option value="REJECTED">Từ chối chấp thuận</option>
                  </select>
                </div>
                <div className="cmd-form-group">
                  <label className="cmd-label">Số Giấy chứng nhận IRB</label>
                  <input type="text" disabled={!isScientificManagement && !isLeadership} value={certificateNumber} onChange={e => setCertificateNumber(e.target.value)} className="cmd-input" />
                </div>
                <div className="cmd-form-group">
                  <label className="cmd-label">Ngày cấp</label>
                  <input type="date" disabled={!isScientificManagement && !isLeadership} value={approvalDate} onChange={e => setApprovalDate(e.target.value)} className="cmd-input" />
                </div>
                <div className="cmd-form-group">
                  <label className="cmd-label">Có hiệu lực đến</label>
                  <input type="date" disabled={!isScientificManagement && !isLeadership} value={validUntil} onChange={e => setValidUntil(e.target.value)} className="cmd-input" />
                </div>
                <div className="cmd-form-group">
                  <label className="cmd-label">Phân loại rủi ro</label>
                  <select disabled={!isScientificManagement && !isLeadership} value={riskLevel} onChange={e => setRiskLevel(e.target.value as any)} className="cmd-select">
                    <option value="MINIMAL">Rủi ro tối thiểu (Minimal)</option>
                    <option value="LOW">Rủi ro thấp (Low)</option>
                    <option value="HIGH">Rủi ro cao (High)</option>
                  </select>
                </div>
              </div>

              <div className="cmd-form-group">
                <label className="cmd-label">Kết luận thẩm định</label>
                <textarea disabled={!isScientificManagement && !isLeadership} rows={2} value={ethicsNotes} onChange={e => setEthicsNotes(e.target.value)} className="cmd-textarea" />
              </div>

              <div style={{ marginTop: "12px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                {hasCertificate && (
                  <button onClick={handleExportWord} className="cmd-btn outline">Xuất Giấy chứng nhận IRB (.doc)</button>
                )}
                {(isScientificManagement || isLeadership) && (
                  <button onClick={handleIssueCertificate} disabled={saving} className="cmd-btn rose">
                    Lưu Quyết Định IRB
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cmd-footer" style={{ flexShrink: 0 }}>
          <button onClick={onClose} className="cmd-btn outline">Đóng</button>
        </div>
      </div>
    </div>
  );
}

