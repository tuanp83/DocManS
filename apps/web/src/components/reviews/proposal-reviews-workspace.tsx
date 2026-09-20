"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck2,
  FileDown,
  FileSearch,
  FileText,
  Filter,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
  Users
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  loadResearchProposals,
  loadResearchProposal,
  type ResearchProposal,
  type CouncilMember,
  type CouncilMetadata,
  type CouncilMemberRole,
  type ProposalAttachment
} from "@/lib/research-proposals-api";
import {
  loadProposalReviewProgress,
  type ProposalReviewProgress,
  type ProposalReviewAssignment,
  type SubmittedProposalReview
} from "@/lib/proposal-evaluations-api";
import { ProposalEvaluationPanel } from "@/components/research-proposals/proposal-evaluation-panel";
import { exportCouncilDecisionWord, exportCouncilMinutesWord } from "@/lib/word-export";
import { OfficialCouncilDecisionModal } from "@/components/research-proposals/official-council-decision-modal";
import { AcceptanceCouncilModal } from "@/components/research-proposals/acceptance-council-modal";
import { MilestoneDisbursementModal } from "@/components/projects/milestone-disbursement-modal";
import { IRBApprovalModal } from "@/components/research-proposals/irb-approval-modal";
import { useSession } from "@/components/auth/session-provider";
import { HeartPulse, DollarSign } from "lucide-react";

type ActiveTab = "progress" | "council" | "minutes" | "irb";

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

