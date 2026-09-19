"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Coins,
  Eye,
  FileText,
  Filter,
  Printer,
  RotateCcw,
  Search,
  Users,
  Calendar,
  MapPin,
  Clock,
  Award,
  AlertCircle,
  X
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  loadResearchProposals,
  approveProposalCouncil,
  rejectProposalCouncil,
  type ResearchProposal,
  type CouncilMember
} from "@/lib/research-proposals-api";
import {
  PROPOSAL_LEVEL_LABELS,
  MILITARY_SCOPE_LABELS,
  getProposalLevelLabel,
  getProposalMilitaryScope,
  getProposalMilitaryScopeLabel
} from "@/lib/proposal-classification";
import { formatVndNumber } from "@/lib/vietnamese-currency";
import { OfficialDecisionModal } from "@/components/research-proposals/official-decision-modal";
import { OfficialCouncilDecisionModal } from "@/components/research-proposals/official-council-decision-modal";

const DECIDED_STATUSES = ["approved", "rejected"];

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value)) : "Chưa có";
}

function formatDateWithTime(value: string) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Chưa có";
}

/**
 * ST-3.5 — Phân tách 3 mục rõ ràng trong Hồ sơ chờ duyệt của Lãnh đạo:
 * - Mục 1: Duyệt thành lập Hội đồng (Tờ trình từ Trưởng phòng KHQS)
 * - Mục 2: Duyệt đề tài (Hồ sơ chờ phê duyệt nội dung/danh mục)
 * - Mục 3: Duyệt kinh phí (Hồ sơ chờ thẩm định & phê duyệt dự toán kinh phí)
 */
