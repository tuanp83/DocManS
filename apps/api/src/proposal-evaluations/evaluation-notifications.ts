import { label, NOTIFICATION_TYPES, proposalLink, vnDate, type WorkflowEvent } from "../notifications/workflow-events.js";
import { getAssignmentRoleLabel } from "../proposals-shared/proposal-review-access.js";

/** Lời mời tham gia đánh giá (phản biện, thành viên, thư ký hội đồng). */
export function reviewInvitationEvent(proposalId: string, proposal: { code?: string | null; title: string }, userId: string, role: string, dueDate: Date | null): WorkflowEvent {
  return {
    type: NOTIFICATION_TYPES.reviewInvitation,
    userIds: [userId],
    title: `Mời tham gia đánh giá đề tài: ${proposal.title}`,
    message: `Bạn được mời tham gia đánh giá hồ sơ ${label(proposal)} với vai trò ${getAssignmentRoleLabel(role)}. Hạn: ${vnDate(dueDate)}.`,
    link: "/invitation-to-review",
    metadata: { proposalId, assignmentRole: role, dueDate: dueDate?.toISOString() ?? null }
  };
}

/** Nhà khoa học đồng ý hoặc từ chối lời mời đánh giá: báo người phân công và cán bộ QLKH phụ trách. */
export function reviewInvitationResponseEvent(
  proposalId: string,
  proposal: { code?: string | null; title: string },
  userIds: string[],
  reviewerName: string,
  role: string,
  response: "accept" | "decline",
  reason: string
): WorkflowEvent {
  const accepted = response === "accept";
  return {
    type: accepted ? NOTIFICATION_TYPES.reviewInvitationAccepted : NOTIFICATION_TYPES.reviewInvitationDeclined,
    userIds,
    title: `${reviewerName} ${accepted ? "đồng ý" : "từ chối"} phản biện: ${proposal.title}`,
    message: accepted
      ? `${reviewerName} đã đồng ý tham gia đánh giá hồ sơ ${label(proposal)} với vai trò ${getAssignmentRoleLabel(role)}.`
      : `${reviewerName} đã từ chối tham gia đánh giá hồ sơ ${label(proposal)} (vai trò ${getAssignmentRoleLabel(role)}). Lý do: ${reason}. Cần mời người khác thay thế.`,
    link: proposalLink(proposalId),
    metadata: { proposalId, assignmentRole: role, response }
  };
}

/** Lãnh đạo ký quyết định thành lập hội đồng: thành viên đã nhận lời được mở hồ sơ để đánh giá. */
export function councilEstablishedEvent(proposalId: string, proposal: { code?: string | null; title: string }, userIds: string[], decisionNumber: string): WorkflowEvent {
  return {
    type: NOTIFICATION_TYPES.reviewCouncilEstablished,
    userIds,
    title: `Quyết định thành lập hội đồng: ${proposal.title}`,
    message: `Hội đồng đánh giá hồ sơ ${label(proposal)} đã được thành lập (${decisionNumber}). Bạn có thể xem hồ sơ và thực hiện đánh giá.`,
    link: "/invitation-to-review",
    metadata: { proposalId, decisionNumber }
  };
}
