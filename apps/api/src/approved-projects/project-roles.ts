import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isLeadership, isResearchManagement } from "../proposals-shared/proposal-access.js";

/**
 * Ánh xạ vai trò cho module thực hiện đề tài theo mô hình 5 vai trò của nhánh này.
 *
 * Nhánh chính (thanhdotien278) dùng thêm RESEARCH_MANAGEMENT_HEAD và RESEARCH_OVERSIGHT_AUTHORITY.
 * Ở đây không có hai vai trò đó, nên:
 *   - Phân công / thu hồi chuyên viên phụ trách đề tài: lãnh đạo, hoặc chuyên viên QLKH có phạm vi đơn vị.
 *   - Thao tác nghiệp vụ hằng ngày (thiết lập mốc, xét báo cáo, xét điều chỉnh, thẩm định gia hạn):
 *     chỉ chuyên viên QLKH đang được phân công phụ trách chính đề tài đó.
 *   - Quyết định GIA HẠN: lãnh đạo (LEADERSHIP_APPROVAL_AUTHORITY) — thay cho Trưởng phòng ở nhánh chính.
 *   - Phạm vi: lãnh đạo toàn Học viện; các vai trò khác cần phạm vi đơn vị chủ trì của đề tài
 *     (cùng nguyên tắc với quyền cấp giấy chứng nhận IRB / giải ngân của nhánh này).
 * Trạng thái nội bộ `ready_for_head_decision` được giữ nguyên tên để dễ đồng bộ dữ liệu với nhánh chính;
 * ý nghĩa ở nhánh này là "chờ lãnh đạo quyết định".
 */

export function isProjectStaff(actor?: SafeUserContext) {
  return isResearchManagement(actor);
}

export function isProjectLeadership(actor?: SafeUserContext) {
  return isLeadership(actor);
}

/** Người được phân công / thu hồi chuyên viên phụ trách đề tài. */
export function canAssignProjectOfficer(actor?: SafeUserContext) {
  return isLeadership(actor) || isResearchManagement(actor);
}

/** Người quyết định phê duyệt / từ chối gia hạn. */
export function canDecideProjectExtension(actor?: SafeUserContext) {
  return isLeadership(actor);
}

/** Vai trò được xem danh sách theo dõi tiến độ các đề tài (ngoài chủ nhiệm và thành viên). */
export function canMonitorProjects(actor?: SafeUserContext) {
  return isLeadership(actor) || isResearchManagement(actor);
}

export function isInProjectScope(actor: SafeUserContext | undefined, hostOrganizationUnitId: string) {
  if (!actor) return false;
  return isLeadership(actor) || getOrganizationScopeIds(actor).includes(hostOrganizationUnitId);
}
