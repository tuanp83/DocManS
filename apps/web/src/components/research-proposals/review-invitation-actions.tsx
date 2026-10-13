"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { acceptReviewInvitation, declineReviewInvitation } from "@/lib/proposal-evaluations-api";

/**
 * Nút Đồng ý / Từ chối lời mời phản biện. Đồng ý mở hồ sơ và phiếu chấm; từ chối bắt buộc lý do và
 * báo cho chuyên viên QLKH để mời người khác. Máy chủ kiểm tra lại người được mời và trạng thái lời mời.
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
  onResponded: (response: "accept" | "decline") => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"" | "accept" | "decline">("");
  const [error, setError] = useState("");
  const size = compact ? { padding: "4px 10px", fontSize: "12px" } : { padding: "6px 12px", fontSize: "12px" };

  async function handleAccept() {
    setError("");
    if (!window.confirm(`Đồng ý nhận phản biện hồ sơ "${proposalTitle}"? Sau khi đồng ý bạn sẽ xem được hồ sơ và chấm phiếu đánh giá.`)) return;
    setBusy("accept");
    try {
      await acceptReviewInvitation(proposalId, assignmentId);
      await onResponded("accept");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xác nhận lời mời.");
    } finally {
      setBusy("");
    }
  }

  async function handleDecline() {
    setError("");
    const reason = window.prompt(`Lý do từ chối phản biện hồ sơ "${proposalTitle}":`);
    if (reason === null) return;
    if (!reason.trim()) {
      setError("Cần nhập lý do từ chối.");
      return;
    }
    setBusy("decline");
    try {
      await declineReviewInvitation(proposalId, assignmentId, reason.trim());
      await onResponded("decline");
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