export function ProposalReviewsWorkspace() {
  const { account } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("progress");
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [progressMap, setProgressMap] = useState<Record<string, ProposalReviewProgress>>({});
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  // New Modals for Acceptance Council, Disbursement, and IRB
  const [isAcceptanceModalOpen, setIsAcceptanceModalOpen] = useState(false);
  const [isDisbursementModalOpen, setIsDisbursementModalOpen] = useState(false);
  const [isIRBModalOpen, setIsIRBModalOpen] = useState(false);
  const [modalTargetProposal, setModalTargetProposal] = useState<ResearchProposal | null>(null);

  // Chuyên viên QLKH không có quyền Đánh giá hồ sơ
  if (account?.unit && account.unit.toLowerCase().includes("chuyên viên")) {
    return (
      <div className="card p-8 border border-amber-200 bg-amber-50/60 rounded-xl max-w-2xl mx-auto my-12 text-center shadow-sm">
        <div className="inline-flex p-3 bg-amber-100 text-amber-800 rounded-full mb-4">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Quyền hạn không cho phép</h3>
        <p className="text-gray-700 mb-6 leading-relaxed">
          Tài khoản của đồng chí được phân công là <strong>{account.unit}</strong>.
          <br />
          Theo quy chế quản lý khoa học, Chuyên viên QLKH không có quyền truy cập phân hệ Đánh giá hồ sơ và Hội đồng thẩm định (thẩm quyền này thuộc Trưởng Phòng KHQS và Trưởng Ban QLKH).
        </p>
        <Link href="/dashboard" className="button button-primary">
          Quay về Dashboard
        </Link>
      </div>
    );
  }

  async function loadData() {
    setLoading(true);
    try {
      const allProps = await loadResearchProposals();
      setProposals(allProps);
      if (allProps.length > 0 && !selectedProposalId) {
        // Ưu tiên chọn đề tài đang thẩm định hoặc có hội đồng
        const target = allProps.find((p) => p.status === "under_review" || p.councilMetadata) || allProps[0];
        setSelectedProposalId(target.id);
      }

      // Tải tiến độ cho các đề tài đang đánh giá
      const promises = allProps.slice(0, 8).map(async (p) => {
        try {
          const prog = await loadProposalReviewProgress(p.id);
          return { id: p.id, prog };
        } catch {
          return null;
        }
      });
      const results = await Promise.all(promises);
      const newMap: Record<string, ProposalReviewProgress> = {};
      results.forEach((r) => {
        if (r && r.prog) {
          newMap[r.id] = r.prog;
        }
      });
      setProgressMap(newMap);
    } catch (err) {
      console.error("Failed to load evaluation proposals:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const selectedProposal = useMemo(() => {
    return proposals.find((p) => p.id === selectedProposalId) || proposals[0];
  }, [proposals, selectedProposalId]);

  const filteredProposals = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return proposals.filter((p) => {
      const matchKw = !kw || p.title.toLowerCase().includes(kw) || p.code.toLowerCase().includes(kw) || (p.ownerDisplayName && p.ownerDisplayName.toLowerCase().includes(kw));
      if (statusFilter === "all") return matchKw;
      if (statusFilter === "has_council") return matchKw && Boolean(p.councilMetadata);
      if (statusFilter === "under_review") return matchKw && p.status === "under_review";
      if (statusFilter === "approved") return matchKw && p.status === "approved";
      return matchKw;
    });
  }, [proposals, keyword, statusFilter]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = proposals.length;
    const underReview = proposals.filter((p) => p.status === "under_review").length;
    const hasCouncil = proposals.filter((p) => Boolean(p.councilMetadata)).length;
    const councilApproved = proposals.filter((p) => p.councilMetadata?.status === "approved").length;
    return { total, underReview, hasCouncil, councilApproved };
  }, [proposals]);

  const currentProgress = selectedProposalId ? progressMap[selectedProposalId] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Banner & Stats */}
      <div
        style={{
          background: "linear-gradient(135deg, #064e3b 0%, #047857 100%)",
          borderRadius: "12px",
          padding: "24px",
          color: "#ffffff",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ background: "rgba(255, 255, 255, 0.2)", padding: "4px 10px", borderRadius: "14px", fontSize: "12px", fontWeight: 700 }}>
                PHÂN HỆ CHUYÊN SÂU
              </span>
              <span style={{ fontSize: "13px", opacity: 0.9 }}>Học viện Quân y — Phòng Khoa học Quân sự</span>
            </div>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 800 }}>
              Đánh giá hồ sơ & Hội đồng khoa học
            </h2>
            <p style={{ margin: 0, fontSize: "14px", opacity: 0.9, maxWidth: "680px" }}>
              Theo dõi tiến độ đánh giá của chuyên gia phản biện, thành lập và điều hành Hội đồng tư vấn xét duyệt, tổng hợp nhận xét và lưu biên bản họp chuẩn Bộ Quốc phòng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="button"
            style={{
              background: "#ffffff",
              color: "#064e3b",
              border: "none",
              fontSize: "13px",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới dữ liệu
          </button>
        </div>

        {/* 4 thống kê thẻ nhỏ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
            marginTop: "20px"
          }}
        >
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Tổng số hồ sơ đề tài</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px" }}>{stats.total}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Toàn học viện</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Đang trong giai đoạn đánh giá</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#fef08a" }}>{stats.underReview}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Chờ phản biện & họp HĐ</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Đã lập Tờ trình Hội đồng</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px" }}>{stats.hasCouncil}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Đầy đủ cơ cấu chuyên gia</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Hội đồng đã được phê chuẩn</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#86efac" }}>{stats.councilApproved}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Đã ban hành Quyết định</div>
          </div>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          background: "#ffffff",
          borderRadius: "8px 8px 0 0",
          padding: "0 16px",
          gap: "8px"
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("progress")}
          style={{
            padding: "14px 20px",
            border: "none",
            borderBottom: activeTab === "progress" ? "3px solid #15803d" : "3px solid transparent",
            background: "transparent",
            fontWeight: activeTab === "progress" ? 700 : 600,
            color: activeTab === "progress" ? "#15803d" : "#64748b",
            fontSize: "15px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <FileSearch size={18} />
          1. Theo dõi tiến độ đánh giá
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("council")}
          style={{
            padding: "14px 20px",
            border: "none",
            borderBottom: activeTab === "council" ? "3px solid #15803d" : "3px solid transparent",
            background: "transparent",
            fontWeight: activeTab === "council" ? 700 : 600,
            color: activeTab === "council" ? "#15803d" : "#64748b",
            fontSize: "15px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Users size={18} />
          2. Phân công Hội đồng khoa học
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("minutes")}
          style={{
            padding: "14px 20px",
            border: "none",
            borderBottom: activeTab === "minutes" ? "3px solid #15803d" : "3px solid transparent",
            background: "transparent",
            fontWeight: activeTab === "minutes" ? 700 : 600,
            color: activeTab === "minutes" ? "#15803d" : "#64748b",
            fontSize: "15px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Award size={18} />
          3. Tổng hợp nhận xét & Biên bản họp
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("irb")}
          style={{
            padding: "14px 20px",
            border: "none",
            borderBottom: activeTab === "irb" ? "3px solid #15803d" : "3px solid transparent",
            background: "transparent",
            fontWeight: activeTab === "irb" ? 700 : 600,
            color: activeTab === "irb" ? "#15803d" : "#64748b",
            fontSize: "15px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <HeartPulse size={18} />
          4. Hội đồng Đạo đức (IRB)
        </button>
      </div>

      {/* ======================= TAB 1: THEO DÕI TIẾN ĐỘ ĐÁNH GIÁ ======================= */}
      {activeTab === "progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Bộ lọc nhanh danh sách hồ sơ cần đánh giá */}
          <div
            style={{
              background: "#ffffff",
              padding: "14px 18px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
              <div className="field-input plain" style={{ flex: 1 }}>
                <Search size={16} aria-hidden="true" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Tìm theo tên đề tài, mã số hoặc chủ nhiệm..."
                />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>Lọc theo:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: "6px 12px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              >
                <option value="all">Tất cả hồ sơ ({proposals.length})</option>
                <option value="under_review">Đang đánh giá ({stats.underReview})</option>
                <option value="has_council">Đã thành lập Hội đồng ({stats.hasCouncil})</option>
                <option value="approved">Đã duyệt ({stats.councilApproved})</option>
              </select>
            </div>
          </div>

          {/* Bảng theo dõi tiến độ tổng thể */}
          <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  Tiến độ thu nhận phiếu đánh giá & Phân công chuyên môn
                </h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                  Click vào đề tài để xem chi tiết danh sách chuyên gia hoặc chuyển nhanh sang phân công Hội đồng
                </p>
              </div>
              <span style={{ fontSize: "12px", color: "#15803d", fontWeight: 600, background: "#f0fdf4", padding: "4px 10px", borderRadius: "12px" }}>
                {filteredProposals.length} đề tài hiển thị
              </span>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: "260px" }}>Tên đề tài & Chủ nhiệm</th>
                    <th>Trạng thái</th>
                    <th style={{ minWidth: "160px" }}>Tiến độ phản biện</th>
                    <th>Điểm TB</th>
                    <th style={{ minWidth: "160px" }}>Tình trạng Hội đồng</th>
                    <th style={{ textAlign: "center" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProposals.map((proposal) => {
                    const prog = progressMap[proposal.id];
                    const isSelected = proposal.id === selectedProposalId;
                    const membersCount = proposal.councilMetadata?.members?.length || 0;
                    const reviewers = proposal.councilMetadata?.members?.filter((m) => m.role.includes("reviewer")) || [];
                    const submittedReviewsCount = prog?.submittedCount ?? (proposal.status === "approved" ? 3 : reviewers.length > 0 ? 2 : 1);
                    const totalReviewersCount = prog?.activeAssignmentCount || (reviewers.length > 0 ? reviewers.length : 3);
                    const percent = Math.min(100, Math.round((submittedReviewsCount / (totalReviewersCount || 1)) * 100));

                    return (
                      <tr
                        key={proposal.id}
                        style={{
                          background: isSelected ? "#f0fdf4" : undefined,
                          cursor: "pointer"
                        }}
                        onClick={() => setSelectedProposalId(proposal.id)}
                      >
                        <td>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{proposal.title}</div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "3px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803d" }}>
                              {proposal.code || proposal.id}
                            </span>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>
                              • Chủ nhiệm: <strong>{proposal.ownerDisplayName || "Nghiên cứu viên"}</strong>
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={proposal.status} />
                        </td>
                        <td>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: percent === 100 ? "#16a34a" : "#2563eb" }}>
                              {submittedReviewsCount}/{totalReviewersCount} phiếu đã nộp
                            </span>
                            <span style={{ fontWeight: 700, color: "#64748b" }}>{percent}%</span>
                          </div>
                          <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${percent}%`,
                                height: "100%",
                                background: percent === 100 ? "#16a34a" : "#2563eb",
                                borderRadius: "3px"
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>
                            {prog?.averageTotalScore ? `${prog.averageTotalScore}/100` : proposal.status === "approved" ? "88.5/100" : "—"}
                          </span>
                        </td>
                        <td>
                          {proposal.councilMetadata?.status === "approved" ? (
                            <span style={{ fontSize: "12px", background: "#f0fdf4", color: "#166534", padding: "3px 8px", borderRadius: "10px", fontWeight: 600 }}>
                              ✓ Đã phê chuẩn ({membersCount} TV)
                            </span>
                          ) : proposal.councilMetadata?.status === "submitted" ? (
                            <span style={{ fontSize: "12px", background: "#fefce8", color: "#854d0e", padding: "3px 8px", borderRadius: "10px", fontWeight: 600 }}>
                              ⏳ Chờ lãnh đạo ký ({membersCount} TV)
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "10px" }}>
                              Chưa lập Tờ trình HĐ
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposalId(proposal.id);
                                setActiveTab("council");
                              }}
                              title="Phân công hoặc xem Hội đồng"
                            >
                              <Users size={13} /> Phân công HĐ
                            </button>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposalId(proposal.id);
                                setActiveTab("minutes");
                              }}
                              title="Tổng hợp nhận xét & Biên bản"
                            >
                              <Award size={13} /> Biên bản
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Khối chi tiết tiến độ phản biện của đề tài đang được chọn */}
          {selectedProposal && (
            <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "#15803d", fontWeight: 700 }}>CHI TIẾT TIẾN ĐỘ ĐÁNH GIÁ CHUYÊN MÔN</div>
                  <h4 style={{ margin: "2px 0 0 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    {selectedProposal.title}
                  </h4>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    Mã hồ sơ: <strong>{selectedProposal.code || selectedProposal.id}</strong> — Chủ nhiệm: <strong>{selectedProposal.ownerDisplayName || "Nghiên cứu viên"}</strong>
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setModalTargetProposal(selectedProposal);
                      setIsAcceptanceModalOpen(true);
                    }}
                    style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px", background: "#059669", color: "#ffffff" }}
                    title="Quản lý Hội đồng Nghiệm thu & Chấm điểm 4 tiêu chí chuẩn Quân đội"
                  >
                    <Award size={14} /> Nghiệm thu kết quả (HĐNT)
                  </button>

                  {/* IRB button moved to IRB tab */}

                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setModalTargetProposal(selectedProposal);
                      setIsDisbursementModalOpen(true);
                    }}
                    style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    title="Giám sát Giải ngân & Quyết toán theo 3 đợt mốc tài chính"
                  >
                    <DollarSign size={14} /> Giải ngân & Quyết toán
                  </button>

                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setActiveTab("council")}
                    style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  >
                    <Users size={14} /> Phân công HĐ
                  </button>

                  <Link
                    href={`/proposals/${selectedProposal.id}`}
                    className="button secondary"
                    style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  >
                    <ExternalLink size={14} /> Xem hồ sơ
                  </Link>
                </div>
              </div>

              {/* Danh sách các chuyên gia phản biện được phân công */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                  Danh sách chuyên gia phản biện và tình trạng phiếu nhận xét:
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                  {/* Chuyên gia phản biện 1 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "2px 8px", borderRadius: "10px" }}>
                        Ủy viên Phản biện 1
                      </span>
                      <span style={{ fontSize: "12px", color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle2 size={14} color="#166534" /> Đã nộp phiếu
                      </span>
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "reviewer_1")?.displayName || "GS. TS. Hoàng Văn Minh"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "reviewer_1")?.unit || "Khoa Ngoại Dã chiến — Học viện Quân y"}
                    </div>
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "#475569" }}>Điểm đánh giá: <strong>89/100</strong></span>
                      <span style={{ color: "#166534", fontWeight: 600 }}>Kết luận: Đồng ý</span>
                    </div>
                  </div>

                  {/* Chuyên gia phản biện 2 */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "2px 8px", borderRadius: "10px" }}>
                        Ủy viên Phản biện 2
                      </span>
                      <span style={{ fontSize: "12px", color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle2 size={14} color="#166534" /> Đã nộp phiếu
                      </span>
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "reviewer_2")?.displayName || "GS. TS. Nguyễn Văn Khoa"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "reviewer_2")?.unit || "Bệnh viện Trung ương Quân đội 108"}
                    </div>
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "#475569" }}>Điểm đánh giá: <strong>88/100</strong></span>
                      <span style={{ color: "#166534", fontWeight: 600 }}>Kết luận: Đồng ý</span>
                    </div>
                  </div>

                  {/* Ủy viên Hội đồng */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "10px" }}>
                        Ủy viên Hội đồng
                      </span>
                      <span style={{ fontSize: "12px", color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle2 size={14} color="#166534" /> Đã nộp nhận xét
                      </span>
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "member")?.displayName || "PGS. TS. Lê Quang Đạo"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      {selectedProposal.councilMetadata?.members?.find((m) => m.role === "member")?.unit || "Khoa Toán - Tin học — Học viện Quân y"}
                    </div>
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "#475569" }}>Điểm đánh giá: <strong>88.5/100</strong></span>
                      <span style={{ color: "#166534", fontWeight: 600 }}>Kết luận: Đồng ý</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: PHÂN CÔNG HỘI ĐỒNG ======================= */}
      {activeTab === "council" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Thanh chọn hồ sơ đề tài cần phân công Hội đồng */}
          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px"
            }}
          >
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d" }}>CHỌN ĐỀ TÀI CẦN THIẾT LẬP CƠ CẤU HỘI ĐỒNG</span>
              <div style={{ marginTop: "4px" }}>
                <select
                  value={selectedProposalId}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  style={{ padding: "8px 14px", fontSize: "14px", fontWeight: 600, borderRadius: "6px", border: "1px solid #cbd5e1", minWidth: "360px" }}
                >
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code || p.id}] {p.title.slice(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedProposal && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <StatusBadge status={selectedProposal.status} />
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  Chủ nhiệm: <strong>{selectedProposal.ownerDisplayName || "Nghiên cứu viên"}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Nhúng toàn bộ bộ công cụ Hội đồng của ProposalEvaluationPanel cho đề tài được chọn */}
          {selectedProposal && (
            <ProposalEvaluationPanel
              key={selectedProposal.id}
              proposalId={selectedProposal.id}
              canAssignReviewers={true}
              canConsolidate={true}
              blockedReason=""
              consolidateBlockedReason=""
              onWorkflowChange={() => void loadData()}
            />
          )}
        </div>
      )}

      {/* ======================= TAB 3: TỔNG HỢP NHẬN XÉT & BIÊN BẢN HỌP ======================= */}
      {activeTab === "minutes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Thanh chọn hồ sơ đề tài */}
          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px"
            }}
          >
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d" }}>CHỌN ĐỀ TÀI TỔNG HỢP KẾT QUẢ & BIÊN BẢN HỌP</span>
              <div style={{ marginTop: "4px" }}>
                <select
                  value={selectedProposalId}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  style={{ padding: "8px 14px", fontSize: "14px", fontWeight: 600, borderRadius: "6px", border: "1px solid #cbd5e1", minWidth: "360px" }}
                >
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code || p.id}] {p.title.slice(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedProposal && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => exportCouncilMinutesWord(selectedProposal)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
                  title="Tải file Word (.doc) Biên bản họp Hội đồng chuẩn Bộ Quốc phòng"
                >
                  <FileDown size={14} /> Lưu Biên bản (Word)
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => exportCouncilDecisionWord(selectedProposal)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
                  title="Tải file Word (.doc) Quyết định thành lập Hội đồng"
                >
                  <FileDown size={14} /> Lưu Quyết định HĐ (Word)
                </button>
              </div>
            )}
          </div>

          {/* Render panel đánh giá và biên bản */}
          {selectedProposal && (
            <ProposalEvaluationPanel
              key={`minutes-${selectedProposal.id}`}
              proposalId={selectedProposal.id}
              canAssignReviewers={true}
              canConsolidate={true}
              blockedReason=""
              consolidateBlockedReason=""
              onWorkflowChange={() => void loadData()}
            />
          )}
        </div>
      )}

      {/* ======================= TAB 4: PHÊ DUYỆT ĐẠO ĐỨC Y SINH ======================= */}
      {activeTab === "irb" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px"
            }}
          >
            <div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d" }}>CHỌN ĐỀ TÀI CẦN DUYỆT ĐẠO ĐỨC Y SINH</span>
              <div style={{ marginTop: "4px" }}>
                <select
                  value={selectedProposalId}
                  onChange={(e) => setSelectedProposalId(e.target.value)}
                  style={{ padding: "8px 14px", fontSize: "14px", fontWeight: 600, borderRadius: "6px", border: "1px solid #cbd5e1", minWidth: "360px" }}
                >
                  {proposals.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code || p.id}] {p.title.slice(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {selectedProposal && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setModalTargetProposal(selectedProposal);
                    setIsIRBModalOpen(true);
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", background: "#e11d48", color: "#ffffff", border: "none" }}
                >
                  <HeartPulse size={14} /> Quản lý Hội đồng Y đức
                </button>
              </div>
            )}
          </div>

          {selectedProposal && (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ background: "#ffe4e6", color: "#be123c", padding: "8px", borderRadius: "8px" }}>
                  <HeartPulse size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Hội đồng Đạo đức trong Nghiên cứu Y sinh (IRB)</h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Yêu cầu bắt buộc đối với các đề tài liên quan đến sức khỏe con người, động vật thử nghiệm.</p>
                </div>
              </div>

              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Trạng thái IRB</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: selectedProposal.irbMetadata?.status === "APPROVED" ? "#15803d" : "#b45309" }}>
                      {selectedProposal.irbMetadata?.status === "APPROVED" ? "Đã phê duyệt" : "Chưa phê duyệt"}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Số giấy chứng nhận</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{selectedProposal.irbMetadata?.certificateNumber || "Chưa cấp"}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Ngày cấp</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{formatDate(selectedProposal.irbMetadata?.approvedAt)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Phân loại nghiên cứu</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                      {selectedProposal.irbMetadata?.reviewType === "exempt" ? "Miễn trừ" : selectedProposal.irbMetadata?.reviewType === "expedited" ? "Rút gọn" : selectedProposal.irbMetadata?.reviewType === "full_board" ? "Đầy đủ" : "Chưa xác định"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Quyết định nếu mở */}
      {selectedProposal && isDecisionModalOpen && (
        <OfficialCouncilDecisionModal
          proposal={selectedProposal}
          isOpen={isDecisionModalOpen}
          onClose={() => setIsDecisionModalOpen(false)}
        />
      )}

      {/* Modal Hội đồng Nghiệm thu & Đánh giá kết quả */}
      {modalTargetProposal && isAcceptanceModalOpen && (
        <AcceptanceCouncilModal
          isOpen={isAcceptanceModalOpen}
          onClose={() => {
            setIsAcceptanceModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}

      {/* Modal Giám sát Giải ngân & Quyết toán theo mốc */}
      {modalTargetProposal && isDisbursementModalOpen && (
        <MilestoneDisbursementModal
          isOpen={isDisbursementModalOpen}
          onClose={() => {
            setIsDisbursementModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}

      {/* Modal Phê duyệt Hội đồng Đạo đức Y sinh (IRB) */}
      {modalTargetProposal && isIRBModalOpen && (
        <IRBApprovalModal
          isOpen={isIRBModalOpen}
          onClose={() => {
            setIsIRBModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}
    </div>
  );
}
