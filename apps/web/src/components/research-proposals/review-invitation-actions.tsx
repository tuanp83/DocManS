"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { acceptReviewInvitation, declineReviewInvitation, type ProposalReviewAssignment } from "@/lib/proposal-evaluations-api";
import { useConfirm, useAskReason } from "@/components/ui/confirm-dialog";

/**
 * Nút Đồng ý / Từ chối lời mời phản biện hoặc lời mời vào hội đồng. Đồng ý lời mời phản biện mở hồ sơ ngay;
 * lời mời hội đồng mở hồ sơ khi lãnh đạo ký quyết định thành lập. Từ chối bắt buộc lý do và báo chuyên viên QLKH. Máy chủ kiểm tra lại người được mời và trạng thái lời mời.
 */
export function ReviewInvitationActions({
  proposalId,
  assignmentId,
  proposalTitle,
  compact = false,
  onResponded
}: {
  proposalId: string;
  assignmentId: string;
  proposalTitle: string;
  compact?: boolean;
  onResponded: (response: "accept" | "decline", assignment: ProposalReviewAssignment) => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const askReason = useAskReason();
  const [busy, setBusy] = useState<"" | "accept" | "decline">("");
  const [error, setError] = useState("");
  const size = compact ? { padding: "4px 10px", fontSize: "12px" } : { padding: "6px 12px", fontSize: "12px" };

  async function handleAccept() {
    setError("");
    if (!(await confirm(`Đồng ý tham gia đánh giá hồ sơ "${proposalTitle}"?`, { confirmLabel: "Đồng ý tham gia" }))) return;
    setBusy("accept");
    try {
      const assignment = await acceptReviewInvitation(proposalId, assignmentId);
      await onResponded("accept", assignment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xác nhận lời mời.");
    } finally {
      setBusy("");
    }
  }

  async function handleDecline() {
    setError("");
    const reason = await askReason(`Từ chối tham gia đánh giá hồ sơ "${proposalTitle}".`, { label: "Lý do từ chối", confirmLabel: "Từ chối", tone: "danger" });
    if (reason === null) return;
    setBusy("decline");
    try {
      const assignment = await declineReviewInvitation(proposalId, assignmentId, reason.trim());
      await onResponded("decline", assignment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể từ chối lời mời.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: compact ? "flex-end" : "flex-start", gap: "4px" }}>
      <div style={{ display: "inline-flex", gap: "8px" }}>
        <button
          type="button"
          className="button primary"
          disabled={busy !== ""}
          onClick={() => void handleAccept()}
          style={{ ...size, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          {busy === "accept" ? "Đang xác nhận..." : "Đồng ý"}
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy !== ""}
          onClick={() => void handleDecline()}
          style={{ ...size, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
        >
          <XCircle size={14} aria-hidden="true" />
          {busy === "decline" ? "Đang gửi..." : "Từ chối"}
        </button>
      </div>
      {error ? (
        <span role="alert" style={{ fontSize: "12px", color: "#b91c1c" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
