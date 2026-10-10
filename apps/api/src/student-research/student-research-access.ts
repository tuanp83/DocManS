import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isLeadership, isResearchManagement, isResearchOversightAuthority } from "../proposals-shared/proposal-access.js";

/**
 * Phân quyền NCKH sinh viên (hàm thuần, có test):
 *   - Quản lý (tạo, gắn tài liệu, hoàn thành): chuyên viên/Trưởng phòng QLKH có phạm vi đơn vị của đề tài,
 *     hoặc chuyên viên đã tạo đề tài (dữ liệu cũ chưa có đơn vị).
 *   - Xem: người quản lý, lãnh đạo, cơ quan giám sát, và giảng viên hướng dẫn của chính đề tài.
 *   - Giảng viên hướng dẫn được gắn tài liệu cho đề tài mình hướng dẫn.
 * Thông tin liên lạc của sinh viên chỉ hiện cho người quản lý.
 */
export type StudentProjectFacts = { officerId: string; supervisorId: string; organizationUnitId: string | null };

export function canManageStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  if (!isResearchManagement(actor)) return false;
  if (project.officerId === actor.id) return true;
  return !!project.organizationUnitId && getOrganizationScopeIds(actor).includes(project.organizationUnitId);
}

export function canReadStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  return canManageStudentProject(actor, project) || isLeadership(actor) || isResearchOversightAuthority(actor) || project.supervisorId === actor.id;
}

export function canAttachStudentDocument(actor: SafeUserContext, project: StudentProjectFacts) {
  return canManageStudentProject(actor, project) || project.supervisorId === actor.id;
}

export function canCreateStudentProject(actor: SafeUserContext, organizationUnitId: string) {
  return isResearchManagement(actor) && getOrganizationScopeIds(actor).includes(organizationUnitId);
}

/** Điều kiện lọc danh sách ở cơ sở dữ liệu, khớp canReadStudentProject. */
export function studentProjectReadFilter(actor: SafeUserContext) {
  if (isLeadership(actor) || isResearchOversightAuthority(actor)) return {};
  const or: Array<Record<string, unknown>> = [{ supervisorId: actor.id }];
  if (isResearchManagement(actor)) {
    or.push({ officerId: actor.id });
    const scopes = getOrganizationScopeIds(actor);
    if (scopes.length) or.push({ organizationUnitId: { in: scopes } });
  }
  return { OR: or };
}