export function ApprovalQueuePanel() {
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Tab chuyển đổi: "council" (Duyệt Hội đồng) | "proposal" (Duyệt đề tài) | "budget" (Duyệt kinh phí)
  const [activeTab, setActiveTab] = useState<"council" | "proposal" | "budget">("council");

  // Bộ lọc
  const [keyword, setKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedMilitaryScope, setSelectedMilitaryScope] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");

  // Xem & In quyết định phê duyệt đề tài
  const [previewProposal, setPreviewProposal] = useState<ResearchProposal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Xem & In quyết định thành lập hội đồng
  const [previewCouncilProposal, setPreviewCouncilProposal] = useState<ResearchProposal | null>(null);
  const [isCouncilModalOpen, setIsCouncilModalOpen] = useState(false);

  // Modal Lãnh đạo duyệt Hội đồng
  const [reviewingCouncilProposal, setReviewingCouncilProposal] = useState<ResearchProposal | null>(null);
  const [councilApprovalNote, setCouncilApprovalNote] = useState("");
  const [councilDecisionNumber, setCouncilDecisionNumber] = useState("");
  const [councilActionLoading, setCouncilActionLoading] = useState(false);
  const [councilActionError, setCouncilActionError] = useState("");
  const [councilActionSuccess, setCouncilActionSuccess] = useState("");

  async function loadData() {
    try {
      const data = await loadResearchProposals();
      setProposals(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Danh sách các đơn vị từ dữ liệu đề tài
  const unitOptions = useMemo(() => {
    const unitsMap = new Map<string, string>();
    proposals.forEach((p) => {
      const id = p.hostOrganizationUnitId;
      const name = p.hostOrganizationUnitName || id;
      if (id && !unitsMap.has(id)) {
        unitsMap.set(id, name);
      }
    });
    return Array.from(unitsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [proposals]);

  const isFiltered = Boolean(keyword || selectedLevel || selectedMilitaryScope || selectedUnit);

  function resetFilters() {
    setKeyword("");
    setSelectedLevel("");
    setSelectedMilitaryScope("");
    setSelectedUnit("");
  }

  function matchesFilter(p: ResearchProposal) {
    if (keyword) {
      const kw = keyword.toLowerCase().trim();
      const match =
        p.title.toLowerCase().includes(kw) ||
        (p.code && p.code.toLowerCase().includes(kw)) ||
        (p.ownerDisplayName && p.ownerDisplayName.toLowerCase().includes(kw)) ||
        (p.hostOrganizationUnitName && p.hostOrganizationUnitName.toLowerCase().includes(kw)) ||
        (p.councilMetadata?.members?.some((m) => m.displayName.toLowerCase().includes(kw)));
      if (!match) return false;
    }

    if (selectedLevel && p.proposalTypeCode !== selectedLevel) {
      return false;
    }

    if (selectedMilitaryScope) {
      const scope = getProposalMilitaryScope(p);
      if (scope !== selectedMilitaryScope) return false;
    }

    if (selectedUnit && p.hostOrganizationUnitId !== selectedUnit) {
      return false;
    }

    return true;
  }

  // --- TAB 1: DUYỆT HỘI ĐỒNG ---
  const waitingCouncilProposals = useMemo(
    () => proposals.filter((p) => matchesFilter(p) && p.councilMetadata?.status === "submitted"),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const decidedCouncilProposals = useMemo(
    () => proposals.filter((p) => matchesFilter(p) && p.councilMetadata?.status === "approved"),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const totalWaitingCouncils = useMemo(
    () => proposals.filter((p) => p.councilMetadata?.status === "submitted").length,
    [proposals]
  );
  const totalDecidedCouncils = useMemo(
    () => proposals.filter((p) => p.councilMetadata?.status === "approved").length,
    [proposals]
  );

  // --- TAB 2: DUYỆT ĐỀ TÀI ---
  const waitingProposals = useMemo(
    () => proposals.filter((p) => matchesFilter(p) && p.status === "ready_for_approval"),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const decidedProposals = useMemo(
    () => proposals.filter((p) => matchesFilter(p) && DECIDED_STATUSES.includes(p.status)),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const totalWaitingProposals = useMemo(() => proposals.filter((p) => p.status === "ready_for_approval").length, [proposals]);
  const totalDecidedProposals = useMemo(() => proposals.filter((p) => DECIDED_STATUSES.includes(p.status)).length, [proposals]);

  // --- TAB 3: DUYỆT KINH PHÍ ---
  const waitingBudgets = useMemo(
    () =>
      proposals.filter((p) => {
        if (!matchesFilter(p)) return false;
        return p.status === "ready_for_approval" || (p.status === "approved" && !(p.budgetMetadata as any)?.approvedAmount);
      }),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const decidedBudgets = useMemo(
    () =>
      proposals.filter((p) => {
        if (!matchesFilter(p)) return false;
        return Boolean((p.budgetMetadata as any)?.approvedAmount) || (p.status === "approved" && Boolean(p.budgetMetadata?.amount));
      }),
    [proposals, keyword, selectedLevel, selectedMilitaryScope, selectedUnit]
  );

  const totalWaitingBudgets = useMemo(
    () =>
      proposals.filter(
        (p) => p.status === "ready_for_approval" || (p.status === "approved" && !(p.budgetMetadata as any)?.approvedAmount)
      ).length,
    [proposals]
  );
  const totalDecidedBudgets = useMemo(
    () => proposals.filter((p) => Boolean((p.budgetMetadata as any)?.approvedAmount) || (p.status === "approved" && Boolean(p.budgetMetadata?.amount))).length,
    [proposals]
  );

  function handlePreviewDecision(proposal: ResearchProposal) {
    setPreviewProposal(proposal);
    setIsModalOpen(true);
  }

  function handlePreviewCouncilDecision(proposal: ResearchProposal) {
    setPreviewCouncilProposal(proposal);
    setIsCouncilModalOpen(true);
  }

  function openReviewCouncilModal(proposal: ResearchProposal) {
    setReviewingCouncilProposal(proposal);
    setCouncilApprovalNote(proposal.councilMetadata?.approvalNote || "Nhất trí thành lập Hội đồng theo đề nghị của Trưởng phòng KHQS.");
    const code = proposal.code || proposal.id.slice(0, 8).toUpperCase();
    setCouncilDecisionNumber(proposal.councilMetadata?.decisionNumber || `QĐ-TLHĐ-${code.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`);
    setCouncilActionError("");
    setCouncilActionSuccess("");
  }

  async function handleApproveCouncil() {
    if (!reviewingCouncilProposal) return;
    setCouncilActionLoading(true);
    setCouncilActionError("");
    try {
      await approveProposalCouncil(reviewingCouncilProposal.id, {
        approvalNote: councilApprovalNote,
        decisionNumber: councilDecisionNumber
      });
      setCouncilActionSuccess("Đã ký phê duyệt và ban hành Quyết định thành lập Hội đồng thành công!");
      await loadData();
      setTimeout(() => {
        const updated = {
          ...reviewingCouncilProposal,
          councilMetadata: {
            ...reviewingCouncilProposal.councilMetadata,
            status: "approved" as const,
            decisionNumber: councilDecisionNumber,
            decidedAt: new Date().toISOString(),
            decidedByName: "GS. TS. Trần Viết Tiến",
            approvalNote: councilApprovalNote,
            members: reviewingCouncilProposal.councilMetadata?.members || []
          }
        };
        setReviewingCouncilProposal(null);
        handlePreviewCouncilDecision(updated);
      }, 700);
    } catch (err) {
      setCouncilActionError(err instanceof Error ? err.message : "Không thể phê duyệt Hội đồng.");
    } finally {
      setCouncilActionLoading(false);
    }
  }

  async function handleRejectCouncil() {
    if (!reviewingCouncilProposal) return;
    const reason = prompt("Nhập ý kiến chỉ đạo điều chỉnh nhân sự Hội đồng gửi lại Trưởng phòng KHQS:");
    if (!reason || !reason.trim()) return;

    setCouncilActionLoading(true);
    setCouncilActionError("");
    try {
      await rejectProposalCouncil(reviewingCouncilProposal.id, { reason: reason.trim() });
      setCouncilActionSuccess("Đã trả lại tờ trình kèm ý kiến chỉ đạo.");
      await loadData();
      setTimeout(() => {
        setReviewingCouncilProposal(null);
      }, 700);
    } catch (err) {
      setCouncilActionError(err instanceof Error ? err.message : "Không thể trả lại tờ trình.");
    } finally {
      setCouncilActionLoading(false);
    }
  }

  if (state === "loading") {
    return <p className="state-message">Đang tải hồ sơ chờ phê duyệt...</p>;
  }

  if (state === "error") {
    return <p className="state-message error">Không thể tải danh sách hồ sơ chờ phê duyệt.</p>;
  }

  return (
    <>
      {/* Bộ lọc tìm kiếm đa tiêu chí */}
      <SectionCard
        title="Bộ lọc hồ sơ phê duyệt"
        subtitle="Lọc theo cấp quản lý, tính chất quân sự/dân sự, đơn vị chủ trì hoặc từ khóa"
        action={
          isFiltered ? (
            <button
              type="button"
              className="button button-ghost"
              style={{ fontSize: "13px", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
              onClick={resetFilters}
            >
              <RotateCcw style={{ width: 14, height: 14 }} /> Đặt lại
            </button>
          ) : undefined
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "8px" }}>
          <label className="field" style={{ margin: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
              <Search style={{ width: 13, height: 13 }} /> Tìm kiếm
            </span>
            <input
              type="text"
              placeholder="Tên, mã đề tài, chủ nhiệm, thành viên HĐ..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ padding: "8px 12px", fontSize: "13px" }}
            />
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
              <Filter style={{ width: 13, height: 13 }} /> Cấp quản lý
            </span>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              style={{ padding: "8px 12px", fontSize: "13px" }}
            >
              <option value="">Tất cả các cấp</option>
              {Object.entries(PROPOSAL_LEVEL_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Phạm vi ứng dụng</span>
            <select
              value={selectedMilitaryScope}
              onChange={(e) => setSelectedMilitaryScope(e.target.value)}
              style={{ padding: "8px 12px", fontSize: "13px" }}
            >
              <option value="">Quân sự & Dân sự</option>
              {Object.entries(MILITARY_SCOPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Đơn vị chủ trì</span>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{ padding: "8px 12px", fontSize: "13px" }}
            >
              <option value="">Tất cả các đơn vị</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      {/* THANH CHUYỂN ĐỔI 3 MỤC QUY TRÌNH DUYỆT */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "2px solid #cbd5e1",
          margin: "24px 0 20px 0",
          overflowX: "auto"
        }}
      >
        {/* TAB 1: DUYỆT HỘI ĐỒNG */}
        <button
          type="button"
          onClick={() => setActiveTab("council")}
          style={{
            padding: "12px 18px",
            fontSize: "14px",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "council" ? "3px solid #15803d" : "3px solid transparent",
            color: activeTab === "council" ? "#15803d" : "#64748b",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "-2px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap"
          }}
        >
          <Users size={17} />
          Mục 1: Duyệt thành lập Hội đồng
          <span
            style={{
              background: activeTab === "council" ? "#dcfce7" : "#f1f5f9",
              color: activeTab === "council" ? "#15803d" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: 700
            }}
          >
            {totalWaitingCouncils}
          </span>
        </button>

        {/* TAB 2: DUYỆT ĐỀ TÀI */}
        <button
          type="button"
          onClick={() => setActiveTab("proposal")}
          style={{
            padding: "12px 18px",
            fontSize: "14px",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "proposal" ? "3px solid #166534" : "3px solid transparent",
            color: activeTab === "proposal" ? "#166534" : "#64748b",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "-2px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap"
          }}
        >
          <FileText size={17} />
          Mục 2: Duyệt đề tài
          <span
            style={{
              background: activeTab === "proposal" ? "#dcfce7" : "#f1f5f9",
              color: activeTab === "proposal" ? "#166534" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: 700
            }}
          >
            {totalWaitingProposals}
          </span>
        </button>

        {/* TAB 3: DUYỆT KINH PHÍ */}
        <button
          type="button"
          onClick={() => setActiveTab("budget")}
          style={{
            padding: "12px 18px",
            fontSize: "14px",
            fontWeight: 700,
            border: "none",
            borderBottom: activeTab === "budget" ? "3px solid #166534" : "3px solid transparent",
            color: activeTab === "budget" ? "#166534" : "#64748b",
            background: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "-2px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap"
          }}
        >
          <Coins size={17} />
          Mục 3: Duyệt kinh phí
          <span
            style={{
              background: activeTab === "budget" ? "#fef3c7" : "#f1f5f9",
              color: activeTab === "budget" ? "#92400e" : "#64748b",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: 700
            }}
          >
            {totalWaitingBudgets}
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: MỤC 1 - DUYỆT THÀNH LẬP HỘI ĐỒNG
          ========================================================================= */}
      {activeTab === "council" && (
        <>
          {/* Section 1: Tờ trình Hội đồng chờ duyệt */}
          <SectionCard
            title="Tờ trình Hội đồng chờ Lãnh đạo phê duyệt"
            subtitle={
              isFiltered
                ? `Hiển thị ${waitingCouncilProposals.length} / ${totalWaitingCouncils} tờ trình đề xuất thành lập Hội đồng`
                : `${totalWaitingCouncils} tờ trình do Trưởng phòng Khoa học quân sự đề xuất đang chờ Lãnh đạo phê chuẩn`
            }
            action={
              <span
                style={{
                  background: "#dcfce7",
                  color: "#15803d",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Chờ duyệt: {totalWaitingCouncils}
              </span>
            }
          >
            {waitingCouncilProposals.length === 0 ? (
              <EmptyState
                title="Không có tờ trình Hội đồng chờ duyệt"
                message={
                  isFiltered
                    ? "Không tìm thấy tờ trình phù hợp với bộ lọc hiện tại."
                    : "Hiện tại không có tờ trình đề xuất Hội đồng nào đang chờ Lãnh đạo phê duyệt."
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {waitingCouncilProposals.map((proposal) => {
                  const council = proposal.councilMetadata;
                  const chair = council?.members?.find((m) => m.role === "chair");
                  const secretary = council?.members?.find((m) => m.role === "secretary");
                  const reviewers = council?.members?.filter((m) => m.role === "reviewer_1" || m.role === "reviewer_2") || [];
                  const otherMembers = council?.members?.filter((m) => m.role === "member") || [];

                  return (
                    <article
                      key={proposal.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "18px",
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "12px" }}>
                        <div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "2px 8px", borderRadius: "4px" }}>
                              {proposal.code || "MÃ CHƯA CẤP"}
                            </span>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              Cấp quản lý: {getProposalLevelLabel(proposal.proposalTypeCode)}
                            </span>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>·</span>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              Đơn vị: {proposal.hostOrganizationUnitName || proposal.hostOrganizationUnitId}
                            </span>
                          </div>
                          <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                            <Link href={`/proposals/${proposal.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                              {proposal.title}
                            </Link>
                          </h4>
                          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#475569" }}>
                            Chủ nhiệm: <strong>{proposal.ownerDisplayName || "—"}</strong> · Người trình: <strong>{council?.proposedByName || "Trưởng phòng KHQS"}</strong> ({council?.proposedAt ? formatDateWithTime(council.proposedAt) : "Mới đây"})
                          </p>
                        </div>
                        <span
                          style={{
                            background: "#fef3c7",
                            color: "#92400e",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            whiteSpace: "nowrap"
                          }}
                        >
                          Chờ Lãnh đạo phê duyệt HĐ
                        </span>
                      </div>

                      {/* Tóm tắt nhân sự Hội đồng đề xuất */}
                      <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 14px", margin: "12px 0", fontSize: "13px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                          <div>
                            <span style={{ color: "#64748b" }}>Chủ tịch HĐ:</span>{" "}
                            <strong>{chair?.displayName || "Chưa chọn"}</strong>
                            {chair?.academicTitle ? ` (${chair.academicTitle})` : ""}
                          </div>
                          <div>
                            <span style={{ color: "#64748b" }}>Thư ký KH:</span>{" "}
                            <strong>{secretary?.displayName || "Chưa chọn"}</strong>
                          </div>
                          <div>
                            <span style={{ color: "#64748b" }}>Phản biện 1:</span>{" "}
                            <strong>{reviewers[0]?.displayName || "Chưa chọn"}</strong>
                          </div>
                          <div>
                            <span style={{ color: "#64748b" }}>Phản biện 2:</span>{" "}
                            <strong>{reviewers[1]?.displayName || "Chưa chọn"}</strong>
                          </div>
                        </div>
                        {council?.meetingDate && (
                          <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #cbd5e1", display: "flex", gap: "16px", color: "#334155", fontSize: "12px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <Calendar size={13} /> Dự kiến họp: {formatDate(council.meetingDate)}
                            </span>
                            {council.meetingLocation && (
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <MapPin size={13} /> {council.meetingLocation}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Nút hành động */}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                        <Link href={`/proposals/${proposal.id}`} className="button button-ghost" style={{ padding: "6px 12px", fontSize: "13px" }}>
                          Xem chi tiết thuyết minh
                        </Link>
                        <button
                          type="button"
                          className="button primary"
                          style={{
                            padding: "6px 14px",
                            fontSize: "13px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: "#15803d",
                            borderColor: "#15803d"
                          }}
                          onClick={() => openReviewCouncilModal(proposal)}
                        >
                          <Users size={15} /> Xem tờ trình & Phê duyệt
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Section 2: Hội đồng đã phê duyệt */}
          <SectionCard
            title="Hội đồng đã phê duyệt & Ban hành Quyết định"
            subtitle={
              isFiltered
                ? `Hiển thị ${decidedCouncilProposals.length} / ${totalDecidedCouncils} Hội đồng đã ban hành quyết định`
                : `${totalDecidedCouncils} Hội đồng đã có Quyết định thành lập chính thức từ Giám đốc Học viện`
            }
            action={
              <span
                style={{
                  background: "#e2e8f0",
                  color: "#334155",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Đã ban hành: {totalDecidedCouncils}
              </span>
            }
          >
            {decidedCouncilProposals.length === 0 ? (
              <EmptyState
                title="Chưa có Hội đồng nào được phê duyệt"
                message="Các Hội đồng sau khi được Lãnh đạo ký ban hành quyết định sẽ xuất hiện tại danh sách này."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {decidedCouncilProposals.map((proposal) => {
                  const council = proposal.councilMetadata;
                  const minutes = council?.councilMinutes;

                  return (
                    <article
                      key={proposal.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                        background: "#ffffff",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "16px"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
                            {proposal.code || "MÃ CHƯA CẤP"}
                          </span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>·</span>
                          <span style={{ fontSize: "12px", color: "#15803d", fontWeight: 600 }}>
                            {council?.decisionNumber || "Đã ban hành QĐ"}
                          </span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>·</span>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            Ký ngày: {council?.decidedAt ? formatDate(council.decidedAt) : "—"}
                          </span>
                        </div>
                        <h4 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                          <Link href={`/proposals/${proposal.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                            {proposal.title}
                          </Link>
                        </h4>
                        <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                          Chủ nhiệm: {proposal.ownerDisplayName || "—"} · Đơn vị: {proposal.hostOrganizationUnitName || proposal.hostOrganizationUnitId} · Người ký: {council?.decidedByName || "Giám đốc Học viện"}
                        </p>
                        {minutes && (
                          <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "#f0fdf4", color: "#166534", padding: "2px 8px", borderRadius: "4px", border: "1px solid #bbf7d0" }}>
                            <Award size={13} />
                            Kết luận HĐ: <strong>{minutes.conclusionLabel}</strong>
                            {minutes.averageScore ? ` (Điểm TB: ${minutes.averageScore}/100)` : ""}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                          onClick={() => handlePreviewCouncilDecision(proposal)}
                        >
                          <Printer size={14} /> Xem & In Quyết định HĐ
                        </button>
                        <Link href={`/proposals/${proposal.id}`} className="button button-ghost" style={{ fontSize: "12px", padding: "6px 10px" }}>
                          Chi tiết
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* =========================================================================
          TAB 2: MỤC 2 - DUYỆT ĐỀ TÀI (NỘI DUNG / DANH MỤC)
          ========================================================================= */}
      {activeTab === "proposal" && (
        <>
          <SectionCard
            title="Chờ duyệt đề tài"
            subtitle={
              isFiltered
                ? `Hiển thị ${waitingProposals.length} / ${totalWaitingProposals} hồ sơ chờ phê duyệt danh mục`
                : `${totalWaitingProposals} hồ sơ đã qua đánh giá hội đồng, đang chờ phê duyệt danh mục đề tài`
            }
            action={
              <span
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Chờ duyệt: {totalWaitingProposals}
              </span>
            }
          >
            {waitingProposals.length === 0 ? (
              <EmptyState
                title="Không có đề tài chờ phê duyệt"
                message={
                  isFiltered
                    ? "Không tìm thấy đề tài nào phù hợp với bộ lọc đã chọn."
                    : "Tất cả hồ sơ đề xuất nghiên cứu đã được xử lý hoặc chưa tới bước phê duyệt."
                }
              />
            ) : (
              <ApprovalCardsList proposals={waitingProposals} mode="proposal" onPreviewDecision={handlePreviewDecision} />
            )}
          </SectionCard>

          <SectionCard
            title="Đề tài đã có quyết định"
            subtitle={
              isFiltered
                ? `Hiển thị ${decidedProposals.length} / ${totalDecidedProposals} đề tài đã phê duyệt / từ chối`
                : `${totalDecidedProposals} đề tài đã hoàn tất phê duyệt hoặc đã có kết luận từ chối`
            }
            action={
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Đã xử lý: {totalDecidedProposals}
              </span>
            }
          >
            {decidedProposals.length === 0 ? (
              <EmptyState
                title="Chưa có đề tài nào hoàn tất phê duyệt"
                message="Các đề tài sau khi được Lãnh đạo phê duyệt hoặc từ chối sẽ hiển thị tại danh sách này."
              />
            ) : (
              <ApprovalCardsList proposals={decidedProposals} mode="proposal" onPreviewDecision={handlePreviewDecision} />
            )}
          </SectionCard>
        </>
      )}

      {/* =========================================================================
          TAB 3: MỤC 3 - DUYỆT KINH PHÍ
          ========================================================================= */}
      {activeTab === "budget" && (
        <>
          <SectionCard
            title="Chờ duyệt kinh phí đề tài"
            subtitle={
              isFiltered
                ? `Hiển thị ${waitingBudgets.length} / ${totalWaitingBudgets} hồ sơ cần thẩm định & phê duyệt kinh phí`
                : `${totalWaitingBudgets} đề tài cần thẩm định & phê duyệt dự toán kinh phí theo định mức Bộ Quốc phòng`
            }
            action={
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Chờ duyệt: {totalWaitingBudgets}
              </span>
            }
          >
            {waitingBudgets.length === 0 ? (
              <EmptyState
                title="Không có hồ sơ chờ duyệt kinh phí"
                message={
                  isFiltered
                    ? "Không tìm thấy hồ sơ nào phù hợp với bộ lọc hiện tại."
                    : "Hiện tại tất cả hồ sơ đã được duyệt dự toán hoặc chưa có đề xuất kinh phí."
                }
              />
            ) : (
              <ApprovalCardsList proposals={waitingBudgets} mode="budget" onPreviewDecision={handlePreviewDecision} />
            )}
          </SectionCard>

          <SectionCard
            title="Kinh phí đề tài đã được phê duyệt"
            subtitle={
              isFiltered
                ? `Hiển thị ${decidedBudgets.length} / ${totalDecidedBudgets} đề tài đã có quyết định phê duyệt kinh phí`
                : `${totalDecidedBudgets} đề tài đã được Lãnh đạo ký phê duyệt mức kinh phí thực hiện`
            }
            action={
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "4px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 700
                }}
              >
                Đã duyệt kinh phí: {totalDecidedBudgets}
              </span>
            }
          >
            {decidedBudgets.length === 0 ? (
              <EmptyState
                title="Chưa có hồ sơ nào được duyệt kinh phí"
                message="Các đề tài sau khi được thẩm định và phê duyệt mức kinh phí sẽ hiển thị ở đây."
              />
            ) : (
              <ApprovalCardsList proposals={decidedBudgets} mode="budget" onPreviewDecision={handlePreviewDecision} />
            )}
          </SectionCard>
        </>
      )}

      {/* =========================================================================
          MODAL LÃNH ĐẠO XEM TỜ TRÌNH & PHÊ DUYỆT HỘI ĐỒNG
          ========================================================================= */}
      {reviewingCouncilProposal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9990,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !councilActionLoading) {
              setReviewingCouncilProposal(null);
            }
          }}
        >
          <div
            style={{
              background: "#ffffff",
              color: "#1e293b",
              width: "100%",
              maxWidth: "760px",
              maxHeight: "90vh",
              borderRadius: "12px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid var(--border)"
            }}
          >
            {/* Header modal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "6px",
                    background: "#15803d",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Users size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                    Phê duyệt Tờ trình Thành lập Hội đồng Đánh giá
                  </h3>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Căn cứ đề nghị của Trưởng phòng Khoa học quân sự
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setReviewingCouncilProposal(null)}
                disabled={councilActionLoading}
                style={{ padding: "6px", borderRadius: "6px" }}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nội dung modal */}
            <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Thông tin đề tài */}
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#15803d", fontWeight: 700, marginBottom: "4px" }}>
                  {reviewingCouncilProposal.code || "MÃ CHƯA CẤP"} · Cấp quản lý: {getProposalLevelLabel(reviewingCouncilProposal.proposalTypeCode)}
                </div>
                <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: 700 }}>
                  {reviewingCouncilProposal.title}
                </h4>
                <div style={{ fontSize: "13px", color: "#475569" }}>
                  Chủ nhiệm: <strong>{reviewingCouncilProposal.ownerDisplayName || "—"}</strong> · Đơn vị chủ trì: <strong>{reviewingCouncilProposal.hostOrganizationUnitName || reviewingCouncilProposal.hostOrganizationUnitId}</strong>
                </div>
              </div>

              {/* Kế hoạch họp */}
              {reviewingCouncilProposal.councilMetadata?.meetingDate && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
                  <div style={{ background: "#f1f5f9", padding: "10px 12px", borderRadius: "6px" }}>
                    <span style={{ color: "#64748b", display: "block", fontSize: "11px", fontWeight: 600 }}>DỰ KIẾN THỜI GIAN HỌP</span>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <Calendar size={14} /> {formatDate(reviewingCouncilProposal.councilMetadata.meetingDate)}
                    </strong>
                  </div>
                  <div style={{ background: "#f1f5f9", padding: "10px 12px", borderRadius: "6px" }}>
                    <span style={{ color: "#64748b", display: "block", fontSize: "11px", fontWeight: 600 }}>ĐỊA ĐIỂM HỌP HỘI ĐỒNG</span>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <MapPin size={14} /> {reviewingCouncilProposal.councilMetadata.meetingLocation || "Phòng họp Trung tâm Học viện"}
                    </strong>
                  </div>
                </div>
              )}

              {/* Bảng danh sách thành viên đề xuất */}
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "8px" }}>
                  Danh sách thành viên Hội đồng do Trưởng phòng KHQS đề xuất:
                </span>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                      <th style={{ padding: "8px", textAlign: "left", width: "140px" }}>Trách nhiệm</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Họ và tên</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Học hàm, học vị</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Đơn vị công tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewingCouncilProposal.councilMetadata?.members?.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "8px", fontWeight: 700, color: m.role === "chair" ? "#15803d" : "#334155" }}>
                          {m.roleLabel}
                        </td>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{m.displayName}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{m.academicTitle || "—"}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{m.unit || m.organization || "Học viện Quân y"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#15803d", display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={13} /> Hệ thống đã xác thực không có xung đột lợi ích (COI) giữa thành viên Hội đồng và Chủ nhiệm đề tài.
                </p>
              </div>

              {/* Số Quyết định dự kiến */}
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>Số Quyết định thành lập Hội đồng:</span>
                <input
                  type="text"
                  value={councilDecisionNumber}
                  onChange={(e) => setCouncilDecisionNumber(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              {/* Ý kiến phê duyệt */}
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 700 }}>Ý kiến chỉ đạo / Ghi chú phê duyệt của Lãnh đạo:</span>
                <textarea
                  rows={2}
                  value={councilApprovalNote}
                  onChange={(e) => setCouncilApprovalNote(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: "13px", resize: "vertical" }}
                  placeholder="Nhập ý kiến chỉ đạo của Lãnh đạo Học viện..."
                />
              </label>

              {councilActionError && (
                <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px", borderRadius: "6px", fontSize: "13px" }}>
                  {councilActionError}
                </div>
              )}

              {councilActionSuccess && (
                <div style={{ background: "#dcfce7", color: "#15803d", padding: "10px", borderRadius: "6px", fontSize: "13px" }}>
                  {councilActionSuccess}
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc"
              }}
            >
              <button
                type="button"
                className="button secondary"
                onClick={() => setReviewingCouncilProposal(null)}
                disabled={councilActionLoading}
              >
                Đóng
              </button>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button"
                  style={{ color: "#b91c1c", borderColor: "#fca5a5" }}
                  onClick={handleRejectCouncil}
                  disabled={councilActionLoading}
                >
                  Yêu cầu điều chỉnh / Trả lại
                </button>
                <button
                  type="button"
                  className="button primary"
                  style={{ background: "#15803d", borderColor: "#15803d" }}
                  onClick={handleApproveCouncil}
                  disabled={councilActionLoading}
                >
                  {councilActionLoading ? "Đang xử lý..." : "Ký phê duyệt & Ban hành Quyết định"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal in / xem quyết định phê duyệt đề tài */}
      {previewProposal && (
        <OfficialDecisionModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setPreviewProposal(null);
          }}
          proposal={previewProposal}
        />
      )}

      {/* Modal in / xem quyết định thành lập hội đồng */}
      {previewCouncilProposal && (
        <OfficialCouncilDecisionModal
          isOpen={isCouncilModalOpen}
          onClose={() => {
            setIsCouncilModalOpen(false);
            setPreviewCouncilProposal(null);
          }}
          proposal={previewCouncilProposal}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component hiển thị danh sách dạng Card chi tiết (cho duyệt đề tài & kinh phí)
// ---------------------------------------------------------------------------
function ApprovalCardsList({
  proposals,
  mode,
  onPreviewDecision
}: {
  proposals: ResearchProposal[];
  mode: "proposal" | "budget";
  onPreviewDecision?: (p: ResearchProposal) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {proposals.map((proposal) => {
        const amount = Number(proposal.budgetMetadata?.amount ?? 0);
        const approvedAmount = Number((proposal.budgetMetadata as any)?.approvedAmount ?? 0);
        const hasApprovedBudget = Boolean((proposal.budgetMetadata as any)?.approvedAmount);
        const levelLabel = getProposalLevelLabel(proposal.proposalTypeCode);
        const scope = getProposalMilitaryScope(proposal);
        const scopeLabel = getProposalMilitaryScopeLabel(scope);

        return (
          <article
            key={proposal.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "16px 20px",
              backgroundColor: "var(--surface)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                marginBottom: "12px"
              }}
            >
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--institutional-green, #166534)",
                      background: "rgba(22, 101, 52, 0.1)",
                      padding: "2px 8px",
                      borderRadius: "4px"
                    }}
                  >
                    {proposal.code || "MÃ CHƯA CẤP"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Cấp: <strong>{levelLabel}</strong>
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>·</span>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Phạm vi: <strong>{scopeLabel}</strong>
                  </span>
                </div>
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                  <Link href={`/proposals/${proposal.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {proposal.title}
                  </Link>
                </h4>
              </div>

              <div style={{ flexShrink: 0 }}>
                {mode === "proposal" ? (
                  <StatusBadge status={proposal.status} />
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 700,
                      background: hasApprovedBudget ? "#dcfce7" : "#fef3c7",
                      color: hasApprovedBudget ? "#166534" : "#92400e"
                    }}
                  >
                    {hasApprovedBudget ? (
                      <>
                        <CheckCircle2 style={{ width: 13, height: 13 }} /> Đã duyệt kinh phí
                      </>
                    ) : (
                      "Chờ thẩm định dự toán"
                    )}
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                padding: "12px 14px",
                backgroundColor: "var(--surface-muted, #f8fafc)",
                borderRadius: "8px",
                fontSize: "13px",
                marginBottom: "14px"
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Chủ nhiệm đề tài:</span>{" "}
                <strong>{proposal.ownerDisplayName || "—"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Đơn vị chủ trì:</span>{" "}
                <strong>{proposal.hostOrganizationUnitName || proposal.hostOrganizationUnitId}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Thời gian:</span>{" "}
                <strong>
                  {formatDate(proposal.startDate)} — {formatDate(proposal.endDate)}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Dự toán đề xuất:</span>{" "}
                <strong style={{ color: "var(--institutional-green, #166534)" }}>
                  {amount > 0 ? formatVndNumber(amount) : "Chưa lập dự toán"}
                </strong>
              </div>
              {hasApprovedBudget && (
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Kinh phí phê duyệt:</span>{" "}
                  <strong style={{ color: "#15803d", fontWeight: 800 }}>
                    {formatVndNumber(approvedAmount)}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {proposal.submittedAt && `Nộp hồ sơ: ${formatDate(proposal.submittedAt)}`}
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {mode === "proposal" ? (
                  proposal.status === "ready_for_approval" ? (
                    <Link
                      href={`/proposals/${proposal.id}#decision-section`}
                      className="button button-primary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <FileText style={{ width: 14, height: 14 }} /> Phê duyệt đề tài
                    </Link>
                  ) : proposal.status === "approved" ? (
                    <>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "13px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        onClick={() => onPreviewDecision?.(proposal)}
                        title="Xem và in Quyết định phê duyệt chuẩn Học viện Quân y"
                      >
                        <Printer style={{ width: 14, height: 14 }} /> In QĐ phê duyệt
                      </button>
                      <Link
                        href={`/proposals/${proposal.id}`}
                        className="button button-ghost"
                        style={{ padding: "6px 10px", fontSize: "13px" }}
                      >
                        Chi tiết
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={`/proposals/${proposal.id}`}
                      className="button button-secondary"
                      style={{ padding: "6px 12px", fontSize: "13px" }}
                    >
                      Chi tiết
                    </Link>
                  )
                ) : (
                  // mode === "budget"
                  !hasApprovedBudget || proposal.status === "ready_for_approval" ? (
                    <Link
                      href={`/proposals/${proposal.id}#budget-approval-section`}
                      className="button button-primary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "13px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#166534",
                        borderColor: "#166534"
                      }}
                    >
                      <Coins style={{ width: 14, height: 14 }} /> Duyệt kinh phí
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ fontSize: "13px", padding: "6px 10px" }}
                        onClick={() => onPreviewDecision?.(proposal)}
                      >
                        In QĐ kinh phí
                      </button>
                      <Link
                        href={`/proposals/${proposal.id}#budget-approval-section`}
                        className="button button-ghost"
                        style={{ fontSize: "13px", padding: "6px 10px" }}
                      >
                        Chi tiết
                      </Link>
                    </>
                  )
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
