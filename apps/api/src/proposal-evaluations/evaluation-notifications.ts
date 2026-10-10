import { label, NOTIFICATION_TYPES, vnDate, type WorkflowEvent } from "../notifications/workflow-events.js";
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
