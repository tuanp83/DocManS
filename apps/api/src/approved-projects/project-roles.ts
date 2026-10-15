import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isAcademyLeadership, isLeadership, isResearchBoardHead, isResearchDepartmentLeadership, isResearchManagement, isResearchManagementDeputyHead, isResearchManagementHead, isResearchManagementStaff, isResearchOversightAuthority } from "../proposals-shared/proposal-access.js";

/**
 * Ánh xạ vai trò cho module thực hiện đề tài theo mô hình 5 vai trò của nhánh này.
 *
 * Nhánh chính (thanhdotien278) dùng thêm RESEARCH_MANAGEMENT_HEAD và RESEARCH_OVERSIGHT_AUTHORITY.
 * Ở đây không có hai vai trò đó, nên:
 *   - Phân công / thu hồi chuyên viên phụ trách đề tài: lãnh đạo, hoặc chuyên viên QLKH có phạm vi đơn vị.
 *   - Thao tác nghiệp vụ hằng ngày (thiết lập mốc, xét báo cáo, xét điều chỉnh, thẩm định gia hạn):
 *     chỉ chuyên viên QLKH đang được phân công phụ trách chính đề tài đó.
 *   - Quyết định GIA HẠN và thành lập hội đồng nghiệm thu: Giám đốc hoặc Phó GĐ phụ trách Khoa học; phê duyệt
 *     thanh lý (có kinh phí): chỉ Giám đốc.
 *   - Phạm vi: lãnh đạo toàn Học viện; các vai trò khác cần phạm vi đơn vị chủ trì của đề tài
 *     (cùng nguyên tắc với quyền cấp giấy chứng nhận IRB / giải ngân của nhánh này).
 * Trạng thái nội bộ `ready_for_head_decision` được giữ nguyên tên để dễ đồng bộ dữ liệu với nhánh chính;
 * ý nghĩa ở nhánh này là "chờ lãnh đạo quyết định".
 */

export function isProjectStaff(actor?: SafeUserContext) {
  return isResearchManagement(actor);
}

/** Ban giám đốc ký trong lĩnh vực khoa học (Giám đốc, Phó GĐ phụ trách Khoa học): xem mọi đề tài. */
export function isProjectLeadership(actor?: SafeUserContext) {
  return isAcademyLeadership(actor);
}

/** Người được phân công / thu hồi chuyên viên phụ trách đề tài. */
export function canAssignProjectOfficer(actor?: SafeUserContext) {
  return isLeadership(actor) || isResearchManagement(actor);
}

/** Quyết định gia hạn (không đổi kinh phí) và thành lập hội đồng nghiệm thu: Giám đốc hoặc Phó GĐ phụ trách Khoa học. */
export function canDecideProjectExtension(actor?: SafeUserContext) {
  return isAcademyLeadership(actor);
}

/** Phê duyệt thanh lý (có quyết toán kinh phí): chỉ Giám đốc. */
export function canApproveProjectLiquidation(actor?: SafeUserContext) {
  return isLeadership(actor);
}

/**
 * Xem danh sách theo dõi tiến độ đề tài (ngoài chủ nhiệm và thành viên): Ban giám đốc, các Phó Giám đốc (theo dõi),
 * lãnh đạo Phòng KHQS và chuyên viên QLKH.
 */
export function canMonitorProjects(actor?: SafeUserContext) {
  return isAcademyLeadership(actor) || isResearchOversightAuthority(actor) || isResearchDepartmentLeadership(actor) || isResearchManagement(actor);
}

/**
 * Xem đề tài toàn Học viện: Ban giám đốc, Trưởng phòng KHQS, Trưởng ban QLKH. Với Trưởng phòng, Trưởng ban chỉ mở rộng
 * quyền xem và quản lý kinh phí; các thao tác khác (giao chuyên viên phụ trách…) vẫn theo phạm vi đơn vị.
 */
export function readsAllProjects(actor?: SafeUserContext) {
  return isAcademyLeadership(actor) || isResearchManagementHead(actor) || isResearchBoardHead(actor);
}

/**
 * Xem chi tiết kinh phí từng đề tài: các Phó Giám đốc chỉ theo dõi không xem (chỉ xem báo cáo tổng hợp); chuyên viên
 * QLKH chỉ đề tài mình đang phụ trách; Phó phòng chỉ đề tài mình là chủ nhiệm hoặc thành viên.
 */
export function canReadProjectFinanceDetail(actor?: SafeUserContext, relation: { isAssignedOfficer?: boolean; isParticipant?: boolean } = {}) {
  if (isResearchOversightAuthority(actor)) return false;
  if (isResearchManagementStaff(actor)) return relation.isAssignedOfficer === true;
  if (isResearchManagementDeputyHead(actor)) return relation.isParticipant === true;
  return true;
}

/** Quản lý kinh phí, giải ngân, quyết toán: Giám đốc, Trưởng phòng, Trưởng ban QLKH (toàn Học viện), hoặc chuyên viên đang phụ trách đề tài. */
export function canManageProjectFinance(actor: SafeUserContext | undefined, isAssignedOfficer: boolean) {
  return isLeadership(actor) || isResearchManagementHead(actor) || isResearchBoardHead(actor) || (isResearchManagementStaff(actor) && isAssignedOfficer);
}

export function isInProjectScope(actor: SafeUserContext | undefined, hostOrganizationUnitId: string) {
  if (!actor) return false;
  return isAcademyLeadership(actor) || getOrganizationScopeIds(actor).includes(hostOrganizationUnitId);
}
