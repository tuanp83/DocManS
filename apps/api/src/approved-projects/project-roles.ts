import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isAcademyLeadership, isLeadership, isResearchBoardHead, isResearchDepartmentLeadership, isResearchManagement, isResearchManagementHead, isResearchManagementStaff, isResearchOversightAuthority } from "../proposals-shared/proposal-access.js";

/**
 * Nguồn duy nhất cho quy tắc vai trò của module thực hiện đề tài (10 vai trò hệ thống, docs/permission-matrix.md mục 7.2).
 * Capability (project-capability-v1.ts), tệp đề tài (files.service.ts) và danh sách hồ sơ đều gọi các hàm ở đây,
 * không tự viết danh sách vai trò riêng.
 *   - Giao / thu hồi chuyên viên phụ trách: Trưởng phòng, Trưởng ban QLKH trong phạm vi đơn vị.
 *   - Nghiệp vụ hằng ngày (thiết lập mốc, xét báo cáo, thẩm định điều chỉnh, gia hạn): chuyên viên đang phụ trách.
 *   - Quyết định gia hạn, điều chỉnh, thành lập hội đồng nghiệm thu: Giám đốc hoặc Phó GĐ phụ trách Khoa học;
 *     phê duyệt thanh lý: chỉ Giám đốc.
 *   - Kinh phí: xem và quản lý theo canReadProjectFinanceDetail / canManageProjectFinance.
 * Trạng thái nội bộ `ready_for_head_decision` nghĩa là "chờ Ban giám đốc quyết định".
 */

export function isProjectStaff(actor?: SafeUserContext) {
  return isResearchManagement(actor);
}

/** Ban giám đốc ký trong lĩnh vực khoa học (Giám đốc, Phó GĐ phụ trách Khoa học): xem mọi đề tài. */
export function isProjectLeadership(actor?: SafeUserContext) {
  return isAcademyLeadership(actor);
}

/** Giao / thu hồi chuyên viên phụ trách đề tài: chỉ Trưởng phòng KHQS hoặc Trưởng ban QLKH (trong phạm vi đơn vị). */
export function canAssignProjectOfficer(actor?: SafeUserContext) {
  return isResearchManagementHead(actor) || isResearchBoardHead(actor);
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
 * Xem chi tiết kinh phí từng đề tài (mặc định chặn: vai trò không nêu ở đây không xem được).
 *   - Ban giám đốc (GĐ, Phó GĐ phụ trách Khoa học), Trưởng phòng, Trưởng ban QLKH: xem.
 *   - Chuyên viên QLKH: chỉ đề tài mình đang phụ trách.
 *   - Các Phó GĐ chỉ theo dõi: không xem (chỉ xem báo cáo tổng hợp).
 *   - Vai trò khác (Phó phòng, nhà nghiên cứu…): chỉ đề tài mình là chủ nhiệm hoặc thành viên.
 * Người gọi vẫn phải kiểm tra quyền xem đề tài (project.read) trước.
 */
export function canReadProjectFinanceDetail(actor?: SafeUserContext, relation: { isAssignedOfficer?: boolean; isParticipant?: boolean } = {}) {
  if (!actor || isResearchOversightAuthority(actor)) return false;
  if (isResearchManagementStaff(actor)) return relation.isAssignedOfficer === true;
  if (isAcademyLeadership(actor) || isResearchManagementHead(actor) || isResearchBoardHead(actor)) return true;
  return relation.isParticipant === true;
}

/**
 * Xem mọi tệp của đề tài, không chỉ tệp mình tải lên: người điều hành và quyết định đề tài (Ban giám đốc, Trưởng phòng,
 * Trưởng ban QLKH, chuyên viên QLKH). Phó phòng và các Phó GĐ chỉ theo dõi xem tiến độ, báo cáo trên trang đề tài,
 * không mở tệp. Chứng từ giải ngân còn cần quyền xem kinh phí (project.finance.read).
 */
export function canReadAllProjectFiles(actor?: SafeUserContext) {
  return isAcademyLeadership(actor) || isResearchManagementHead(actor) || isResearchBoardHead(actor) || isResearchManagementStaff(actor);
}

/** Quản lý kinh phí, giải ngân, quyết toán: Giám đốc, Trưởng phòng, Trưởng ban QLKH (toàn Học viện), hoặc chuyên viên đang phụ trách đề tài. */
export function canManageProjectFinance(actor: SafeUserContext | undefined, isAssignedOfficer: boolean) {
  return isLeadership(actor) || isResearchManagementHead(actor) || isResearchBoardHead(actor) || (isResearchManagementStaff(actor) && isAssignedOfficer);
}

export function isInProjectScope(actor: SafeUserContext | undefined, hostOrganizationUnitId: string) {
  if (!actor) return false;
  return isAcademyLeadership(actor) || getOrganizationScopeIds(actor).includes(hostOrganizationUnitId);
}
