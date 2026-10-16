"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useCallback, useEffect, useState } from "react";
import {
  isNotEntitled,
  loadCouncilCandidates,
  loadProposalReviewProgress,
  loadReviewerCandidates,
  type CouncilCandidate,
  type ProposalReviewProgress,
  type ReviewerCandidates
} from "@/lib/proposal-evaluations-api";
import { loadResearchProposal, type ResearchProposal } from "@/lib/research-proposals-api";

export type EvaluationLoadState = "loading" | "ready" | "forbidden" | "error";

/**
 * Tải dữ liệu cho panel đánh giá hồ sơ: tiến độ đánh giá, hồ sơ đề xuất, ứng viên hội đồng (kèm xung đột lợi ích)
 * và danh sách người đánh giá có thể phân công. Chỉ lo dữ liệu; các khối giao diện tự giữ trạng thái nhập liệu.
 */
export function useProposalEvaluation({
  proposalId,
  canAssignReviewers,
  contextVersion
}: {
  proposalId: string;
  canAssignReviewers: boolean;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
}) {
  const [proposal, setProposal] = useState<ResearchProposal | null>(null);
  const [progress, setProgress] = useState<ProposalReviewProgress | null>(null);
  const [state, setState] = useState<EvaluationLoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [councilCandidates, setCouncilCandidates] = useState<CouncilCandidate[]>([]);
  const [reviewerCandidates, setReviewerCandidates] = useState<ReviewerCandidates>({ profiles: [] });
  const [reviewerCandidatesError, setReviewerCandidatesError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [progressData, proposalData] = await Promise.all([
        loadProposalReviewProgress(proposalId),
        loadResearchProposal(proposalId).catch(() => null)
      ]);
      setProgress(progressData);
      if (proposalData) setProposal(proposalData);

      try {
        const councilData = await loadCouncilCandidates(proposalId);
        setCouncilCandidates(councilData.candidates || []);
      } catch (error) {
        console.warn("Could not load council candidates:", error);
      }

      if (canAssignReviewers) {
        try {
          setReviewerCandidates(await loadReviewerCandidates(proposalId, ""));
          setReviewerCandidatesError("");
        } catch (error) {
          setReviewerCandidates({ profiles: [] });
          setReviewerCandidatesError(error instanceof Error ? error.message : "Không tải được người đánh giá.");
        }
      } else {
        setReviewerCandidates({ profiles: [] });
      }
      setState("ready");
    } catch (error) {
      if (isNotEntitled(error)) {
        setState("forbidden");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Không tải được tiến độ đánh giá.");
      setState("error");
    }
  }, [proposalId, canAssignReviewers]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tải lại khi đổi hồ sơ, quyền phân công hoặc phiên bản ngữ cảnh
  }, [proposalId, canAssignReviewers, contextVersion?.aggregateVersion]);

  return { proposal, progress, state, loadError, councilCandidates, reviewerCandidates, reviewerCandidatesError, refresh };
}
