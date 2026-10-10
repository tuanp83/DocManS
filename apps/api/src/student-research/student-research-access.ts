import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isResearchManagementStaff } from "../proposals-shared/proposal-access.js";

/**
 * Phân quyền NCKH sinh viên (hàm thuần, có test):
 *   - Quản lý (tạo, gắn tài liệu, hoàn thành): chỉ dành cho chuyên viên quản lý có phạm vi đơn vị của đề tài,
 *     hoặc chuyên viên đã tạo đề tài.
 *   - Xem: chuyên viên quản lý và giảng viên hướng dẫn của chính đề tài.
 *   - Giảng viên hướng dẫn được gắn tài liệu cho đề tài mình hướng dẫn.
 * Thông tin liên lạc của sinh viên chỉ hiện cho chuyên viên quản lý.
 */
export type StudentProjectFacts = { officerId: string; supervisorId: string; organizationUnitId: string | null };

export function canManageStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  if (!isResearchManagementStaff(actor)) return false;
  if (project.officerId === actor.id) return true;
  return !!project.organizationUnitId && getOrganizationScopeIds(actor).includes(project.organizationUnitId);
}

export function canReadStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  return canManageStudentProject(actor, project) || project.supervisorId === actor.id;
}

export function canAttachStudentDocument(actor: SafeUserContext, project: StudentProjectFacts) {
  return canManageStudentProject(actor, project) || project.supervisorId === actor.id;
}

export function canCreateStudentProject(actor: SafeUserContext, organizationUnitId: string) {
  return isResearchManagementStaff(actor) && getOrganizationScopeIds(actor).includes(organizationUnitId);
}

/** Điều kiện lọc danh sách ở cơ sở dữ liệu, khớp canReadStudentProject. */
export function studentProjectReadFilter(actor: SafeUserContext) {
  const or: Array<Record<string, unknown>> = [{ supervisorId: actor.id }];
  if (isResearchManagementStaff(actor)) {
    or.push({ officerId: actor.id });
    const scopes = getOrganizationScopeIds(actor);
    if (scopes.length) or.push({ organizationUnitId: { in: scopes } });
  }
  return { OR: or };
}
