import { ForbiddenException } from "@nestjs/common";
import type { SafeUserContext } from "../auth/auth.types.js";
import { evaluateProposalConflict, type ProposalParticipation } from "./proposal-participation.js";
import type { ProposalReviewAccess } from "./proposal-review-access.js";
import type { ProposalManagementOfficerResolution } from "./proposal-management-officer.service.js";
import { isWorkflowVisibleStatus } from "./proposal-workflow.js";

type IntakeLike = {
  applicableOrganizationUnitIds?: string[];
  applicableOrganizationUnitId?: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

type ProposalLike = {
  ownerId: string;
  hostOrganizationUnitId: string;
  status: string;
};

export function isSystemAdmin(user?: SafeUserContext) {
  return user?.systemRole === "SYSTEM_ADMIN";
}

export function isResearchManagement(user?: SafeUserContext) {
  return isResearchManagementStaff(user) || isResearchManagementHead(user);
}

export function isResearchManagementStaff(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCH_MANAGEMENT_STAFF";
}

export function isResearchManagementHead(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCH_MANAGEMENT_HEAD";
}

/** Phó Giám đốc (không phụ trách khoa học): chỉ theo dõi tiến độ, số lượng đề tài và báo cáo kinh phí tổng hợp. */
export function isResearchOversightAuthority(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCH_OVERSIGHT_AUTHORITY";
}

/** Phó phòng KHQS: theo dõi tiến độ và số lượng đề tài trong phạm vi, không duyệt. */
export function isResearchManagementDeputyHead(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCH_MANAGEMENT_DEPUTY_HEAD";
}

/** Trưởng ban QLKH: rà soát việc của chuyên viên và trình thủ tục lên Trưởng phòng. */
export function isResearchBoardHead(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCH_BOARD_HEAD";
}

/**
 * Lãnh đạo Phòng KHQS (Trưởng phòng, Phó phòng, Trưởng ban QLKH): xem mọi hồ sơ, đề tài trong phạm vi đơn vị.
 * Thứ bậc: chuyên viên < Trưởng ban < Phó phòng < Trưởng phòng. Quyền thao tác của từng cấp kiểm tra riêng.
 */
export function isResearchDepartmentLeadership(user?: SafeUserContext) {
  return isResearchManagementHead(user) || isResearchManagementDeputyHead(user) || isResearchBoardHead(user);
}

/** Phó Giám đốc phụ trách Khoa học: ký thành lập hội đồng, gia hạn/điều chỉnh không đổi kinh phí. */
export function isScienceDeputyDirector(user?: SafeUserContext) {
  return user?.systemRole === "SCIENCE_DEPUTY_DIRECTOR";
}

/** Ban giám đốc có thẩm quyền ký trong lĩnh vực khoa học: Giám đốc hoặc Phó Giám đốc phụ trách Khoa học. */
export function isAcademyLeadership(user?: SafeUserContext) {
  return isLeadership(user) || isScienceDeputyDirector(user);
}

export function isResearcherInternalUser(user?: SafeUserContext) {
  return user?.systemRole === "RESEARCHER_INTERNAL_USER";
}

export function isInternalResearcherEligible(user?: SafeUserContext) {
  return isResearcherInternalUser(user) || isResearchOversightAuthority(user) || isResearchManagementStaff(user) || isResearchDepartmentLeadership(user) || isAcademyLeadership(user);
}

/** Giám đốc Học viện: phê duyệt đề tài, kinh phí, thanh lý và mọi thủ tục khoa học. */
export function isLeadership(user?: SafeUserContext) {
  return user?.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY";
}

export function assertCanManageIntakePeriods(user?: SafeUserContext) {
  if (!user || !isResearchManagement(user)) {
    throw new ForbiddenException({ message: "Không có quyền quản lý đợt tiếp nhận." });
  }

  return user as SafeUserContext;
}

export function assertCanCreateProposalDraft(user?: SafeUserContext) {
  if (!isInternalResearcherEligible(user)) {
    throw new ForbiddenException({ message: "Chỉ người dùng nghiên cứu nội bộ được tạo hồ sơ đề xuất." });
  }

  return user as SafeUserContext;
}

export function getOrganizationScopeIds(user?: SafeUserContext) {
  return user?.organizationScopes?.map((scope) => scope.id).filter(Boolean) ?? [];
}

/**
 * Điều kiện lọc thô ở DB cho danh sách hồ sơ: `canReadProposal` chỉ cho xem hồ sơ thuộc phạm vi đơn vị
 * của người dùng, hoặc hồ sơ người dùng có dòng phân công phản biện. Điều kiện này rộng hơn (không loại
 * hồ sơ nào `canReadProposal` cho phép); quyết định cuối cùng vẫn là `canReadProposal`.
 */
export function readableProposalCandidatesWhere(user: SafeUserContext) {
  return {
    OR: [
      { hostOrganizationUnitId: { in: getOrganizationScopeIds(user) } },
      { reviewAssignments: { some: { reviewerUserId: user.id } } }
    ]
  };
}

export function assertHasOrganizationScope(user: SafeUserContext, organizationUnitId: string) {
  if (!getOrganizationScopeIds(user).includes(organizationUnitId)) {
    throw new ForbiddenException({ message: "Không có quyền thao tác trong phạm vi đơn vị này." });
  }
}

export function isIntakeOpenForSubmission(intake: IntakeLike, now = new Date()) {
  return intake.status === "open" && intake.startsAt.getTime() <= now.getTime() && intake.endsAt.getTime() >= now.getTime();
}

export function intakeAppliesToUser(intake: IntakeLike, user: SafeUserContext) {
  if (intake.applicableOrganizationUnitIds?.length) return intake.applicableOrganizationUnitIds.some((id) => getOrganizationScopeIds(user).includes(id));
  if (!intake.applicableOrganizationUnitId) {
    return true;
  }

  return getOrganizationScopeIds(user).includes(intake.applicableOrganizationUnitId);
}

/**
 * `participation` is the caller's resolved record-scoped relationship to this proposal (ST-3.0) and
 * `reviewAccess` their resolved reviewer assignment on it (ST-3.2). Both only ever widen access to
 * the single record they were resolved from, never to the user's account-level authority
 * (AUTH-ST-3.0-02). Omitting either keeps the narrower behaviour, which is the fail-closed
 * direction: an unresolved context grants nothing.
 */
export function canReadProposal(
  user: SafeUserContext | undefined,
  proposal: ProposalLike,
  participation?: ProposalParticipation,
  reviewAccess?: ProposalReviewAccess,
  managementOfficer?: ProposalManagementOfficerResolution
) {
  if (!user) {
    return false;
  }

  // An effective assignment grants review reads across units, never participant access.
  if (reviewAccess?.isAssignedReviewer && isWorkflowVisibleStatus(proposal.status) && !evaluateProposalConflict(participation).conflicted) {
    return true;
  }

  if (!getOrganizationScopeIds(user).includes(proposal.hostOrganizationUnitId)) {
    return false;
  }

  if (participation?.isParticipant) {
    return true;
  }

  if (isResearchDepartmentLeadership(user) || isResearchOversightAuthority(user)) {
    return true;
  }

  if (isAcademyLeadership(user)) {
    return isWorkflowVisibleStatus(proposal.status);
  }

  if (isResearchManagementStaff(user)) {
    return managementOfficer?.resolved === true && managementOfficer.officer?.officerUserId === user.id;
  }

  return proposal.ownerId === user.id;
}

/**
 * Nhật ký hành động của hồ sơ ghi danh tính người thực hiện (chủ nhiệm, phản biện, người chấm).
 * Chỉ người đọc hồ sơ với tư cách quản lý được xem, và không phải chủ nhiệm, thành viên hay phản biện
 * của chính hồ sơ đó (giữ ẩn danh hai chiều giữa chủ nhiệm và phản biện).
 */
export function canReadProposalAuditTrail(
  user: SafeUserContext | undefined,
  proposal: ProposalLike,
  participation?: ProposalParticipation,
  reviewAccess?: ProposalReviewAccess,
  managementOfficer?: ProposalManagementOfficerResolution
) {
  if (!user || proposal.ownerId === user.id || participation?.isParticipant || reviewAccess?.isAssignedReviewer) {
    return false;
  }
  if (!getOrganizationScopeIds(user).includes(proposal.hostOrganizationUnitId)) {
    return false;
  }
  if (isResearchDepartmentLeadership(user) || isResearchOversightAuthority(user)) {
    return true;
  }
  if (isAcademyLeadership(user)) {
    return isWorkflowVisibleStatus(proposal.status);
  }
  if (isResearchManagementStaff(user)) {
    return managementOfficer?.resolved === true && managementOfficer.officer?.officerUserId === user.id;
  }
  return false;
}

export function assertCanReadProposal(
  user: SafeUserContext | undefined,
  proposal: ProposalLike,
  participation?: ProposalParticipation,
  reviewAccess?: ProposalReviewAccess,
  managementOfficer?: ProposalManagementOfficerResolution
) {
  if (!canReadProposal(user, proposal, participation, reviewAccess, managementOfficer)) {
    throw new ForbiddenException({ message: "Không có quyền xem hồ sơ đề xuất này." });
  }

  return user as SafeUserContext;
}

export function assertCanEditProposalDraft(user: SafeUserContext | undefined, proposal: ProposalLike) {
  if (!user) {
    throw new ForbiddenException({ message: "Không có quyền sửa hồ sơ đề xuất này." });
  }
  const actor = user;

  if (proposal.ownerId !== actor.id) {
    throw new ForbiddenException({ message: "Không có quyền sửa hồ sơ đề xuất này." });
  }

  return actor;
}
