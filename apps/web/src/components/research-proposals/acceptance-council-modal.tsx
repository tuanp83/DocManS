"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Award,
  Users,
  FileCheck,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Calendar,
  MapPin,
  Save,
  Check
} from "lucide-react";
import {
  AcceptanceCouncilMetadata,
  AcceptanceCouncilMember,
  CouncilCandidate,
  loadCouncilCandidates,
  proposeAcceptanceCouncil,
  approveAcceptanceCouncil,
  recordAcceptanceMinutes
} from "@/lib/proposal-evaluations-api";
import { exportAcceptanceMinutesWord, ProposalExportData } from "@/lib/word-export";
import "@/styles/council-modals.css";

interface AcceptanceCouncilModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: {
    id: string;
    code?: string;
    title: string;
    ownerDisplayName?: string;
    hostOrganizationUnit?: string;
    acceptanceCouncilMetadata?: AcceptanceCouncilMetadata | null;
  };
  currentUserRole?: string;
  currentUserUsername?: string;
  onSuccess?: () => void;
}

const ROLE_OPTIONS = [
  { value: "CHAIRMAN", label: "Chủ tịch Hội đồng" },
  { value: "SECRETARY", label: "Thư ký Hội đồng" },
  { value: "REVIEWER_1", label: "Ủy viên Phản biện 1" },
  { value: "REVIEWER_2", label: "Ủy viên Phản biện 2" },
  { value: "MEMBER", label: "Ủy viên Hội đồng" },
];

