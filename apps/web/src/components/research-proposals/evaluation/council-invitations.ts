import type { ProposalReviewAssignment, ProposalReviewProgress } from "@/lib/proposal-evaluations-api";
import type { CouncilMetadata } from "@/lib/research-proposals-api";
import { COUNCIL_ROLE_LABELS, formatDate } from "./evaluation-format";

export type CouncilInvitationRow = {
  role: string;
  roleLabel: string;
  userId?: string;
  displayName: string;
  accepted: boolean;
  statusLabel: string;
  detail: string;
  tone: string;
};

/** Tình trạng lời mời của từng thành viên trong tờ trình đã lưu (theo vòng đánh giá hiện tại). */
export function buildCouncilInvitationRows(council: CouncilMetadata | null | undefined, progress: ProposalReviewProgress): CouncilInvitationRow[] {
  return (council?.members ?? []).map((member) => {
    const mine = (list?: ProposalReviewAssignment[]) => (list ?? []).filter((item) => member.userId && item.reviewerUserId === member.userId);
    const active = mine(progress.assignments)[0];
    const invitation = mine(progress.councilInvitations)[0];
    const declinedRow = mine(progress.declinedAssignments)[0];
    const roleLabel = member.roleLabel && member.roleLabel !== member.role ? member.roleLabel : COUNCIL_ROLE_LABELS[member.role] ?? member.role;
    const base = { role: member.role, roleLabel, userId: member.userId, displayName: member.displayName };
    if (!member.userId) return { ...base, accepted: false, statusLabel: "Chưa gắn tài khoản", detail: "Chọn nhà khoa học có tài khoản để gửi lời mời.", tone: "#b91c1c" };
    if (active) return { ...base, accepted: true, statusLabel: "Đang được phân công", detail: active.acceptedAt ? `Nhận lời ${formatDate(active.acceptedAt)}` : "", tone: "#15803d" };
    if (invitation?.acceptedAt) return { ...base, accepted: true, statusLabel: "Đã nhận lời", detail: formatDate(invitation.acceptedAt), tone: "#15803d" };
    if (invitation) return { ...base, accepted: false, statusLabel: "Chờ xác nhận", detail: `Mời ${formatDate(invitation.assignedAt)}`, tone: "#c2410c" };
    if (declinedRow) return { ...base, accepted: false, statusLabel: "Đã từ chối — cần thay người khác", detail: declinedRow.declineReason, tone: "#b91c1c" };
    return { ...base, accepted: false, statusLabel: "Chưa gửi lời mời", detail: "", tone: "#64748b" };
  });
}
