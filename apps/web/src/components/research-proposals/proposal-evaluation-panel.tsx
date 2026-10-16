"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useCallback, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { CouncilSection } from "./evaluation/council-section";
import type { MinutesOutcome } from "./evaluation/council-minutes-form";
import { EvaluationSummarySection, type SummaryPrefill } from "./evaluation/evaluation-summary-section";
import { ReviewerAssignmentSection } from "./evaluation/reviewer-assignment-section";
import { useProposalEvaluation } from "./evaluation/use-proposal-evaluation";

export type { DynamicCouncilMember } from "./evaluation/evaluation-format";

const MINUTES_CONCLUSION_TEXT = {
  approved: "Đạt yêu cầu (Đề nghị phê duyệt)",
  revision_required: "Đạt nhưng cần chỉnh sửa bổ sung",
  rejected: "Không đạt yêu cầu"
} as const;

const MINUTES_RECOMMENDATION = { approved: "approve", revision_required: "revise", rejected: "reject" } as const;

/**
 * ST-3.2 + ST-3.4 + Epic 10 Council Workflow:
 * - Giai đoạn 1: Trưởng phòng KHQS lập Tờ trình đề xuất Hội đồng & Trình Lãnh đạo Học viện phê duyệt.
 * - Giai đoạn 2: Ghi nhận Biên bản & Kết luận phiên họp Hội đồng (Council Minutes).
 * - Vòng đánh giá: Phân công, theo dõi phiếu điểm và tổng hợp kết quả trình phê duyệt đề tài.
 *
 * Component chỉ ghép ba khối (Hội đồng, Phân công, Tổng hợp); mỗi khối giữ trạng thái nhập liệu riêng,
 * dữ liệu dùng chung do `useProposalEvaluation` tải.
 */
export function ProposalEvaluationPanel({
  proposalId,
  onWorkflowChange,
  canAssignReviewers,
  canConsolidate,
  canFinalize = false,
  canSubmitPackage = false,
  blockedReason,
  consolidateBlockedReason,
  contextVersion
}: {
  proposalId: string;
  onWorkflowChange: () => void;
  canAssignReviewers: boolean;
  /** Lưu nháp tổng hợp (proposal.review.consolidate). */
  canConsolidate: boolean;
  /** Chốt bản nháp (proposal.review.finalize). */
  canFinalize?: boolean;
  /** Trình lãnh đạo hoặc mở lại bản đã chốt (proposal.review.submit-package). */
  canSubmitPackage?: boolean;
  blockedReason: string;
  consolidateBlockedReason: string;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
}) {
  const { proposal, progress, state, loadError, councilCandidates, reviewerCandidates, reviewerCandidatesError, refresh } = useProposalEvaluation({
    proposalId,
    canAssignReviewers,
    contextVersion
  });
  const [summaryPrefill, setSummaryPrefill] = useState<SummaryPrefill | null>(null);

  /** Sau mỗi thao tác ghi: tải lại dữ liệu rồi báo cho trang cha cập nhật luồng công việc. */
  const onChanged = useCallback(async () => {
    await refresh();
    onWorkflowChange();
  }, [refresh, onWorkflowChange]);

  const onMinutesRecorded = useCallback(
    async ({ conclusion, averageScore, comments }: MinutesOutcome) => {
      setSummaryPrefill({
        id: Date.now(),
        text: `Hội đồng đánh giá đề tài đã họp và kết luận: ${MINUTES_CONCLUSION_TEXT[conclusion]}. Điểm trung bình: ${averageScore}/100. ${comments}`,
        recommendation: MINUTES_RECOMMENDATION[conclusion]
      });
      await onChanged();
    },
    [onChanged]
  );

  if (state === "loading") {
    return <p className="state-message">Đang tải tiến độ đánh giá & Hội đồng...</p>;
  }

  if (state === "error") {
    return <p className="state-message error">{loadError}</p>;
  }

  if (state === "forbidden" || !progress) {
    return (
      <SectionCard title="Phân công đánh giá" subtitle="Người phản biện và thành viên hội đồng">
        <button className="button primary" type="button" disabled title={blockedReason}>
          Phân công người đánh giá
        </button>
        <p className="record-meta">{blockedReason}</p>
      </SectionCard>
    );
  }

  return (
    <>
      <CouncilSection
        proposalId={proposalId}
        proposal={proposal}
        progress={progress}
        councilCandidates={councilCandidates}
        reviewerProfiles={reviewerCandidates.profiles}
        contextVersion={contextVersion}
        onChanged={onChanged}
        onMinutesRecorded={onMinutesRecorded}
      />
      <ReviewerAssignmentSection
        proposalId={proposalId}
        proposal={proposal}
        progress={progress}
        reviewerProfiles={reviewerCandidates.profiles}
        reviewerProfilesError={reviewerCandidatesError}
        canAssign={canAssignReviewers}
        contextVersion={contextVersion}
        onChanged={onChanged}
      />
      <EvaluationSummarySection
        proposalId={proposalId}
        proposal={proposal}
        progress={progress}
        prefill={summaryPrefill}
        canConsolidate={canConsolidate}
        canFinalize={canFinalize}
        canSubmitPackage={canSubmitPackage}
        consolidateBlockedReason={consolidateBlockedReason}
        onChanged={onChanged}
      />
    </>
  );
}
