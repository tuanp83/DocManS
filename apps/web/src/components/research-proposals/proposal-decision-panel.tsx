"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Coins, FileText, Printer, XCircle, FileDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  approveProposalBudget,
  decideProposal,
  isNotEntitled,
  loadProposalDecisionPackage,
  type ProposalDecisionPackage
} from "@/lib/proposal-evaluations-api";
import { OfficialDecisionModal } from "@/components/research-proposals/official-decision-modal";
import { formatVndNumber, numberToVietnameseWords } from "@/lib/vietnamese-currency";
import { exportProposalApprovalDecisionWord } from "@/lib/word-export";

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Chưa có";
}

/**
 * ST-3.5 — Phân tách rõ ràng:
 * 1. Quyết định phê duyệt đề tài (Nội dung, học thuật, tính cấp thiết quân sự)
 * 2. Quyết định duyệt kinh phí đề tài (Thẩm định dự toán, phê duyệt hạn mức kinh phí)
 */
export function ProposalDecisionPanel({
  proposalId,
  proposal,
  onDecision,
  canDecide,
  blockedReason
}: {
  proposalId: string;
  proposal?: any;
  onDecision: () => void;
  canDecide: boolean;
  blockedReason: string;
}) {
  const [decisionPackage, setDecisionPackage] = useState<ProposalDecisionPackage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  // Mục 1: Phê duyệt đề tài states
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyDecision, setBusyDecision] = useState<"" | "approve" | "reject">("");
  const [confirmingDecision, setConfirmingDecision] = useState<"" | "approve" | "reject">("");

  // Mục 2: Duyệt kinh phí states
  const requestedBudget = proposal?.budgetMetadata?.amount ?? decisionPackage?.budgetMetadata?.amount ?? 0;
  const requestedNote = proposal?.budgetMetadata?.note ?? decisionPackage?.budgetMetadata?.note ?? "";
  const existingApprovedBudget =
    (proposal?.budgetMetadata as any)?.approvedAmount ??
    (decisionPackage?.budgetMetadata as any)?.approvedAmount ??
    null;

  const [approvedAmount, setApprovedAmount] = useState<number | string>("");
  const [budgetNote, setBudgetNote] = useState<string>("");
  const [isBudgetInitialized, setIsBudgetInitialized] = useState(false);
  const [budgetError, setBudgetError] = useState("");
  const [budgetMessage, setBudgetMessage] = useState("");
  const [busyBudget, setBusyBudget] = useState(false);
  const [confirmingBudget, setConfirmingBudget] = useState(false);

  // Modal Quyết định chuẩn
  const [showDecisionModal, setShowDecisionModal] = useState(false);

  useEffect(() => {
    if (!isBudgetInitialized && (existingApprovedBudget || requestedBudget > 0)) {
      setApprovedAmount(existingApprovedBudget || requestedBudget);
      setBudgetNote(requestedNote || "Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026");
      setIsBudgetInitialized(true);
    }
  }, [existingApprovedBudget, requestedBudget, requestedNote, isBudgetInitialized]);

  async function refresh() {
    try {
      setDecisionPackage(await loadProposalDecisionPackage(proposalId));
      setState("ready");
    } catch (error) {
      if (isNotEntitled(error)) {
        setState("forbidden");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Không tải được hồ sơ trình phê duyệt.");
      setState("error");
    }
  }

  useEffect(() => {
    void refresh();
  }, [proposalId]);

  const isApproved = decisionPackage?.proposalStatus === "approved" || decisionPackage?.decisions?.some((d) => d.decision === "approved");
  const hasApprovedBudget = Boolean(existingApprovedBudget || (isApproved && requestedBudget > 0));

  const currentBudgetAmount = Number(approvedAmount) || requestedBudget || 0;
  const currentBudgetNote = budgetNote || requestedNote || "";

  const modalProposalData = useMemo(() => {
    return {
      id: proposalId,
      code: proposal?.code || decisionPackage?.code,
      title: proposal?.title || decisionPackage?.title || "Đề tài nghiên cứu khoa học",
      proposalTypeCode: proposal?.proposalTypeCode || decisionPackage?.proposalTypeCode,
      researchFieldCode: proposal?.researchFieldCode || decisionPackage?.researchFieldCode,
      militaryScope: proposal?.militaryScope,
      ownerDisplayName: proposal?.ownerDisplayName,
      hostOrganizationUnitName: proposal?.hostOrganizationUnitName,
      hostOrganizationUnitId: proposal?.hostOrganizationUnitId,
      startDate: proposal?.startDate,
      endDate: proposal?.endDate,
      budgetMetadata: {
        amount: currentBudgetAmount,
        currency: "VND",
        note: currentBudgetNote
      },
      decisions: decisionPackage?.decisions || proposal?.decisions
    };
  }, [proposalId, proposal, decisionPackage, currentBudgetAmount, currentBudgetNote]);

  if (state === "loading") {
    return <p className="state-message">Đang tải hồ sơ chờ quyết định...</p>;
  }

  if (state === "error") {
    return <p className="state-message error">{loadError}</p>;
  }

  if (state === "forbidden" || !decisionPackage) {
    return (
      <SectionCard title="Quyết định phê duyệt đề tài" subtitle="Lãnh đạo phê duyệt hoặc từ chối hồ sơ">
        <button className="button primary" type="button" disabled title={blockedReason}>
          Phê duyệt
        </button>
        <p className="record-meta">{blockedReason}</p>
      </SectionCard>
    );
  }

  const { conflict, evaluationSummary, progress } = decisionPackage;

  // --- Xử lý Mục 1: Phê duyệt đề tài ---
  function promptDecide(decision: "approve" | "reject") {
    setError("");
    setMessage("");

    if (decision === "reject" && !note.trim()) {
      setError("Nhập lý do khi không phê duyệt hồ sơ.");
      return;
    }

    setConfirmingDecision(decision);
  }

  async function executeDecide(decision: "approve" | "reject") {
    setError("");
    setMessage("");

    setBusyDecision(decision);
    try {
      const payload = {
        note: note.trim()
      };

      const result = await decideProposal(proposalId, decision, payload);
      setMessage(`Đã ghi nhận quyết định: ${result.decision.decisionLabel}.`);
      setNote("");
      setConfirmingDecision("");
      await refresh();
      onDecision();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Không thể ghi nhận quyết định.");
    } finally {
      setBusyDecision("");
    }
  }

  // --- Xử lý Mục 2: Duyệt kinh phí đề tài ---
  function promptApproveBudget() {
    setBudgetError("");
    setBudgetMessage("");

    const approvedNum = Number(approvedAmount);
    if (isNaN(approvedNum) || approvedNum < 0) {
      setBudgetError("Vui lòng nhập mức kinh phí hợp lệ.");
      return;
    }

    setConfirmingBudget(true);
  }

  async function executeApproveBudget() {
    setBudgetError("");
    setBudgetMessage("");

    const approvedNum = Number(approvedAmount);
    setBusyBudget(true);
    try {
      await approveProposalBudget(proposalId, {
        approvedBudget: approvedNum,
        budgetNote: budgetNote.trim() || requestedNote || "Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026"
      });
      setBudgetMessage(`Đã duyệt kinh phí thực hiện: ${formatVndNumber(approvedNum)} VND (${numberToVietnameseWords(approvedNum)}).`);
      setConfirmingBudget(false);
      await refresh();
      onDecision();
    } catch (thrown) {
      setBudgetError(thrown instanceof Error ? thrown.message : "Không thể ghi nhận duyệt kinh phí.");
    } finally {
      setBusyBudget(false);
    }
  }

  return (
    <>
      {/* =========================================================================
          MỤC 1: QUYẾT ĐỊNH PHÊ DUYỆT ĐỀ TÀI
          ========================================================================= */}
      <div id="proposal-approval-section" style={{ marginBottom: "24px" }}>
        <SectionCard
          title="1. Quyết định phê duyệt đề tài"
          subtitle="Thẩm định học thuật, ý kiến hội đồng và thẩm quyền phê duyệt danh mục đề tài của Lãnh đạo Học viện"
          action={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <StatusBadge status={decisionPackage.proposalStatus} />
            </div>
          }
        >
          {isApproved && (
            <div
              style={{
                padding: "14px 18px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: "#166534",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: "#166534", fontSize: "14px" }}>
                    Đề tài đã được Lãnh đạo Học viện phê duyệt thực hiện
                  </p>
                  <p style={{ margin: "2px 0 0 0", color: "#15803d", fontSize: "12px" }}>
                    Quyết định phê duyệt danh mục và nội dung nghiên cứu đã được ban hành chính thức.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => exportProposalApprovalDecisionWord(modalProposalData)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "5px 12px" }}
                  title="Tải văn bản Quyết định phê duyệt đề tài (.doc)"
                >
                  <FileDown size={14} />
                  Lưu Quyết định (Word)
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setShowDecisionModal(true)}
                  style={{
                    background: "#166534",
                    borderColor: "#166534",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    padding: "5px 12px"
                  }}
                >
                  <Printer size={14} />
                  Xem & In Quyết định
                </button>
              </div>
            </div>
          )}

          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Phiếu đánh giá đã gửi</span>
              <span className="meta-value">
                {progress.submittedCount}/{progress.activeAssignmentCount}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Điểm trung bình</span>
              <span className="meta-value">
                {progress.averageTotalScore === null ? "Chưa có" : `${progress.averageTotalScore}/${progress.maxTotalScore}`}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Kết luận tổng hợp</span>
              <span className="meta-value">{evaluationSummary?.recommendationLabel || "Chưa tổng hợp"}</span>
            </div>
          </div>

          {conflict.conflicted ? (
            <p className="state-message warning" role="status">
              {conflict.viewerMessage}
            </p>
          ) : null}

          {evaluationSummary ? (
            <div className="form-section-inline">
              <div className="section-mini-heading">Tổng hợp của chuyên viên</div>
              <p className="record-title">{evaluationSummary.summary}</p>
              <p className="record-meta">
                {evaluationSummary.updatedByDisplayName || "Chuyên viên quản lý khoa học"} · Chuyển trình{" "}
                {formatDate(evaluationSummary.markedReadyAt)}
              </p>
            </div>
          ) : (
            <EmptyState title="Chưa có tổng hợp kết quả" message="Chuyên viên quản lý khoa học cần tổng hợp kết quả trước khi trình phê duyệt." />
          )}

          {decisionPackage.reviews.length ? (
            <div className="form-section-inline">
              <div className="section-mini-heading">Nhận xét của người đánh giá</div>
              <div className="timeline">
                {decisionPackage.reviews.map((review) => (
                  <article className="timeline-item" key={review.id}>
                    <span className="timeline-dot" />
                    <div>
                      <p className="timeline-title">
                        {review.reviewerDisplayName} · {review.totalScore}/{review.maxTotalScore} điểm
                      </p>
                      <p className="timeline-meta">
                        {review.recommendationLabel} · {formatDate(review.submittedAt)}
                      </p>
                      <p className="timeline-meta">{review.comment}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {decisionPackage.decisions.length ? (
            <div className="form-section-inline">
              <div className="section-mini-heading">Quyết định đã ban hành</div>
              <div className="timeline">
                {decisionPackage.decisions.map((decision) => (
                  <article className="timeline-item" key={decision.id}>
                    <span className="timeline-dot" />
                    <div>
                      <p className="timeline-title">{decision.decisionLabel}</p>
                      <p className="timeline-meta">
                        {decision.decidedByDisplayName || "Lãnh đạo"} · {formatDate(decision.decidedAt)}
                      </p>
                      {decision.note ? <p className="timeline-meta">{decision.note}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {/* Form Phê duyệt / Từ chối đề tài */}
          <form className="admin-form compact-form" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>Ý kiến chỉ đạo phê duyệt đề tài (bắt buộc khi không phê duyệt)</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={!canDecide || !decisionPackage.canDecide}
                placeholder="Nhập ý kiến chỉ đạo hoặc căn cứ quyết định đề tài..."
              />
            </label>

            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="state-message success">{message}</p> : null}

            {confirmingDecision === "approve" ? (
              <div
                style={{
                  padding: "14px 16px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "8px",
                  margin: "10px 0"
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#166534", marginBottom: "6px" }}>
                  Xác nhận phê duyệt đề tài khoa học này?
                </div>
                <p style={{ fontSize: "13px", color: "#15803d", margin: "0 0 10px 0" }}>
                  Đề tài sẽ được chuyển sang trạng thái <strong>Đã phê duyệt</strong> và ban hành quyết định chính thức.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button primary"
                    style={{ background: "#166534", borderColor: "#166534" }}
                    disabled={busyDecision !== ""}
                    onClick={() => void executeDecide("approve")}
                  >
                    <CheckCircle2 size={16} aria-hidden="true" />
                    {busyDecision === "approve" ? "Đang xử lý..." : "Xác nhận Phê duyệt đề tài"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busyDecision !== ""}
                    onClick={() => setConfirmingDecision("")}
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            ) : confirmingDecision === "reject" ? (
              <div
                style={{
                  padding: "14px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px",
                  margin: "10px 0"
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#991b1b", marginBottom: "6px" }}>
                  Xác nhận không phê duyệt hồ sơ đề tài này?
                </div>
                <p style={{ fontSize: "13px", color: "#b91c1c", margin: "0 0 10px 0" }}>
                  Quyết định không phê duyệt và ý kiến chỉ đạo sẽ được lưu vào lịch sử theo dõi đề tài.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busyDecision !== ""}
                    onClick={() => void executeDecide("reject")}
                  >
                    <XCircle size={16} aria-hidden="true" />
                    {busyDecision === "reject" ? "Đang xử lý..." : "Xác nhận Không phê duyệt"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busyDecision !== ""}
                    onClick={() => setConfirmingDecision("")}
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            ) : (
              <div className="button-row">
                <button
                  className="button primary"
                  type="button"
                  disabled={!canDecide || !decisionPackage.canDecide || busyDecision !== ""}
                  onClick={() => promptDecide("approve")}
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Phê duyệt đề tài
                </button>
                <button
                  className="button danger"
                  type="button"
                  disabled={!canDecide || !decisionPackage.canDecide || busyDecision !== ""}
                  onClick={() => promptDecide("reject")}
                >
                  <XCircle size={16} aria-hidden="true" />
                  Không phê duyệt
                </button>
              </div>
            )}

            {!canDecide || !decisionPackage.canDecide ? (
              <p className="record-meta">
                {blockedReason || `Hồ sơ đang ở trạng thái "${decisionPackage.proposalStatusLabel}" nên chưa thể ra quyết định phê duyệt đề tài.`}
              </p>
            ) : null}
          </form>
        </SectionCard>
      </div>

      {/* =========================================================================
          MỤC 2: QUYẾT ĐỊNH DUYỆT KINH PHÍ ĐỀ TÀI
          ========================================================================= */}
      <div id="budget-approval-section" style={{ marginBottom: "24px" }}>
        <SectionCard
          title="2. Quyết định duyệt kinh phí đề tài"
          subtitle="Thẩm định dự toán đề xuất của Chủ nhiệm đề tài và phê duyệt hạn mức kinh phí cấp phát chính thức"
          action={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {hasApprovedBudget ? (
                <>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setShowDecisionModal(true)}
                    style={{ padding: "4px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                    title="Xem và in văn bản Quyết định phê duyệt kinh phí"
                  >
                    <Printer size={14} aria-hidden="true" />
                    In Quyết định kinh phí
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => exportProposalApprovalDecisionWord(modalProposalData)}
                    style={{ padding: "4px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                    title="Lưu Quyết định phê duyệt kinh phí dạng Word (.doc)"
                  >
                    <FileDown size={14} aria-hidden="true" />
                    Lưu Word (.doc)
                  </button>
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 700
                    }}
                  >
                    Kinh phí đã duyệt
                  </span>
                </>
              ) : (
                <span
                  style={{
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 700
                  }}
                >
                  Chờ duyệt kinh phí
                </span>
              )}
            </div>
          }
        >
          {hasApprovedBudget && (
            <div
              style={{
                padding: "16px 20px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                marginBottom: "20px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "#166534",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <Coins size={18} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "#166534", fontSize: "14px" }}>
                      Kinh phí thực hiện đã được phê duyệt chính thức
                    </p>
                    <div style={{ marginTop: "6px", fontSize: "13px", color: "#15803d" }}>
                      <strong>Mức kinh phí phê duyệt: </strong>
                      <span style={{ fontSize: "16px", fontWeight: 800, color: "#166534" }}>
                        {formatVndNumber(currentBudgetAmount)} ₫
                      </span>
                      <span style={{ fontStyle: "italic", marginLeft: "6px" }}>
                        ({numberToVietnameseWords(currentBudgetAmount)})
                      </span>
                    </div>
                    {currentBudgetNote && (
                      <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#166534" }}>
                        <strong>Nguồn kinh phí: </strong>{currentBudgetNote}
                      </p>
                    )}
                    <p style={{ margin: "4px 0 0 0", color: "#15803d", fontSize: "12px" }}>
                      Hạn mức kinh phí đã có hiệu lực thực hiện và được cập nhật vào kế hoạch tài chính Học viện.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => exportProposalApprovalDecisionWord(modalProposalData)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      padding: "6px 14px"
                    }}
                    title="Tải văn bản Quyết định dưới dạng file Microsoft Word (.doc)"
                  >
                    <FileDown size={15} />
                    Lưu file Word (.doc)
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setShowDecisionModal(true)}
                    style={{
                      background: "#166534",
                      borderColor: "#166534",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      padding: "6px 14px"
                    }}
                  >
                    <Printer size={15} />
                    Xem & In Quyết định chuẩn
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              padding: "16px 20px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              marginBottom: "16px"
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {/* Box 1: Dự toán đề xuất */}
              <div style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <span className="meta-label" style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>
                  Dự toán Chủ nhiệm đề tài đề xuất
                </span>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#15803d", marginTop: "4px" }}>
                  {requestedBudget > 0 ? `${formatVndNumber(requestedBudget)} ₫` : "Chưa khai báo dự toán"}
                </div>
                {requestedBudget > 0 && (
                  <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", marginTop: "2px" }}>
                    Bằng chữ: {numberToVietnameseWords(requestedBudget)}
                  </div>
                )}
                <div style={{ fontSize: "12px", color: "#475569", marginTop: "8px" }}>
                  <strong>Nguồn đề xuất: </strong>{requestedNote || "Chưa có"}
                </div>
              </div>

              {/* Box 2: Kinh phí phê duyệt */}
              <div style={{ background: "#ffffff", padding: "14px 16px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label htmlFor="approved-budget-input" style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>
                    Kinh phí phê duyệt chính thức (VND) *
                  </label>
                  {requestedBudget > 0 && Number(approvedAmount) !== requestedBudget && (
                    <button
                      type="button"
                      className="button button-ghost"
                      style={{ fontSize: "11px", padding: "2px 6px", color: "#15803d" }}
                      onClick={() => {
                        setApprovedAmount(requestedBudget);
                        setBudgetNote(requestedNote || "Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026");
                      }}
                    >
                      Duyệt đúng dự toán
                    </button>
                  )}
                </div>
                <input
                  id="approved-budget-input"
                  type="number"
                  min={0}
                  step={1000000}
                  value={approvedAmount}
                  onChange={(e) => setApprovedAmount(e.target.value)}
                  placeholder="Nhập mức kinh phí phê duyệt..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#166534"
                  }}
                />
                <div style={{ fontSize: "12px", color: "#15803d", fontWeight: 600, fontStyle: "italic", marginTop: "4px" }}>
                  Bằng chữ: {numberToVietnameseWords(Number(approvedAmount) || 0)}
                </div>

                <div style={{ marginTop: "10px" }}>
                  <label
                    htmlFor="approved-budget-note"
                    style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}
                  >
                    Nguồn kinh phí / Ghi chú cấp phát
                  </label>
                  <input
                    id="approved-budget-note"
                    type="text"
                    value={budgetNote}
                    onChange={(e) => setBudgetNote(e.target.value)}
                    placeholder="Ví dụ: Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                  />
                </div>
              </div>
            </div>

            {budgetError ? <p className="form-error" style={{ marginTop: "10px" }}>{budgetError}</p> : null}
            {budgetMessage ? <p className="state-message success" style={{ marginTop: "10px" }}>{budgetMessage}</p> : null}

            {confirmingBudget ? (
              <div
                style={{
                  padding: "14px 16px",
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  borderRadius: "8px",
                  marginTop: "12px"
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#166534", marginBottom: "6px" }}>
                  Xác nhận phê duyệt kinh phí thực hiện đề tài?
                </div>
                <div style={{ fontSize: "13px", color: "#15803d", marginBottom: "10px", lineHeight: 1.5 }}>
                  Mức kinh phí phê duyệt: <strong>{formatVndNumber(Number(approvedAmount))} ₫</strong>
                  <br />
                  <span style={{ fontStyle: "italic", fontSize: "12px" }}>
                    (Bằng chữ: {numberToVietnameseWords(Number(approvedAmount))})
                  </span>
                  {budgetNote && (
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#166534" }}>
                      Nguồn kinh phí: {budgetNote}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button primary"
                    style={{ background: "#166534", borderColor: "#166534" }}
                    disabled={busyBudget}
                    onClick={() => void executeApproveBudget()}
                  >
                    <Coins size={16} aria-hidden="true" />
                    {busyBudget ? "Đang xử lý..." : "Xác nhận & Ban hành kinh phí"}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busyBudget}
                    onClick={() => setConfirmingBudget(false)}
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => setShowDecisionModal(true)}
                  >
                    <Printer size={14} />
                    Xem trước dự thảo Quyết định
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => exportProposalApprovalDecisionWord(modalProposalData)}
                    title="Tải dự thảo Quyết định kèm mức kinh phí dưới dạng file Word (.doc)"
                  >
                    <FileDown size={14} />
                    Lưu dự thảo Word (.doc)
                  </button>
                </div>

                <button
                  type="button"
                  className="button primary"
                  disabled={busyBudget}
                  onClick={promptApproveBudget}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Coins size={16} />
                  {busyBudget ? "Đang lưu..." : hasApprovedBudget ? "Cập nhật mức kinh phí phê duyệt" : "Phê duyệt kinh phí đề tài"}
                </button>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <OfficialDecisionModal
        isOpen={showDecisionModal}
        onClose={() => setShowDecisionModal(false)}
        proposal={modalProposalData}
      />
    </>
  );
}
