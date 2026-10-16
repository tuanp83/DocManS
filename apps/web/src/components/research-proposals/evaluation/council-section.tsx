"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { SectionCard } from "@/components/ui/section-card";
import type { CouncilCandidate, ProposalReviewProgress, ReviewerCandidates } from "@/lib/proposal-evaluations-api";
import type { ResearchProposal } from "@/lib/research-proposals-api";
import { CouncilApprovedView } from "./council-approved-view";
import { CouncilDraftForm } from "./council-draft-form";
import type { MinutesOutcome } from "./council-minutes-form";
import { CouncilStatusBadge } from "./council-status-badge";
import { CouncilSubmittedView } from "./council-submitted-view";

/** Khối 1: Hội đồng tư vấn đánh giá. Hiển thị theo trạng thái tờ trình: đã phê chuẩn, đã trình hoặc đang soạn. */
export function CouncilSection({
  proposalId,
  proposal,
  progress,
  councilCandidates,
  reviewerProfiles,
  contextVersion,
  onChanged,
  onMinutesRecorded
}: {
  proposalId: string;
  proposal: ResearchProposal | null;
  progress: ProposalReviewProgress;
  councilCandidates: CouncilCandidate[];
  reviewerProfiles: ReviewerCandidates["profiles"];
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  onChanged: () => Promise<void>;
  onMinutesRecorded: (outcome: MinutesOutcome) => Promise<void>;
}) {
  const council = proposal?.councilMetadata;
  const isCouncilApproved = council?.status === "approved";
  const isCouncilSubmitted = council?.status === "submitted";

  return (
    <SectionCard
      title="Hội đồng tư vấn đánh giá / xét duyệt đề tài"
      subtitle="Quy trình lập tờ trình từ Trưởng phòng KHQS trình Lãnh đạo Học viện phê chuẩn & ban hành Quyết định"
      action={<CouncilStatusBadge isCouncilApproved={isCouncilApproved} isCouncilSubmitted={isCouncilSubmitted} />}
    >
      {isCouncilApproved ? (
        <CouncilApprovedView proposalId={proposalId} proposal={proposal} council={council} contextVersion={contextVersion} onMinutesRecorded={onMinutesRecorded} />
      ) : isCouncilSubmitted ? (
        <CouncilSubmittedView council={council} />
      ) : (
        <CouncilDraftForm
          proposalId={proposalId}
          council={council}
          progress={progress}
          councilCandidates={councilCandidates}
          reviewerProfiles={reviewerProfiles}
          contextVersion={contextVersion}
          onChanged={onChanged}
        />
      )}
    </SectionCard>
  );
}
