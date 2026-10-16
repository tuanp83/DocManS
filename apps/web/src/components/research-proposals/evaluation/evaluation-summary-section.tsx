"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Save, Send, FileDown } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import {
  finalizeProposalEvaluationSummary,
  reopenProposalEvaluationSummary,
  saveProposalEvaluationSummary,
  submitProposalEvaluationPackage,
  type EvaluationApiError,
  type ProposalReviewProgress
} from "@/lib/proposal-evaluations-api";
import type { ResearchProposal } from "@/lib/research-proposals-api";
import { exportEvaluationSummaryWord } from "@/lib/word-export";
import { formatDate } from "./evaluation-format";
import { useConfirm, useAskReason } from "@/components/ui/confirm-dialog";

/** Nội dung tổng hợp điền sẵn từ kết luận của Hội đồng sau khi ghi biên bản họp. */
export type SummaryPrefill = { id: number; text: string; recommendation: string };

/** Khối 3: tổng hợp kết quả đánh giá. Lưu nháp, chốt, trình lãnh đạo hoặc mở lại bản đã chốt. */
export function EvaluationSummarySection({
  proposalId,
  proposal,
  progress,
  prefill,
  canConsolidate,
  canFinalize,
  canSubmitPackage,
  consolidateBlockedReason,
  onChanged
}: {
  proposalId: string;
  proposal: ResearchProposal | null;
  progress: ProposalReviewProgress;
  prefill: SummaryPrefill | null;
  /** Lưu nháp tổng hợp (proposal.review.consolidate). */
  canConsolidate: boolean;
  /** Chốt bản nháp (proposal.review.finalize). */
  canFinalize: boolean;
  /** Trình lãnh đạo hoặc mở lại bản đã chốt (proposal.review.submit-package). */
  canSubmitPackage: boolean;
  consolidateBlockedReason: string;
  /** Tải lại dữ liệu và báo cho trang cha sau khi lưu, chốt, mở lại hoặc trình. */
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const askReason = useAskReason();
  const [summaryText, setSummaryText] = useState(() => progress.evaluationSummary?.summary ?? "");
  const [recommendation, setRecommendation] = useState(() => progress.evaluationSummary?.recommendation ?? "");
  const [summaryError, setSummaryError] = useState("");
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [savingMode, setSavingMode] = useState<"" | "draft" | "finalize" | "reopen" | "submit">("");
  const [message, setMessage] = useState("");

  const isReadyForApproval = progress.evaluationSummary?.status === "ready_for_approval";
  const isFinalized = progress.evaluationSummary?.status === "finalized";
  const canEditSummary = canConsolidate && !isFinalized && !isReadyForApproval;

  // Đồng bộ với bản tổng hợp trên máy chủ, trừ khi người dùng đang sửa dở.
  const dirtyRef = useRef(false);
  dirtyRef.current = summaryDirty;
  const serverSummary = progress.evaluationSummary;
  useEffect(() => {
    if (dirtyRef.current) return;
    setSummaryText(serverSummary?.summary ?? "");
    setRecommendation(serverSummary?.recommendation ?? "");
  }, [serverSummary]);

  // Điền sẵn kết luận của Hội đồng nếu người dùng chưa sửa nội dung tổng hợp.
  const appliedPrefill = useRef<number | null>(null);
  useEffect(() => {
    if (!prefill || appliedPrefill.current === prefill.id) return;
    appliedPrefill.current = prefill.id;
    if (dirtyRef.current) return;
    setSummaryText(prefill.text);
    setRecommendation(prefill.recommendation);
    setSummaryDirty(true);
  }, [prefill]);

  /** Tổng hợp ba bước: lưu nháp → chốt → trình lãnh đạo; bản đã chốt có thể mở lại (kèm lý do) trước khi trình. */
  async function handleSummaryAction(mode: "draft" | "finalize" | "reopen" | "submit") {
    setSummaryError("");
    setPendingNames([]);
    setMessage("");
    const revision = progress.evaluationSummary?.revision;

    if (mode === "draft") {
      if (!summaryText.trim()) {
        setSummaryError("Nhập nội dung tổng hợp kết quả đánh giá.");
        return;
      }
      if (!recommendation) {
        setSummaryError("Chọn kết luận tổng hợp.");
        return;
      }
    }
    if (mode === "finalize" && !(await confirm("Chốt bản tổng hợp? Nội dung và danh sách phiếu sẽ được khoá; muốn sửa phải mở lại.", { confirmLabel: "Chốt bản tổng hợp" }))) return;
    if (mode === "submit" && !(await confirm("Trình gói đánh giá? Gói đi qua Trưởng ban QLKH, Trưởng phòng KHQS rồi tới Giám đốc phê duyệt; vòng đánh giá được đóng lại.", { confirmLabel: "Trình gói đánh giá" }))) return;
    let reason = "";
    if (mode === "reopen") {
      reason = (await askReason("Mở lại bản tổng hợp đã chốt để sửa.", { label: "Lý do mở lại", confirmLabel: "Mở lại" })) ?? "";
      if (!reason) return;
    }

    setSavingMode(mode);
    try {
      if (mode === "draft") await saveProposalEvaluationSummary(proposalId, { summary: summaryText, recommendation });
      else if (mode === "finalize") await finalizeProposalEvaluationSummary(proposalId, { revision });
      else if (mode === "reopen") await reopenProposalEvaluationSummary(proposalId, { reason, revision });
      else await submitProposalEvaluationPackage(proposalId, { revision });
      if (mode === "draft") setSummaryDirty(false);
      setMessage({ draft: "Đã lưu bản nháp tổng hợp.", finalize: "Đã chốt bản tổng hợp.", reopen: "Đã mở lại bản tổng hợp để sửa.", submit: "Đã trình hồ sơ tới lãnh đạo phê duyệt." }[mode]);
      await onChanged();
    } catch (error) {
      const evaluationError = error as EvaluationApiError;
      setSummaryError(evaluationError.message);
      setPendingNames((evaluationError.pendingReviewers ?? []).map((item) => item.reviewerDisplayName).filter(Boolean));
    } finally {
      setSavingMode("");
    }
  }

  return (
      <SectionCard
        title="Tổng hợp kết quả đánh giá"
        subtitle="Tổng hợp kết luận chuyên môn để chuyển hồ sơ sang bước phê duyệt"
        action={
          progress.evaluationSummary?.statusLabel ? (
            <span className="record-meta">{progress.evaluationSummary.statusLabel}</span>
          ) : undefined
        }
      >
        <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span>Nội dung tổng hợp kết quả</span>
            <textarea
              rows={4}
              maxLength={5000}
              value={summaryText}
              onChange={(event) => {
                setSummaryText(event.target.value);
                setSummaryDirty(true);
              }}
              disabled={!canEditSummary}
            />
          </label>
          <label className="field">
            <span>Kết luận tổng hợp</span>
            <select
              value={recommendation}
              onChange={(event) => {
                setRecommendation(event.target.value);
                setSummaryDirty(true);
              }}
              disabled={!canEditSummary}
            >
              <option value="">-- Chọn kết luận --</option>
              {progress.recommendations.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {summaryError ? <p className="form-error">{summaryError}</p> : null}
          {message ? (
            <p className="state-message success" role="status">
              {message}
            </p>
          ) : null}
          {progress.evaluationSummary?.reopenReason ? <p className="record-meta">Đã mở lại bản đã chốt: {progress.evaluationSummary.reopenReason}</p> : null}
          {isFinalized ? <p className="record-meta">Bản tổng hợp đã chốt (phiên bản {progress.evaluationSummary?.revision}); chờ trình lãnh đạo.</p> : null}
          {pendingNames.length ? <p className="record-meta">Chờ phiếu của: {pendingNames.join(", ")}.</p> : null}
          {isReadyForApproval ? (
            <p className="state-message success compact-state">
              <CheckCircle2 size={16} aria-hidden="true" /> Đã chuyển lãnh đạo phê duyệt lúc{" "}
              {formatDate(progress.evaluationSummary?.markedReadyAt ?? "")}.
            </p>
          ) : null}

          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (!proposal) return;
                exportEvaluationSummaryWord({
                  code: proposal.code,
                  title: proposal.title,
                  ownerDisplayName: proposal.ownerDisplayName,
                  evaluationSummary: {
                    summary: summaryText,
                    recommendation: recommendation
                  }
                });
              }}
              title="Tải Báo cáo tổng hợp đánh giá đề tài dưới dạng file Word (.docx)"
            >
              <FileDown size={16} aria-hidden="true" />
              Lưu Báo cáo tổng hợp (Word)
            </button>
            <button
              className="button"
              type="button"
              disabled={!canEditSummary || savingMode !== ""}
              onClick={() => void handleSummaryAction("draft")}
            >
              <Save size={16} aria-hidden="true" />
              {savingMode === "draft" ? "Đang lưu" : "Lưu nháp tổng hợp"}
            </button>
            {canFinalize ? (
              <button
                className="button"
                type="button"
                disabled={!progress.allReviewsSubmitted || summaryDirty || savingMode !== ""}
                title={summaryDirty ? "Lưu nháp trước khi chốt" : undefined}
                onClick={() => void handleSummaryAction("finalize")}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                {savingMode === "finalize" ? "Đang chốt" : "Chốt bản tổng hợp"}
              </button>
            ) : null}
            {canSubmitPackage && isFinalized ? (
              <button className="button" type="button" disabled={savingMode !== ""} onClick={() => void handleSummaryAction("reopen")}>
                {savingMode === "reopen" ? "Đang mở lại" : "Mở lại để sửa"}
              </button>
            ) : null}
            {canSubmitPackage ? (
              <button
                className="button primary"
                type="button"
                disabled={!progress.allReviewsSubmitted || savingMode !== ""}
                onClick={() => void handleSummaryAction("submit")}
              >
                <Send size={16} aria-hidden="true" />
                {savingMode === "submit" ? "Đang trình" : "Trình Trưởng ban rà soát"}
              </button>
            ) : null}
          </div>
          {!canConsolidate && !canFinalize && !canSubmitPackage && !isReadyForApproval ? (
            <p className="record-meta">{consolidateBlockedReason || "Chỉ hồ sơ đang đánh giá mới được tổng hợp kết quả."}</p>
          ) : !progress.allReviewsSubmitted && !isReadyForApproval ? (
            <p className="record-meta">
              {progress.activeAssignmentCount === 0
                ? "Chưa phân công người đánh giá nên chưa thể chuyển hồ sơ sang chờ phê duyệt."
                : progress.councilProblems?.length
                  ? `Thành phần hội đồng chưa đúng quy định: ${progress.councilProblems.join(" ")}`
                  : "Còn phiếu đánh giá chưa gửi nên chưa thể chuyển hồ sơ sang chờ phê duyệt."}
            </p>
          ) : null}
        </form>
      </SectionCard>
  );
}
