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
  assignProposalManagementOfficer,
  blockedProposalAction,
  canPerformProposalAction,
  getProposalCapabilityState,
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
import { PortfolioManager } from "@/components/reviews/portfolio-manager";
import { loadCoordinationOverview, loadPortfolios, type CoordinationRow, type PortfolioOfficer } from "@/lib/evaluation-coordination-api";
import { exportCouncilDecisionWord, exportCouncilMinutesWord } from "@/lib/word-export";
import { OfficialCouncilDecisionModal } from "@/components/research-proposals/official-council-decision-modal";
import { IRBApprovalModal } from "@/components/research-proposals/irb-approval-modal";
import { ProposalAuditTimeline } from "@/components/research-proposals/proposal-audit-timeline";
import { useSession } from "@/components/auth/session-provider";
import { HeartPulse } from "lucide-react";
import { useAskReason } from "@/components/ui/confirm-dialog";

const IRB_COUNCIL_LABELS: Record<string, string> = { draft: "Đang soạn / mời", submitted: "Đang trình", returned: "Bị trả lại", rejected: "Ban giám đốc trả lại", approved: "Đã ký thành lập" };
const IRB_CONCLUSION_LABELS: Record<string, string> = { draft: "Thư ký đang soạn", finalized: "Chờ chuyên viên trình", submitted: "Đang trình ký", returned: "Bị trả lại", signed: "Đã ký" };

type ActiveTab = "progress" | "council" | "minutes" | "irb" | "audit" | "portfolio";

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

/** Quyền thao tác của bảng đánh giá lấy từ capability máy chủ trả về cho hồ sơ, không mặc định "được phép". */
function evaluationPanelPermissions(proposal: ResearchProposal) {
  const state = getProposalCapabilityState(proposal);
  return {
    canAssignReviewers: canPerformProposalAction(state, "proposal.review.assign"),
    canConsolidate: canPerformProposalAction(state, "proposal.review.consolidate"),
    canFinalize: canPerformProposalAction(state, "proposal.review.finalize"),
    canSubmitPackage: canPerformProposalAction(state, "proposal.review.submit-package"),
    blockedReason: blockedProposalAction(state, "proposal.review.assign")?.reason ?? state.reason ?? "",
    consolidateBlockedReason: blockedProposalAction(state, "proposal.review.consolidate")?.reason ?? state.reason ?? "",
    contextVersion: proposal.viewerAuthorization?.contextVersion
  };
}

