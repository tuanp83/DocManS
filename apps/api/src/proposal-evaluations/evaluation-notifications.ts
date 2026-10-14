import { label, NOTIFICATION_TYPES, proposalLink, vnDate, type WorkflowEvent } from "../notifications/workflow-events.js";
import { getAssignmentRoleLabel } from "../proposals-shared/proposal-review-access.js";
import { IRB_ROLE_LABELS, type IrbMemberRole } from "./irb-council.js";

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

// ---- Hội đồng Đạo đức (IRB) -------------------------------------------------------------------------------

/** Lời mời tham gia Hội đồng IRB: người được mời chỉ thấy tên đề tài cho tới khi Ban giám đốc ký thành lập. */
export function irbInvitationEvent(proposalId: string, proposal: { code?: string | null; title: string }, userId: string, role: IrbMemberRole, meetingDate: string): WorkflowEvent {
  return {
    type: NOTIFICATION_TYPES.irbInvitation,
    userIds: [userId],
    title: `Mời tham gia Hội đồng Đạo đức (IRB): ${proposal.title}`,
    message: `Đồng chí được mời làm ${IRB_ROLE_LABELS[role]} Hội đồng Đạo đức trong nghiên cứu Y sinh học của đề tài ${label(proposal)}${meetingDate ? `, dự kiến họp ${vnDate(meetingDate)}` : ""}. Vui lòng đồng ý hoặc từ chối.`,
    link: proposalLink(proposalId),
    metadata: { proposalId, irbRole: role }
  };
}

export function irbInvitationResponseEvent(proposalId: string, proposal: { code?: string | null; title: string }, userIds: string[], memberName: string, role: IrbMemberRole, response: "accept" | "decline", reason: string): WorkflowEvent {
  const accepted = response === "accept";
  return {
    type: accepted ? NOTIFICATION_TYPES.irbInvitationAccepted : NOTIFICATION_TYPES.irbInvitationDeclined,
    userIds,
    title: `${memberName} ${accepted ? "nhận lời" : "từ chối"} Hội đồng IRB: ${proposal.title}`,
    message: accepted
      ? `${memberName} đã nhận lời làm ${IRB_ROLE_LABELS[role]} Hội đồng IRB của đề tài ${label(proposal)}.`
      : `${memberName} đã từ chối làm ${IRB_ROLE_LABELS[role]} Hội đồng IRB của đề tài ${label(proposal)}. Lý do: ${reason}. Cần mời người khác thay thế.`,
    link: proposalLink(proposalId),
    metadata: { proposalId, irbRole: role, response }
  };
}

export function irbCouncilEstablishedEvent(proposalId: string, proposal: { code?: string | null; title: string }, userIds: string[], decisionNumber: string): WorkflowEvent {
  return {
    type: NOTIFICATION_TYPES.irbCouncilEstablished,
    userIds,
    title: `Quyết định thành lập Hội đồng IRB: ${proposal.title}`,
    message: `Hội đồng Đạo đức của đề tài ${label(proposal)} đã được thành lập (${decisionNumber}). Đồng chí có thể xem hồ sơ và gửi nhận xét.`,
    link: proposalLink(proposalId),
    metadata: { proposalId, decisionNumber }
  };
}

/** Thông báo chung của luồng IRB cho chuyên viên, thư ký, thành viên. */
export function irbStaffEvent(proposalId: string, proposal: { code?: string | null; title: string }, userIds: string[], title: string, message: string): WorkflowEvent {
  return {
    type: NOTIFICATION_TYPES.irbUpdate,
    userIds,
    title: `${title}: ${proposal.title}`,
    message: `${label(proposal)}. ${message}`,
    link: proposalLink(proposalId),
    metadata: { proposalId }
  };
}