export function AcceptanceCouncilModal({
  isOpen,
  onClose,
  proposal,
  currentUserRole,
  currentUserUsername,
  onSuccess
}: AcceptanceCouncilModalProps) {
  const [activeTab, setActiveTab] = useState<"COUNCIL" | "EVALUATION">("COUNCIL");
  const [councilType, setCouncilType] = useState<"FACILITY" | "OFFICIAL">(
    proposal.acceptanceCouncilMetadata?.councilType || "OFFICIAL"
  );
  const [status, setStatus] = useState<"NONE" | "PROPOSED" | "ESTABLISHED" | "EVALUATED">(
    proposal.acceptanceCouncilMetadata?.status || "NONE"
  );

  // Candidates & COI
  const [candidates, setCandidates] = useState<CouncilCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<AcceptanceCouncilMember[]>(
    proposal.acceptanceCouncilMetadata?.members || []
  );

  // Council Approval Form
  const [decisionNumber, setDecisionNumber] = useState(
    proposal.acceptanceCouncilMetadata?.establishmentDecisionNumber || `QĐ-HVQY/2026/NT-${proposal.code?.slice(-3) || "01"}`
  );
  const [decisionDate, setDecisionDate] = useState(
    proposal.acceptanceCouncilMetadata?.decisionDate || new Date().toISOString().split("T")[0]
  );
  const [signerName, setSignerName] = useState(
    proposal.acceptanceCouncilMetadata?.decisionSignerName || "Trung tướng, GS. TS. Nguyễn Minh Phương"
  );

  // Evaluation Minutes Form
  const [meetingDate, setMeetingDate] = useState(
    proposal.acceptanceCouncilMetadata?.meetingDate || new Date().toISOString().split("T")[0]
  );
  const [meetingLocation, setMeetingLocation] = useState(
    proposal.acceptanceCouncilMetadata?.meetingLocation || "Phòng họp số 1 - Ban Quản lý Khoa học, Học viện Quân y"
  );
  const [reportScore, setReportScore] = useState<number>(
    proposal.acceptanceCouncilMetadata?.evaluationResult?.reportScore ?? 28
  );
  const [scientificScore, setScientificScore] = useState<number>(
    proposal.acceptanceCouncilMetadata?.evaluationResult?.scientificProductsScore ?? 27
  );
  const [trainingScore, setTrainingScore] = useState<number>(
    proposal.acceptanceCouncilMetadata?.evaluationResult?.trainingProductsScore ?? 14
  );
  const [practicalScore, setPracticalScore] = useState<number>(
    proposal.acceptanceCouncilMetadata?.evaluationResult?.militaryMedicalPracticalScore ?? 24
  );
  const [comments, setComments] = useState<string>(
    proposal.acceptanceCouncilMetadata?.evaluationResult?.assessmentComments ||
      "Đề tài hoàn thành xuất sắc các chỉ tiêu đề ra, sản phẩm có tính ứng dụng cao phục vụ công tác điều trị và chăm sóc sức khỏe bộ đội."
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isManagement = [
    "LEADERSHIP_APPROVAL_AUTHORITY",
    "DIVISION_HEAD",
    "DEPT_LEAD",
    "SYSTEM_ADMIN",
    "ADMIN"
  ].includes(currentUserRole || "") || ["tvtien", "nmphuong", "dmtrung", "admin"].includes(currentUserUsername || "");

  const totalScore = Number(reportScore) + Number(scientificScore) + Number(trainingScore) + Number(practicalScore);
  const classification = totalScore >= 90 ? "EXCELLENT" : totalScore >= 70 ? "PASSED" : "FAILED";

  useEffect(() => {
    if (isOpen) {
      loadCandidates();
    }
  }, [isOpen, proposal.id]);

  const loadCandidates = async () => {
    try {
      setLoadingCandidates(true);
      const res = await loadCouncilCandidates(proposal.id);
      if (res && res.candidates) {
        setCandidates(res.candidates);
      }
    } catch (err) {
      console.error("Failed to load council candidates", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAddMember = (candidate: CouncilCandidate) => {
    if (candidate.conflictSeverity === "BLOCKED_DIRECT_PARTICIPANT") {
      alert(`Xung đột lợi ích nghiêm trọng: ${candidate.conflictReason}. Không thể bổ sung vào Hội đồng!`);
      return;
    }
    if (selectedMembers.some(m => m.profileId === candidate.id)) return;

    let defaultRole: AcceptanceCouncilMember["role"] = "MEMBER";
    if (!selectedMembers.some(m => m.role === "CHAIRMAN")) defaultRole = "CHAIRMAN";
    else if (!selectedMembers.some(m => m.role === "SECRETARY")) defaultRole = "SECRETARY";
    else if (!selectedMembers.some(m => m.role === "REVIEWER_1")) defaultRole = "REVIEWER_1";
    else if (!selectedMembers.some(m => m.role === "REVIEWER_2")) defaultRole = "REVIEWER_2";

    setSelectedMembers([
      ...selectedMembers,
      {
        profileId: candidate.id,
        fullName: candidate.fullName,
        academicTitle: candidate.academicTitle,
        unit: candidate.unit,
        role: defaultRole,
        isConflicted: candidate.isConflicted,
        conflictReason: candidate.conflictReason
      }
    ]);
  };

  const handleRemoveMember = (profileId: string) => {
    setSelectedMembers(selectedMembers.filter(m => m.profileId !== profileId));
  };

  const handleRoleChange = (profileId: string, role: AcceptanceCouncilMember["role"]) => {
    setSelectedMembers(selectedMembers.map(m => (m.profileId === profileId ? { ...m, role } : m)));
  };

  const handlePropose = async () => {
    if (selectedMembers.length < 3) {
      setMessage({ type: "error", text: "Hội đồng nghiệm thu cần tối thiểu 3 thành viên (Chủ tịch, Thư ký, Phản biện)." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await proposeAcceptanceCouncil(proposal.id, {
        councilType,
        members: selectedMembers
      });
      if (res.success) {
        setStatus(res.acceptanceCouncil.status);
        setMessage({ type: "success", text: "Đã đề xuất danh sách Hội đồng nghiệm thu thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi khi đề xuất Hội đồng nghiệm thu" });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await approveAcceptanceCouncil(proposal.id, {
        decisionNumber,
        decisionDate,
        signerName
      });
      if (res.success) {
        setStatus(res.acceptanceCouncil.status);
        setMessage({ type: "success", text: "Thủ trưởng đã ký Quyết định thành lập Hội đồng nghiệm thu!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi khi phê duyệt Hội đồng" });
    } finally {
      setSaving(false);
    }
  };

  const handleRecordMinutes = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await recordAcceptanceMinutes(proposal.id, {
        meetingDate,
        meetingLocation,
        reportScore: Number(reportScore),
        scientificProductsScore: Number(scientificScore),
        trainingProductsScore: Number(trainingScore),
        militaryMedicalPracticalScore: Number(practicalScore),
        assessmentComments: comments
      });
      if (res.success) {
        setStatus(res.acceptanceCouncil.status);
        setMessage({ type: "success", text: "Đã ghi nhận kết quả và biên bản nghiệm thu thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi khi lưu biên bản nghiệm thu" });
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

    exportAcceptanceMinutesWord(exportData, {
      councilType,
      meetingDate,
      meetingLocation,
      establishmentDecisionNumber: decisionNumber,
      decisionSignerName: signerName,
      members: selectedMembers.map(m => ({
        fullName: m.fullName,
        academicTitle: m.academicTitle,
        unit: m.unit,
        role: ROLE_OPTIONS.find(r => r.value === m.role)?.label || m.role
      })),
      evaluationResult: {
        reportScore: Number(reportScore),
        scientificProductsScore: Number(scientificScore),
        trainingProductsScore: Number(trainingScore),
        militaryMedicalPracticalScore: Number(practicalScore),
        totalScore,
        classification,
        assessmentComments: comments
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd-modal">
        {/* Modal Header */}
        <div className="cmd-header">
          <div className="cmd-header-left">
            <div className="cmd-header-icon green">
              <Award size={22} />
            </div>
            <div>
              <h2 className="cmd-header-title">
                Hội đồng Nghiệm thu & Đánh giá kết quả NCKH
              </h2>
              <p className="cmd-header-subtitle">
                {proposal.code} - {proposal.title}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="cmd-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="cmd-tabs">
          <button
            onClick={() => setActiveTab("COUNCIL")}
            className={`cmd-tab-btn ${activeTab === "COUNCIL" ? "active" : ""}`}
          >
            <Users size={16} />
            Thành lập Hội đồng nghiệm thu
            {status !== "NONE" && (
              <span style={{ marginLeft: "6px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", padding: "2px 8px", borderRadius: "10px", fontSize: "10px" }}>
                {status === "PROPOSED" ? "Đã đề xuất" : status === "ESTABLISHED" ? "Đã thành lập" : "Đã nghiệm thu"}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("EVALUATION")}
            className={`cmd-tab-btn ${activeTab === "EVALUATION" ? "active" : ""}`}
          >
            <FileCheck size={16} />
            Đánh giá 4 tiêu chí & Biên bản nghiệm thu
            {status === "EVALUATED" && (
              <span style={{ marginLeft: "6px", background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", padding: "2px 8px", borderRadius: "10px", fontSize: "10px" }}>
                {totalScore} điểm
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="cmd-body">
          {message && (
            <div className={`cmd-alert ${message.type === "success" ? "success" : "error"}`}>
              {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span>{message.text}</span>
            </div>
          )}

          {activeTab === "COUNCIL" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Type Selection */}
              <div className="cmd-grid-2">
                <div className="cmd-form-group">
                  <label className="cmd-label">Cấp nghiệm thu</label>
                  <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="councilType"
                        checked={councilType === "FACILITY"}
                        onChange={() => setCouncilType("FACILITY")}
                      />
                      <span>Nghiệm thu cơ sở (Khoa/Ban)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", color: "#34d399", fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="councilType"
                        checked={councilType === "OFFICIAL"}
                        onChange={() => setCouncilType("OFFICIAL")}
                      />
                      <span>Nghiệm thu chính thức (Cấp Học viện)</span>
                    </label>
                  </div>
                </div>

                <div className="cmd-form-group">
                  <label className="cmd-label">Quyết định thành lập số</label>
                  <input
                    type="text"
                    value={decisionNumber}
                    onChange={e => setDecisionNumber(e.target.value)}
                    placeholder="VD: 128/QĐ-HVQY ngày 15/10/2026"
                    className="cmd-input"
                  />
                </div>
              </div>

              {/* Council Members Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={16} color="#34d399" />
                    Danh sách thành viên Hội đồng nghiệm thu ({selectedMembers.length})
                  </h3>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    Quy chuẩn: 5-7 thành viên, gồm Chủ tịch, Thư ký, 2 Phản biện, các Ủy viên.
                  </span>
                </div>

                {selectedMembers.length === 0 ? (
                  <div style={{ padding: "24px", border: "1px dashed #334155", borderRadius: "8px", textAlign: "center", fontSize: "13px", color: "#64748b" }}>
                    Chưa có thành viên nào được chọn. Hãy thêm chuyên gia từ danh sách bên dưới.
                  </div>
                ) : (
                  <div className="cmd-table-card">
                    <table className="cmd-table">
                      <thead>
                        <tr>
                          <th>Họ và tên</th>
                          <th>Học vị / Đơn vị</th>
                          <th>Vị trí Hội đồng</th>
                          <th>Kiểm tra COI</th>
                          <th style={{ textAlign: "right" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMembers.map(member => (
                          <tr key={member.profileId}>
                            <td style={{ fontWeight: 700 }}>{member.fullName}</td>
                            <td style={{ color: "#94a3b8" }}>
                              {member.academicTitle || "TS"} - {member.unit || "Học viện Quân y"}
                            </td>
                            <td>
                              <select
                                value={member.role}
                                onChange={e => handleRoleChange(member.profileId, e.target.value as any)}
                                className="cmd-select"
                                style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                              >
                                {ROLE_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              {member.isConflicted ? (
                                <span className="coi-badge-warning">
                                  <AlertTriangle size={12} />
                                  {member.conflictReason || "Cùng đơn vị"}
                                </span>
                              ) : (
                                <span className="coi-badge-clean">
                                  <Check size={12} />
                                  Hợp lệ (Không COI)
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                onClick={() => handleRemoveMember(member.profileId)}
                                style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px" }}
                              >
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Smart COI Candidate Selection */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldAlert size={16} color="#fbbf24" />
                    Chuyên gia khả dụng & Kiểm tra Xung đột lợi ích (Smart COI)
                  </h3>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    Tự động lọc Chủ nhiệm đề tài, Thành viên nghiên cứu, và Cảnh báo cùng đơn vị
                  </span>
                </div>

                {loadingCandidates ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    Đang tải danh sách chuyên gia...
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", maxHeight: "240px", overflowY: "auto", paddingRight: "4px" }}>
                    {candidates.map(cand => {
                      const isSelected = selectedMembers.some(m => m.profileId === cand.id);
                      const isBlocked = cand.conflictSeverity === "BLOCKED_DIRECT_PARTICIPANT";
                      const isWarning = cand.conflictSeverity === "WARNING_SAME_UNIT";

                      return (
                        <div
                          key={cand.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: isBlocked ? "1px solid #881337" : isWarning ? "1px solid #78350f" : "1px solid #334155",
                            background: isBlocked ? "rgba(136, 19, 55, 0.2)" : isWarning ? "rgba(120, 53, 15, 0.2)" : "rgba(30, 41, 59, 0.5)"
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontWeight: 700, fontSize: "13px", color: "#f8fafc" }}>{cand.fullName}</span>
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>({cand.academicTitle || "TS"})</span>
                            </div>
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>{cand.unit || "Học viện Quân y"}</span>
                            {isBlocked && (
                              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#fda4af", fontWeight: 600 }}>
                                <ShieldAlert size={12} /> {cand.conflictReason} (Cấm tham gia)
                              </span>
                            )}
                            {isWarning && (
                              <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#fde68a", fontWeight: 600 }}>
                                <AlertTriangle size={12} /> {cand.conflictReason} (Cần giải trình)
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleAddMember(cand)}
                            disabled={isSelected || isBlocked}
                            className={`cmd-btn ${isSelected ? "outline" : isBlocked ? "rose" : "primary"}`}
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                          >
                            {isSelected ? "Đã chọn" : isBlocked ? "Bị chặn" : "+ Thêm"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions for Tab 1 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #334155", paddingTop: "16px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={handlePropose}
                    disabled={saving || selectedMembers.length < 3}
                    className="cmd-btn primary"
                  >
                    <Save size={14} />
                    Đề xuất thành lập Hội đồng
                  </button>

                  {isManagement && (
                    <button
                      onClick={handleApprove}
                      disabled={saving || selectedMembers.length < 3}
                      className="cmd-btn blue"
                    >
                      <CheckCircle2 size={14} />
                      Phê duyệt QĐ thành lập (Thủ trưởng)
                    </button>
                  )}
                </div>

                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  Trạng thái: <strong style={{ color: "#ffffff" }}>{status}</strong>
                </span>
              </div>
            </div>
          )}

          {activeTab === "EVALUATION" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Meeting Info */}
              <div className="cmd-grid-2">
                <div className="cmd-form-group">
                  <label className="cmd-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={14} color="#34d399" />
                    Ngày họp nghiệm thu
                  </label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={e => setMeetingDate(e.target.value)}
                    className="cmd-input"
                  />
                </div>

                <div className="cmd-form-group">
                  <label className="cmd-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <MapPin size={14} color="#34d399" />
                    Địa điểm họp Hội đồng
                  </label>
                  <input
                    type="text"
                    value={meetingLocation}
                    onChange={e => setMeetingLocation(e.target.value)}
                    className="cmd-input"
                  />
                </div>
              </div>

              {/* 4 Standard Criteria Scoring */}
              <div style={{ border: "1px solid #334155", borderRadius: "10px", padding: "18px", background: "rgba(30, 41, 59, 0.4)", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "#ffffff" }}>
                    Chấm điểm 4 tiêu chí chuẩn Quân đội (Thông tư 57/2021/TT-BQP)
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#34d399" }}>
                    Thang điểm: 100
                  </span>
                </div>

                <div className="cmd-grid-2">
                  {/* Tiêu chí 1 */}
                  <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>1. Báo cáo tổng kết & tóm tắt</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#34d399" }}>{reportScore}/30 đ</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={reportScore}
                      onChange={e => setReportScore(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Cấu trúc báo cáo, phương pháp luận, số liệu thực nghiệm và độ tin cậy khoa học.
                    </span>
                  </div>

                  {/* Tiêu chí 2 */}
                  <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>2. Sản phẩm khoa học công bố</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#34d399" }}>{scientificScore}/30 đ</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={scientificScore}
                      onChange={e => setScientificScore(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Bài báo quốc tế Scopus/ISI, tạp chí ngành quân y, sáng chế, giải pháp hữu ích, sách.
                    </span>
                  </div>

                  {/* Tiêu chí 3 */}
                  <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>3. Đào tạo nhân lực khoa học</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#34d399" }}>{trainingScore}/15 đ</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={15}
                      value={trainingScore}
                      onChange={e => setTrainingScore(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Hướng dẫn NCS, Thạc sĩ, Bác sĩ Chuyên khoa II, đào tạo kíp kỹ thuật quân y chuyên sâu.
                    </span>
                  </div>

                  {/* Tiêu chí 4 */}
                  <div style={{ background: "#1e293b", padding: "14px", borderRadius: "8px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>4. Ứng dụng y dược quân sự</span>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#34d399" }}>{practicalScore}/25 đ</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={25}
                      value={practicalScore}
                      onChange={e => setPracticalScore(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#10b981", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      Ứng dụng điều trị tại BV 103, Viện Bỏng, y tế dã chiến, cứu trợ thảm họa và SSCĐ.
                    </span>
                  </div>
                </div>

                {/* Score Summary Banner */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "14px 20px", borderRadius: "8px", border: "1px solid #334155" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>TỔNG ĐIỂM HỘI ĐỒNG:</span>
                    <div style={{ fontSize: "26px", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "baseline", gap: "4px" }}>
                      {totalScore} <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 400 }}>/ 100 điểm</span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>XẾP LOẠI NGHIỆM THU:</span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 800,
                        background: classification === "EXCELLENT" ? "rgba(16, 185, 129, 0.2)" : classification === "PASSED" ? "rgba(59, 130, 246, 0.2)" : "rgba(244, 63, 94, 0.2)",
                        color: classification === "EXCELLENT" ? "#34d399" : classification === "PASSED" ? "#60a5fa" : "#fb7185",
                        border: classification === "EXCELLENT" ? "1px solid #059669" : classification === "PASSED" ? "1px solid #2563eb" : "1px solid #e11d48"
                      }}
                    >
                      {classification === "EXCELLENT" ? "XUẤT SẮC (≥ 90đ)" : classification === "PASSED" ? "ĐẠT (70 - 89đ)" : "KHÔNG ĐẠT (< 70đ)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Assessment Comments */}
              <div className="cmd-form-group">
                <label className="cmd-label">Nhận xét & Kết luận chung của Hội đồng</label>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  className="cmd-textarea"
                />
              </div>

              {/* Bottom Actions for Tab 2 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #334155", paddingTop: "16px" }}>
                <button
                  onClick={handleExportWord}
                  className="cmd-btn outline"
                >
                  <Download size={14} color="#60a5fa" />
                  Xuất Biên bản nghiệm thu (.doc)
                </button>

                <button
                  onClick={handleRecordMinutes}
                  disabled={saving}
                  className="cmd-btn primary"
                >
                  <Save size={14} />
                  Ghi nhận kết quả nghiệm thu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