export function ProposalReviewsWorkspace() {
  const { account } = useSession();

  // Trang điều phối dành cho Trưởng phòng (mọi hồ sơ trong phạm vi đơn vị) và chuyên viên QLKH (hồ sơ mình phụ
  // trách, giao theo mảng). Kiểm tra ở component bọc ngoài, trước mọi hook của màn hình chính.
  if (account && !["RESEARCH_MANAGEMENT_HEAD", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_BOARD_HEAD", "RESEARCH_MANAGEMENT_STAFF"].includes(account.systemRole)) {
    return (
      <div className="callout warning" role="status" style={{ maxWidth: 640, margin: "48px auto", display: "grid", gap: 12, justifyItems: "start" }}>
        <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={20} aria-hidden="true" />
          Trang dành cho Phòng Khoa học quân sự
        </h3>
        <p style={{ margin: 0 }}>
          Trang điều phối đánh giá dành cho Trưởng phòng, Phó phòng, Trưởng ban và chuyên viên quản lý khoa học. Lãnh đạo xem và quyết định hồ sơ ở trang Phê duyệt.
        </p>
        <Link href="/dashboard" className="button primary">
          Quay về Dashboard
        </Link>
      </div>
    );
  }

  return <ReviewsWorkspaceContent />;
}

function ReviewsWorkspaceContent() {
  const askReason = useAskReason();
  const { account } = useSession();
  const [activeTab, setActiveTab] = useState<ActiveTab>("progress");
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [overview, setOverview] = useState<CoordinationRow[]>([]);
  const [viewerRole, setViewerRole] = useState<"head" | "department" | "officer">("officer");
  const [loadError, setLoadError] = useState("");
  const [officerOptions, setOfficerOptions] = useState<PortfolioOfficer[]>([]);
  const [officerChanging, setOfficerChanging] = useState("");
  const [officerMessage, setOfficerMessage] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [officerFilter, setOfficerFilter] = useState("all");
  const [detail, setDetail] = useState<{ id: string; state: "loading" | "ready" | "error"; progress?: ProposalReviewProgress; error?: string } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  // New Modals for Acceptance Council, Disbursement, and IRB
  const [isIRBModalOpen, setIsIRBModalOpen] = useState(false);
  const [modalTargetProposal, setModalTargetProposal] = useState<ResearchProposal | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      // Tổng quan do máy chủ lọc theo người xem: Trưởng phòng thấy mọi hồ sơ trong phạm vi, chuyên viên thấy hồ sơ
      // mình phụ trách. Danh sách hồ sơ đầy đủ chỉ dùng cho các tab thao tác, và chỉ gồm những hồ sơ đó.
      const [coordination, allProps] = await Promise.all([loadCoordinationOverview(), loadResearchProposals()]);
      setOverview(coordination.proposals);
      setViewerRole(coordination.viewerRole);
      const visible = new Set(coordination.proposals.map((row) => row.id));
      const scoped = allProps.filter((proposal) => visible.has(proposal.id));
      setProposals(scoped);
      setLoadError("");
      if (scoped.length > 0 && !scoped.some((proposal) => proposal.id === selectedProposalId)) {
        const target = scoped.find((p) => p.status === "under_review") || scoped[0];
        setSelectedProposalId(target.id);
      }
      if (coordination.viewerRole === "head") {
        loadPortfolios().then((list) => setOfficerOptions(list.officers)).catch(() => setOfficerOptions([]));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Không tải được danh sách hồ sơ cần điều phối.");
    } finally {
      setLoading(false);
    }
  }

  /** Trưởng phòng đổi chuyên viên phụ trách một hồ sơ (máy chủ kiểm tra lại phạm vi và xung đột). */
  async function changeOfficer(proposalId: string, officerUserId: string) {
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!officerUserId || !proposal) return;
    const reason = await askReason(`Giao chuyên viên phụ trách hồ sơ "${proposal.title}".`, { label: "Lý do giao/đổi chuyên viên", defaultValue: "Trưởng phòng giao phụ trách hồ sơ", confirmLabel: "Giao phụ trách" });
    if (!reason) return;
    setOfficerChanging(proposalId);
    setOfficerMessage("");
    try {
      await assignProposalManagementOfficer(proposalId, { officerUserId, reason: reason.trim(), contextVersion: proposal.viewerAuthorization?.contextVersion });
      setOfficerMessage("Đã giao chuyên viên phụ trách hồ sơ.");
      await loadData();
    } catch (err) {
      setOfficerMessage(err instanceof Error ? err.message : "Không giao được chuyên viên phụ trách.");
    } finally {
      setOfficerChanging("");
    }
  }

  // Tiến độ chi tiết của hồ sơ đang chọn: tải khi chọn, có trạng thái lỗi rõ ràng (không "Đang tải…" mãi).
  useEffect(() => {
    if (!selectedProposalId) return;
    let cancelled = false;
    setDetail({ id: selectedProposalId, state: "loading" });
    loadProposalReviewProgress(selectedProposalId)
      .then((progress) => { if (!cancelled) setDetail({ id: selectedProposalId, state: "ready", progress }); })
      .catch((err) => { if (!cancelled) setDetail({ id: selectedProposalId, state: "error", error: err instanceof Error ? err.message : "Không tải được tiến độ đánh giá." }); });
    return () => { cancelled = true; };
  }, [selectedProposalId, overview]);

  useEffect(() => {
    void loadData();
  }, []);

  const selectedProposal = useMemo(() => {
    return proposals.find((p) => p.id === selectedProposalId) || proposals[0];
  }, [proposals, selectedProposalId]);

  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return overview.filter((row) => {
      if (kw && !row.title.toLowerCase().includes(kw) && !row.code.toLowerCase().includes(kw) && !row.ownerDisplayName.toLowerCase().includes(kw)) return false;
      if (statusFilter === "under_review" && row.status !== "under_review") return false;
      if (statusFilter === "waiting" && !["submitted", "resubmitted", "supplement_requested"].includes(row.status)) return false;
      if (statusFilter === "has_council" && !row.councilStatus) return false;
      if (statusFilter === "decided" && !["ready_for_approval", "approved", "rejected"].includes(row.status)) return false;
      if (levelFilter !== "all" && row.proposalLevel !== levelFilter) return false;
      if (scopeFilter !== "all" && row.militaryScope !== scopeFilter) return false;
      if (officerFilter === "none" && row.officer) return false;
      if (officerFilter !== "all" && officerFilter !== "none" && row.officer?.userId !== officerFilter) return false;
      return true;
    });
  }, [overview, keyword, statusFilter, levelFilter, scopeFilter, officerFilter]);

  const levelOptions = useMemo(() => [...new Map(overview.filter((row) => row.proposalLevel).map((row) => [row.proposalLevel, row.proposalLevelLabel])).entries()], [overview]);
  const officerFilterOptions = useMemo(() => [...new Map(overview.filter((row) => row.officer).map((row) => [row.officer!.userId, row.officer!.displayName])).entries()], [overview]);

  // Thống kê nhanh trên đúng các hồ sơ người xem điều phối.
  const stats = useMemo(() => {
    const total = overview.length;
    const underReview = overview.filter((row) => row.status === "under_review").length;
    const unassigned = overview.filter((row) => !row.officer && !["approved", "rejected"].includes(row.status)).length;
    const councilApproved = overview.filter((row) => row.councilStatus === "approved").length;
    return { total, underReview, unassigned, councilApproved };
  }, [overview]);

  const currentProgress = detail?.id === selectedProposalId && detail.state === "ready" ? detail.progress ?? null : null;

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
              Theo dõi tiến độ đánh giá, thành lập Hội đồng, tổng hợp nhận xét và biên bản họp. Mỗi hồ sơ do một chuyên viên phụ trách theo mảng (cấp đề tài, Quân sự / Dân sự); Trưởng phòng điều phối toàn bộ.
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
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Hồ sơ đang điều phối</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px" }}>{stats.total}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>{viewerRole === "officer" ? "Hồ sơ đồng chí phụ trách" : "Trong phạm vi đơn vị"}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Đang trong giai đoạn đánh giá</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: "#fef08a" }}>{stats.underReview}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Chờ phản biện & họp HĐ</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.1)", backdropFilter: "blur(4px)", padding: "14px 18px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>Chưa có chuyên viên phụ trách</div>
            <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "4px", color: stats.unassigned ? "#fecaca" : undefined }}>{stats.unassigned}</div>
            <div style={{ fontSize: "11px", opacity: 0.75, marginTop: "2px" }}>Không khớp mảng nào — cần giao tay</div>
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
          gap: "8px",
          flexWrap: "wrap"
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
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          style={{
            padding: "14px 20px",
            border: "none",
            borderBottom: activeTab === "audit" ? "3px solid #15803d" : "3px solid transparent",
            background: "transparent",
            fontWeight: activeTab === "audit" ? 700 : 600,
            color: activeTab === "audit" ? "#15803d" : "#64748b",
            fontSize: "15px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <Clock size={18} />
          5. Lịch sử hoạt động
        </button>
        {viewerRole === "head" ? (
          <button
            type="button"
            onClick={() => setActiveTab("portfolio")}
            style={{
              padding: "14px 20px",
              border: "none",
              borderBottom: activeTab === "portfolio" ? "3px solid #15803d" : "3px solid transparent",
              background: "transparent",
              fontWeight: activeTab === "portfolio" ? 700 : 600,
              color: activeTab === "portfolio" ? "#15803d" : "#64748b",
              fontSize: "15px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Layers size={18} />
            Mảng phụ trách của chuyên viên
          </button>
        ) : null}
      </div>

      {loadError ? <p className="state-message error">{loadError}</p> : null}

      {activeTab === "portfolio" && viewerRole === "head" ? <PortfolioManager onAssigned={() => void loadData()} /> : null}

      {/* ======================= TAB 1: THEO DÕI TIẾN ĐỘ ĐÁNH GIÁ ======================= */}
      {activeTab === "progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Bộ lọc: trạng thái, mảng (cấp đề tài, tính chất), chuyên viên phụ trách */}
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
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm theo tên đề tài, mã số hoặc chủ nhiệm..." />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>Lọc theo:</span>
              <select aria-label="Trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option value="all">Mọi trạng thái ({overview.length})</option>
                <option value="waiting">Chờ tiếp nhận / bổ sung</option>
                <option value="under_review">Đang đánh giá ({stats.underReview})</option>
                <option value="has_council">Đã lập tờ trình hội đồng</option>
                <option value="decided">Đã trình / đã quyết định</option>
              </select>
              <select aria-label="Cấp đề tài" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option value="all">Mọi cấp</option>
                {levelOptions.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              <select aria-label="Tính chất" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <option value="all">Quân sự & Dân sự</option>
                <option value="military">Quân sự</option>
                <option value="civilian">Dân sự</option>
              </select>
              {viewerRole !== "officer" ? (
                <select aria-label="Chuyên viên phụ trách" value={officerFilter} onChange={(e) => setOfficerFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                  <option value="all">Mọi chuyên viên</option>
                  <option value="none">Chưa có người phụ trách ({stats.unassigned})</option>
                  {officerFilterOptions.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {officerMessage ? <p className="state-message" role="status">{officerMessage}</p> : null}

          {/* Bảng theo dõi tổng thể */}
          <div style={{ background: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Tiến độ đánh giá và người phụ trách</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                  Bấm vào một hồ sơ để xem chi tiết người phản biện, hoặc chuyển sang lập Hội đồng, biên bản.
                </p>
              </div>
              <span style={{ fontSize: "12px", color: "#15803d", fontWeight: 600, background: "#f0fdf4", padding: "4px 10px", borderRadius: "12px" }}>
                {filteredRows.length} hồ sơ
              </span>
            </div>

            {loading && overview.length === 0 ? (
              <p className="state-message">Đang tải danh sách hồ sơ...</p>
            ) : filteredRows.length === 0 ? (
              <p className="state-message">
                {overview.length === 0
                  ? viewerRole !== "officer"
                    ? "Chưa có hồ sơ nào ở bước tiếp nhận hoặc đánh giá trong phạm vi đơn vị."
                    : "Đồng chí chưa được giao phụ trách hồ sơ nào. Trưởng phòng giao theo mảng hoặc giao từng hồ sơ."
                  : "Không có hồ sơ khớp bộ lọc."}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "240px" }}>Tên đề tài & Chủ nhiệm</th>
                      <th>Mảng</th>
                      <th>Trạng thái</th>
                      <th style={{ minWidth: "170px" }}>Chuyên viên phụ trách</th>
                      <th style={{ minWidth: "160px" }}>Tiến độ phản biện</th>
                      <th>Điểm TB</th>
                      <th style={{ minWidth: "150px" }}>Hội đồng</th>
                      <th style={{ textAlign: "center" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const isSelected = row.id === selectedProposalId;
                      const { submittedCount, scoringCount, pendingInvitationCount, declinedCount, averageScore } = row.review;
                      const percent = scoringCount > 0 ? Math.min(100, Math.round((submittedCount / scoringCount) * 100)) : 0;
                      return (
                        <tr key={row.id} style={{ background: isSelected ? "#f0fdf4" : undefined, cursor: "pointer" }} onClick={() => setSelectedProposalId(row.id)}>
                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.title}</div>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "3px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803d" }}>{row.code || "Chưa cấp mã"}</span>
                              <span style={{ fontSize: "11px", color: "#64748b" }}>
                                • Chủ nhiệm: <strong>{row.ownerDisplayName || "—"}</strong>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="record-title" style={{ fontSize: "12px" }}>{row.proposalLevelLabel}</span>
                            <span className="record-meta">{row.militaryScopeLabel}</span>
                          </td>
                          <td>
                            <StatusBadge status={row.status} />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {viewerRole === "head" ? (
                              <select
                                aria-label={`Chuyên viên phụ trách ${row.title}`}
                                value={row.officer?.userId ?? ""}
                                disabled={officerChanging === row.id || ["approved", "rejected"].includes(row.status)}
                                onChange={(e) => void changeOfficer(row.id, e.target.value)}
                                style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "6px", border: `1px solid ${row.officer ? "#cbd5e1" : "#fca5a5"}`, maxWidth: "190px" }}
                              >
                                <option value="" disabled>
                                  {row.officer ? "—" : "Chưa có người phụ trách"}
                                </option>
                                {row.officer && !officerOptions.some((officer) => officer.id === row.officer!.userId) ? <option value={row.officer.userId}>{row.officer.displayName}</option> : null}
                                {officerOptions.map((officer) => (
                                  <option key={officer.id} value={officer.id}>{officer.displayName}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: "12px" }}>{row.officer?.displayName ?? "Chưa có"}</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 600, color: percent === 100 ? "#16a34a" : "#2563eb" }}>
                                {submittedCount}/{scoringCount} phiếu
                              </span>
                              <span style={{ fontWeight: 700, color: "#64748b" }}>{percent}%</span>
                            </div>
                            <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${percent}%`, height: "100%", background: percent === 100 ? "#16a34a" : "#2563eb", borderRadius: "3px" }} />
                            </div>
                            {pendingInvitationCount || declinedCount ? (
                              <div style={{ fontSize: "11px", marginTop: "4px", color: declinedCount ? "#b91c1c" : "#c2410c" }}>
                                {pendingInvitationCount ? `${pendingInvitationCount} chờ nhận lời` : ""}
                                {pendingInvitationCount && declinedCount ? " · " : ""}
                                {declinedCount ? `${declinedCount} từ chối` : ""}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: "#0f172a" }}>{averageScore !== null ? `${averageScore}/100` : "—"}</span>
                          </td>
                          <td>
                            {row.councilStatus === "approved" ? (
                              <span style={{ fontSize: "12px", background: "#f0fdf4", color: "#166534", padding: "3px 8px", borderRadius: "10px", fontWeight: 600 }}>
                                ✓ Đã thành lập ({row.councilMemberCount} TV)
                              </span>
                            ) : row.councilStatus === "submitted" ? (
                              <span style={{ fontSize: "12px", background: "#fefce8", color: "#854d0e", padding: "3px 8px", borderRadius: "10px", fontWeight: 600 }}>
                                ⏳ Chờ lãnh đạo ký ({row.councilMemberCount} TV)
                              </span>
                            ) : row.councilStatus ? (
                              <span style={{ fontSize: "12px", background: "#eff6ff", color: "#1e40af", padding: "3px 8px", borderRadius: "10px" }}>
                                {row.councilStatus === "rejected" ? "Bị trả lại — cần sửa" : "Đang lập tờ trình"}
                              </span>
                            ) : (
                              <span style={{ fontSize: "12px", background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "10px" }}>Chưa lập tờ trình</span>
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
                                  setSelectedProposalId(row.id);
                                  setActiveTab("council");
                                }}
                                title="Phân công hoặc xem Hội đồng"
                              >
                                <Users size={13} /> Hội đồng
                              </button>
                              <button
                                type="button"
                                className="button secondary"
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProposalId(row.id);
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
            )}
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
                  {/* Nghiệm thu, giải ngân, thanh lý gắn với đề tài thực hiện (trang đề tài). */}
                  {selectedProposal.project?.id ? (
                    <Link
                      className="button"
                      href={`/projects/${selectedProposal.project.id}`}
                      style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px", background: "#059669", color: "#ffffff" }}
                      title="Nghiệm thu, giải ngân, thanh lý và đóng đề tài được quản lý trên trang đề tài"
                    >
                      <Award size={14} /> Đề tài: nghiệm thu &amp; kinh phí
                    </Link>
                  ) : null}

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

              {/* Danh sách chuyên gia phản biện được phân công — chỉ hiển thị dữ liệu thật từ API */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                  Danh sách chuyên gia phản biện và tình trạng phiếu nhận xét:
                </div>

                {detail?.id === selectedProposalId && detail.state === "error" ? (
                  <div style={{ fontSize: "13px", color: "#b91c1c" }}>{detail.error}</div>
                ) : !currentProgress ? (
                  <div style={{ fontSize: "13px", color: "#64748b" }}>Đang tải tình trạng phản biện…</div>
                ) : currentProgress.assignments.filter((assignment) => assignment.status !== "revoked").length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#64748b" }}>Chưa phân công chuyên gia phản biện cho hồ sơ này.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                    {currentProgress.assignments
                      .filter((assignment) => assignment.status !== "revoked")
                      .map((assignment) => {
                        const review = currentProgress.reviews.find((item) => item.assignmentId === assignment.id);
                        const submitted = Boolean(review);
                        return (
                          <div key={assignment.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", background: "#f0fdf4", padding: "2px 8px", borderRadius: "10px" }}>
                                {assignment.assignmentRoleLabel || "Chuyên gia phản biện"}
                              </span>
                              <span style={{ fontSize: "12px", color: submitted ? "#166534" : "#b45309", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                                {submitted ? <CheckCircle2 size={14} color="#166534" /> : null}
                                {submitted ? "Đã nộp phiếu" : "Chưa nộp phiếu"}
                              </span>
                            </div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>{assignment.reviewerDisplayName}</div>
                            {assignment.reviewerUnit ? (
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{assignment.reviewerUnit}</div>
                            ) : null}
                            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px" }}>
                              <span style={{ color: "#475569" }}>
                                Điểm đánh giá:{" "}
                                <strong>{review && review.totalScore !== null ? `${review.totalScore}/${review.maxTotalScore}` : "—"}</strong>
                              </span>
                              <span style={{ color: "#334155", fontWeight: 600 }}>
                                {review?.recommendationLabel ? `Kết luận: ${review.recommendationLabel}` : assignment.dueDate ? `Hạn nộp: ${new Date(assignment.dueDate).toLocaleDateString("vi-VN")}` : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
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
              {...evaluationPanelPermissions(selectedProposal)}
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
                  title="Tải file Word (.docx) Biên bản họp Hội đồng chuẩn Bộ Quốc phòng"
                >
                  <FileDown size={14} /> Lưu Biên bản (Word)
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => exportCouncilDecisionWord(selectedProposal)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
                  title="Tải file Word (.docx) Quyết định thành lập Hội đồng"
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
              {...evaluationPanelPermissions(selectedProposal)}
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
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Hội đồng IRB</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{IRB_COUNCIL_LABELS[selectedProposal.irbMetadata?.council?.status ?? ""] ?? "Chưa lập"}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Kết luận</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{IRB_CONCLUSION_LABELS[selectedProposal.irbMetadata?.conclusion?.status ?? ""] ?? "Chưa có"}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Giấy chứng nhận</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{selectedProposal.irbMetadata?.certificate ? (selectedProposal.irbMetadata.certificate.status === "APPROVED" ? `Số ${selectedProposal.irbMetadata.certificate.certificateNumber}` : "Không chấp thuận") : "Chưa cấp"}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>Ngày ký</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{formatDate(selectedProposal.irbMetadata?.certificate?.decisionDate)}</span>
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

      {/* Modal Phê duyệt Hội đồng Đạo đức Y sinh (IRB) */}
      {modalTargetProposal && isIRBModalOpen && (
        <IRBApprovalModal
          isOpen={isIRBModalOpen}
          onClose={() => {
            setIsIRBModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          onSuccess={() => void loadData()}
        />
      )}
    </div>
  );
}
