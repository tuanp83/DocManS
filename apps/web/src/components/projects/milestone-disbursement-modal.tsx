"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Save,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  Paperclip,
  Plus
} from "lucide-react";
import {
  DisbursementMetadata,
  DisbursementMilestone,
  DisbursementCostItem,
  MilestoneAttachment,
  fetchDisbursement,
  updateDisbursement
} from "@/lib/proposal-evaluations-api";
import { getApiBaseUrl } from "@/lib/session";
import "@/styles/council-modals.css";

interface MilestoneDisbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: {
    id: string;
    code?: string;
    title: string;
    ownerDisplayName?: string;
    totalBudget?: number;
    disbursementMetadata?: DisbursementMetadata | null;
  };
  currentUserRole?: string;
  currentUserUsername?: string;
  onSuccess?: () => void;
}

const DEFAULT_COST_ITEMS: DisbursementCostItem[] = [
  { code: "REMUNERATION", name: "1. Thù lao trực tiếp cho các nhà khoa học, chuyên gia", allocatedAmount: 180000000, spentAmount: 160000000, settledAmount: 160000000 },
  { code: "OUTSOURCING", name: "2. Thuê khoán chuyên môn, xét nghiệm y sinh, thử nghiệm lâm sàng", allocatedAmount: 150000000, spentAmount: 140000000, settledAmount: 140000000 },
  { code: "MATERIALS", name: "3. Mua sắm nguyên vật liệu, hóa chất, sinh phẩm y tế chuyên dụng", allocatedAmount: 120000000, spentAmount: 115000000, settledAmount: 110000000 },
  { code: "CONFERENCE_TRAVEL", name: "4. Hội thảo khoa học, công tác thực địa, điều tra dịch tễ", allocatedAmount: 30000000, spentAmount: 25000000, settledAmount: 25000000 },
  { code: "MANAGEMENT", name: "5. Chi phí quản lý chung, kiểm toán và nghiệm thu nhiệm vụ", allocatedAmount: 20000000, spentAmount: 18000000, settledAmount: 15000000 },
];

export function MilestoneDisbursementModal({
  isOpen,
  onClose,
  proposal,
  currentUserRole,
  currentUserUsername,
  onSuccess
}: MilestoneDisbursementModalProps) {
  // Check permission: ONLY Top Scientific Management
  const canManage =
    ["tvtien", "nmphuong", "dmtrung", "admin", "admin2"].includes(currentUserUsername || "") ||
    currentUserRole === "LEADERSHIP_APPROVAL_AUTHORITY";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [milestones, setMilestones] = useState<DisbursementMilestone[]>([]);
  const [costItems, setCostItems] = useState<DisbursementCostItem[]>(DEFAULT_COST_ITEMS);
  const [settlementStatus, setSettlementStatus] = useState<"PENDING" | "PARTIALLY_SETTLED" | "COMPLETED">("PENDING");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadDisbursementData();
    }
  }, [isOpen, proposal.id]);

  const loadDisbursementData = async () => {
    try {
      setLoading(true);
      const res = await fetchDisbursement(proposal.id);
      const budget = proposal.totalBudget || 500000000;
      const defaultMilestones: DisbursementMilestone[] = [
        { id: "M1", name: "Đợt 1: Tạm ứng kinh phí ban đầu", percentage: 40, expectedAmount: budget * 0.4, disbursedAmount: budget * 0.4, status: "DISBURSED", evidenceNotes: "UNC số 48/KB ngày 10/01/2026" },
        { id: "M2", name: "Đợt 2: Giải ngân sau đánh giá giữa kỳ", percentage: 40, expectedAmount: budget * 0.4, disbursedAmount: 0, status: "PENDING", evidenceNotes: "Chờ biên bản đánh giá giữa kỳ" },
        { id: "M3", name: "Đợt 3: Quyết toán kinh phí sau nghiệm thu", percentage: 20, expectedAmount: budget * 0.2, disbursedAmount: 0, status: "PENDING", evidenceNotes: "Sau nghiệm thu chính thức và thanh lý HĐ" }
      ];

      if (res && res.disbursement) {
        if (res.disbursement.milestones && res.disbursement.milestones.length > 0) {
          setMilestones(res.disbursement.milestones);
        } else {
          setMilestones(defaultMilestones);
        }
        if (res.disbursement.costItems && res.disbursement.costItems.length > 0) {
          setCostItems(res.disbursement.costItems);
        }
        setSettlementStatus(res.disbursement.settlementStatus || "PENDING");
      } else {
        setMilestones(defaultMilestones);
      }
    } catch (err) {
      console.error("Failed to load disbursement", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMilestoneChange = (index: number, field: keyof DisbursementMilestone, val: any) => {
    if (!canManage) return;
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: val };
    setMilestones(updated);
  };

  const handleCostItemChange = (index: number, field: keyof DisbursementCostItem, val: any) => {
    if (!canManage) return;
    const updated = [...costItems];
    updated[index] = { ...updated[index], [field]: Number(val) || 0 };
    setCostItems(updated);
  };

  const [uploadingMilestoneIndex, setUploadingMilestoneIndex] = useState<number | null>(null);

  const handleFileUpload = async (index: number, file: File) => {
    if (!canManage) return;
    setUploadingMilestoneIndex(index);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("relatedEntityType", "research_proposal");
      formData.set("relatedEntityId", proposal.id);
      formData.set("filePurpose", "disbursement_voucher");
      formData.set("originalFileName", file.name);
      formData.set("description", `Chứng từ giải ngân ${milestones[index]?.name || ""}`);
      formData.set("file", file);

      const response = await fetch(`${getApiBaseUrl()}/files`, {
        method: "POST",
        credentials: "include",
        body: formData
      });

      const body = (await response.json().catch(() => ({}))) as { message?: string; file?: { id: string; fileName: string; sizeBytes?: number } };
      if (!response.ok || !body.file) {
        throw new Error(body.message ?? "Không thể tải tệp lên.");
      }

      const newAtt: MilestoneAttachment = {
        id: body.file.id,
        fileName: body.file.fileName || file.name,
        fileSize: body.file.sizeBytes || file.size,
        uploadedAt: new Date().toISOString(),
        uploadedByName: currentUserUsername || "Cán bộ quản lý"
      };

      const updated = [...milestones];
      const existingAtts = updated[index].attachments || [];
      updated[index] = {
        ...updated[index],
        attachments: [...existingAtts, newAtt]
      };
      setMilestones(updated);
      setMessage({ type: "success", text: `Đã đính kèm chứng từ "${file.name}". Nhấn "Lưu thiết lập" để lưu lại.` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Lỗi khi tải file chứng từ." });
    } finally {
      setUploadingMilestoneIndex(null);
    }
  };

  const handleDeleteAttachment = (milestoneIndex: number, attachmentId: string) => {
    if (!canManage) return;
    const updated = [...milestones];
    const existingAtts = updated[milestoneIndex].attachments || [];
    updated[milestoneIndex] = {
      ...updated[milestoneIndex],
      attachments: existingAtts.filter((a) => a.id !== attachmentId)
    };
    setMilestones(updated);
    setMessage({ type: "success", text: "Đã gỡ bỏ chứng từ. Nhấn 'Lưu thiết lập' để cập nhật." });
  };

  const handleSave = async () => {
    if (!canManage) {
      setMessage({ type: "error", text: "Chỉ Trưởng phòng KHQS, Giám Đốc, Trưởng Ban QLKH mới có quyền cập nhật kinh phí." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateDisbursement(proposal.id, {
        milestones,
        costItems,
        settlementStatus,
        notes
      });
      if (res.success) {
        setMessage({ type: "success", text: "Đã cập nhật dữ liệu giải ngân & quyết toán theo mốc thành công!" });
        onSuccess?.();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Lỗi cập nhật giải ngân" });
    } finally {
      setSaving(false);
    }
  };

  const totalBudget = milestones.reduce((sum, m) => sum + (Number(m.expectedAmount) || 0), 0) || proposal.totalBudget || 500000000;
  const totalDisbursed = milestones.reduce((sum, m) => sum + (Number(m.disbursedAmount) || 0), 0);
  const totalSettled = costItems.reduce((sum, c) => sum + (Number(c.settledAmount) || 0), 0);
  const disbursementPercent = totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0;
  const settlementPercent = totalBudget > 0 ? Math.round((totalSettled / totalBudget) * 100) : 0;

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd-modal">
        {/* Header */}
        <div className="cmd-header">
          <div className="cmd-header-left">
            <div className="cmd-header-icon green">
              <DollarSign size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 className="cmd-header-title">
                  Giám sát Giải ngân & Quyết toán theo Mốc
                </h2>
                {canManage ? (
                  <span className="coi-badge-clean">
                    <ShieldCheck size={12} />
                    Thẩm quyền Quản lý Tài chính KHQS
                  </span>
                ) : (
                  <span className="coi-badge-warning">
                    <ShieldAlert size={12} />
                    Chế độ Chỉ Xem (Read-only)
                  </span>
                )}
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

        {/* Permission Notice */}
        {!canManage && (
          <div className="cmd-alert warning" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
            <AlertCircle size={16} />
            <span>
              <b>Lưu ý:</b> Quyền điều chỉnh kinh phí, duyệt mốc giải ngân và quyết toán chỉ dành riêng cho <b>Trưởng phòng KHQS (nmphuong)</b>, <b>Giám Đốc (tvtien)</b>, và <b>Trưởng Ban QLKH (dmtrung)</b>. Chuyên viên và chủ nhiệm chỉ có quyền theo dõi.
            </span>
          </div>
        )}

        {/* Body */}
        <div className="cmd-body">
          {message && (
            <div className={`cmd-alert ${message.type === "success" ? "success" : "error"}`}>
              {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Budget Overview KPI Cards */}
          <div className="cmd-grid-4">
            <div className="cmd-kpi-card">
              <span className="cmd-kpi-title">Tổng kinh phí phê duyệt</span>
              <div className="cmd-kpi-value">
                {totalBudget.toLocaleString("vi-VN")} <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}>VNĐ</span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b" }}>100% ngân sách đề tài</span>
            </div>

            <div className="cmd-kpi-card">
              <span className="cmd-kpi-title">Đã giải ngân</span>
              <div className="cmd-kpi-value" style={{ color: "#34d399" }}>
                {totalDisbursed.toLocaleString("vi-VN")} <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}>VNĐ</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <div style={{ flex: 1, height: "6px", background: "#334155", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(disbursementPercent, 100)}%`, height: "100%", background: "#10b981" }} />
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#34d399" }}>{disbursementPercent}%</span>
              </div>
            </div>

            <div className="cmd-kpi-card">
              <span className="cmd-kpi-title">Đã quyết toán</span>
              <div className="cmd-kpi-value" style={{ color: "#60a5fa" }}>
                {totalSettled.toLocaleString("vi-VN")} <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}>VNĐ</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <div style={{ flex: 1, height: "6px", background: "#334155", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(settlementPercent, 100)}%`, height: "100%", background: "#3b82f6" }} />
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#60a5fa" }}>{settlementPercent}%</span>
              </div>
            </div>

            <div className="cmd-kpi-card">
              <span className="cmd-kpi-title">Trạng thái quyết toán</span>
              <div style={{ marginTop: "4px" }}>
                <select
                  disabled={!canManage}
                  value={settlementStatus}
                  onChange={e => setSettlementStatus(e.target.value as any)}
                  className="cmd-select"
                  style={{ padding: "4px 8px", fontSize: "12px", fontWeight: 700 }}
                >
                  <option value="PENDING">Chờ quyết toán</option>
                  <option value="PARTIALLY_SETTLED">Quyết toán từng phần</option>
                  <option value="COMPLETED">Đã hoàn tất quyết toán</option>
                </select>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Thông tư 57/BQP</span>
            </div>
          </div>

          {/* Section 1: 3 Milestone Stages */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <TrendingUp size={16} color="#34d399" />
              Tiến độ 3 đợt mốc giải ngân theo hợp đồng NCKH
            </h3>

            <div className="cmd-table-card">
              <table className="cmd-table">
                <thead>
                  <tr>
                    <th>Mốc giải ngân</th>
                    <th style={{ textAlign: "center" }}>Tỷ lệ</th>
                    <th style={{ textAlign: "right" }}>Dự kiến (VNĐ)</th>
                    <th style={{ textAlign: "right" }}>Thực tế giải ngân (VNĐ)</th>
                    <th style={{ textAlign: "center" }}>Trạng thái</th>
                    <th>Căn cứ / Ghi chú & Chứng từ đính kèm</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m, idx) => (
                    <tr key={m.id}>
                      <td>
                        <span style={{ fontWeight: 700, display: "block" }}>{m.name}</span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          {idx === 0
                            ? "Tạm ứng sau khi ký hợp đồng NCKH"
                            : idx === 1
                            ? "Sau khi nghiệm thu nội dung chuyên môn giữa kỳ"
                            : "Sau khi nghiệm thu chính thức và thanh lý HĐ"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "#cbd5e1" }}>
                        {m.percentage}%
                      </td>
                      <td style={{ textAlign: "right", color: "#cbd5e1" }}>
                        {(Number(m.expectedAmount) || 0).toLocaleString("vi-VN")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {canManage ? (
                          <input
                            type="number"
                            value={m.disbursedAmount || 0}
                            onChange={e => handleMilestoneChange(idx, "disbursedAmount", Number(e.target.value))}
                            className="cmd-input"
                            style={{ width: "130px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "#34d399", padding: "4px 8px" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700, color: "#34d399" }}>
                            {(Number(m.disbursedAmount) || 0).toLocaleString("vi-VN")}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {canManage ? (
                          <select
                            value={m.status}
                            onChange={e => handleMilestoneChange(idx, "status", e.target.value)}
                            className="cmd-select"
                            style={{ padding: "4px 8px", fontSize: "11px", width: "auto" }}
                          >
                            <option value="PENDING">Chưa cấp</option>
                            <option value="DISBURSED">Đã giải ngân</option>
                            <option value="SETTLED">Đã quyết toán</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: m.status === "SETTLED" ? "rgba(59, 130, 246, 0.2)" : m.status === "DISBURSED" ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)",
                              color: m.status === "SETTLED" ? "#60a5fa" : m.status === "DISBURSED" ? "#34d399" : "#94a3b8"
                            }}
                          >
                            {m.status === "SETTLED" ? "Đã quyết toán" : m.status === "DISBURSED" ? "Đã giải ngân" : "Chưa cấp"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {canManage ? (
                            <input
                              type="text"
                              value={m.evidenceNotes || ""}
                              onChange={e => handleMilestoneChange(idx, "evidenceNotes", e.target.value)}
                              placeholder="Số UNC, biên bản giao nhận..."
                              className="cmd-input"
                              style={{ fontSize: "12px", padding: "4px 8px" }}
                            />
                          ) : (
                            <span style={{ fontSize: "12px", color: "#94a3b8" }}>{m.evidenceNotes || "—"}</span>
                          )}

                          {/* Danh sách chứng từ đính kèm */}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="cmd-attachment-list">
                              {m.attachments.map((att) => (
                                <div key={att.id} className="cmd-attachment-chip">
                                  <Paperclip size={11} color="#38bdf8" />
                                  <a
                                    href={`${getApiBaseUrl()}/files/${att.id}/download`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`Tải về: ${att.fileName}`}
                                  >
                                    {att.fileName.length > 22 ? att.fileName.slice(0, 20) + "..." : att.fileName}
                                  </a>
                                  {canManage && (
                                    <button
                                      type="button"
                                      className="cmd-attachment-del"
                                      onClick={() => handleDeleteAttachment(idx, att.id)}
                                      title="Gỡ bỏ tệp này"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Nút Upload chứng từ */}
                          {canManage && (
                            <div>
                              <label className="cmd-upload-btn">
                                <Plus size={11} />
                                <span>{uploadingMilestoneIndex === idx ? "Đang tải lên..." : "Đính kèm UNC / Chứng từ"}</span>
                                <input
                                  type="file"
                                  style={{ display: "none" }}
                                  disabled={uploadingMilestoneIndex !== null}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      void handleFileUpload(idx, file);
                                    }
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: 5 Military Science Cost Categories */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
              <Layers size={16} color="#34d399" />
              Chi tiết 5 mục chi tài chính NCKH Quân đội (Dự toán & Quyết toán)
            </h3>

            <div className="cmd-table-card">
              <table className="cmd-table">
                <thead>
                  <tr>
                    <th>Mục chi tài chính</th>
                    <th style={{ textAlign: "right" }}>Dự toán phê duyệt (VNĐ)</th>
                    <th style={{ textAlign: "right" }}>Kinh phí đã chi (VNĐ)</th>
                    <th style={{ textAlign: "right" }}>Kinh phí đã quyết toán (VNĐ)</th>
                  </tr>
                </thead>
                <tbody>
                  {costItems.map((item, idx) => (
                    <tr key={item.code}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ textAlign: "right", color: "#cbd5e1" }}>
                        {item.allocatedAmount.toLocaleString("vi-VN")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {canManage ? (
                          <input
                            type="number"
                            value={item.spentAmount}
                            onChange={e => handleCostItemChange(idx, "spentAmount", e.target.value)}
                            className="cmd-input"
                            style={{ width: "130px", textAlign: "right", fontSize: "12px", padding: "4px 8px" }}
                          />
                        ) : (
                          <span>{item.spentAmount.toLocaleString("vi-VN")}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {canManage ? (
                          <input
                            type="number"
                            value={item.settledAmount}
                            onChange={e => handleCostItemChange(idx, "settledAmount", e.target.value)}
                            className="cmd-input"
                            style={{ width: "130px", textAlign: "right", fontSize: "12px", padding: "4px 8px", color: "#60a5fa", fontWeight: 700 }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700, color: "#60a5fa" }}>{item.settledAmount.toLocaleString("vi-VN")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#1e293b", fontWeight: 800 }}>
                    <td>TỔNG CỘNG CÁC MỤC CHI:</td>
                    <td style={{ textAlign: "right" }}>
                      {costItems.reduce((s, c) => s + c.allocatedAmount, 0).toLocaleString("vi-VN")}
                    </td>
                    <td style={{ textAlign: "right", color: "#34d399" }}>
                      {costItems.reduce((s, c) => s + c.spentAmount, 0).toLocaleString("vi-VN")}
                    </td>
                    <td style={{ textAlign: "right", color: "#60a5fa" }}>
                      {costItems.reduce((s, c) => s + c.settledAmount, 0).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cmd-footer">
          <button onClick={onClose} className="cmd-btn outline">
            Đóng
          </button>

          {canManage && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="cmd-btn primary"
            >
              <Save size={14} />
              Lưu cập nhật Giải ngân & Quyết toán
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
