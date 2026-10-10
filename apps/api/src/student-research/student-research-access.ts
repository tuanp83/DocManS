import type { SafeUserContext } from "../auth/auth.types.js";
import { getOrganizationScopeIds, isResearchManagementStaff } from "../proposals-shared/proposal-access.js";

/**
 * Phân quyền NCKH sinh viên (hàm thuần, có test).
 *
 * Vòng đời: DRAFT (giảng viên soạn) → SUBMITTED (chờ duyệt) → ACTIVE (đang thực hiện) → COMPLETED.
 * SUBMITTED có thể bị trả lại về DRAFT; DRAFT/SUBMITTED/ACTIVE có thể bị huỷ (CANCELLED).
 *
 *   - Người quản lý: chỉ chuyên viên QLKH có phạm vi đơn vị của đề tài, hoặc chuyên viên quản lý đề tài
 *     (Trưởng phòng, lãnh đạo, cơ quan giám sát không quản lý và không xem, trừ khi là giảng viên hướng dẫn).
 *   - Giảng viên hướng dẫn: đăng ký, sửa bản nháp, nộp, rút (huỷ) khi chưa được duyệt, tải tài liệu.
 *   - Xung đột lợi ích: người là giảng viên hướng dẫn của đề tài không duyệt, trả lại, huỷ đề tài đang thực hiện
 *     hay ghi nhận hoàn thành chính đề tài đó, kể cả khi có vai trò quản lý.
 *   - Bản nháp chỉ giảng viên hướng dẫn và người tạo thấy; các trạng thái khác: chuyên viên quản lý và
 *     giảng viên hướng dẫn.
 * Thông tin liên lạc của sinh viên chỉ hiện cho người quản lý và giảng viên hướng dẫn.
 */
export type StudentProjectStatus = "DRAFT" | "SUBMITTED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type StudentProjectFacts = {
  officerId: string | null;
  supervisorId: string;
  organizationUnitId: string | null;
  status: StudentProjectStatus | string;
  createdById?: string | null;
};

export type StudentProjectAction = "edit" | "submit" | "approve" | "return" | "cancel" | "complete" | "document.upload";

/** Vai trò được chọn làm giảng viên hướng dẫn: tài khoản nội bộ (không phải tài khoản ngoài, quản trị). */
export const SUPERVISOR_ROLES = ["RESEARCHER_INTERNAL_USER", "RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD", "LEADERSHIP_APPROVAL_AUTHORITY"];

/** Vai trò có mục NCKH Sinh viên và được tự đăng ký hướng dẫn đề tài. */
export const REGISTRANT_ROLES = ["RESEARCHER_INTERNAL_USER", "RESEARCH_MANAGEMENT_STAFF"];

/** Trạng thái còn nhận tài liệu. */
export const DOCUMENT_OPEN_STATUSES = ["DRAFT", "SUBMITTED", "ACTIVE"];

export function canManageStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  if (!isResearchManagementStaff(actor)) return false;
  if (project.officerId && project.officerId === actor.id) return true;
  return !!project.organizationUnitId && getOrganizationScopeIds(actor).includes(project.organizationUnitId);
}

function isSupervisor(actor: SafeUserContext, project: StudentProjectFacts) {
  return project.supervisorId === actor.id;
}

function isCreator(actor: SafeUserContext, project: StudentProjectFacts) {
  return !!project.createdById && project.createdById === actor.id;
}

export function canReadStudentProject(actor: SafeUserContext, project: StudentProjectFacts) {
  if (isSupervisor(actor, project) || isCreator(actor, project)) return true;
  if (project.status === "DRAFT") return false;
  return canManageStudentProject(actor, project);
}

/** Có thấy thông tin liên lạc của sinh viên. */
export function canSeeStudentContact(actor: SafeUserContext, project: StudentProjectFacts) {
  return isSupervisor(actor, project) || (project.status !== "DRAFT" && canManageStudentProject(actor, project));
}

/** Các thao tác người dùng được làm trên đề tài ở trạng thái hiện tại (giao diện và máy chủ dùng chung). */
export function studentProjectActions(actor: SafeUserContext, project: StudentProjectFacts): StudentProjectAction[] {
  if (!canReadStudentProject(actor, project)) return [];
  const supervisor = isSupervisor(actor, project);
  const manager = project.status !== "DRAFT" && canManageStudentProject(actor, project);
  const independentManager = manager && !supervisor;
  const actions: StudentProjectAction[] = [];
  switch (project.status) {
    case "DRAFT":
      if (supervisor) actions.push("edit", "submit", "cancel");
      break;
    case "SUBMITTED":
      if (manager) actions.push("edit");
      if (independentManager) actions.push("approve", "return");
      if (supervisor || independentManager) actions.push("cancel");
      break;
    case "ACTIVE":
      if (manager) actions.push("edit");
      if (independentManager) actions.push("cancel", "complete");
      break;
  }
  if (DOCUMENT_OPEN_STATUSES.includes(project.status) && (supervisor || manager)) actions.push("document.upload");
  return actions;
}

export function canStudentProject(actor: SafeUserContext, project: StudentProjectFacts, action: StudentProjectAction) {
  return studentProjectActions(actor, project).includes(action);
}

/** Xoá tài liệu: người tải lên, người quản lý, hoặc giảng viên với bản nháp của mình; khi đề tài còn nhận tài liệu. */
export function canDeleteStudentDocument(actor: SafeUserContext, project: StudentProjectFacts, document: { uploadedById: string }) {
  if (!canStudentProject(actor, project, "document.upload")) return false;
  if (document.uploadedById === actor.id) return true;
  if (project.status === "DRAFT") return isSupervisor(actor, project);
  return canManageStudentProject(actor, project);
}

/** Chuyên viên tạo trực tiếp đề tài (đã duyệt) cho đơn vị trong phạm vi. */
export function canCreateStudentProject(actor: SafeUserContext, organizationUnitId: string) {
  return isResearchManagementStaff(actor) && getOrganizationScopeIds(actor).includes(organizationUnitId);
}

/** Giảng viên tự đăng ký đề tài (bản nháp), tự là giảng viên hướng dẫn. */
export function canRegisterStudentProject(actor: SafeUserContext) {
  return REGISTRANT_ROLES.includes(actor.systemRole);
}

/** Điều kiện lọc danh sách ở cơ sở dữ liệu, khớp canReadStudentProject (kết quả vẫn được lọc lại bằng hàm đó). */
export function studentProjectReadFilter(actor: SafeUserContext) {
  const own: Array<Record<string, unknown>> = [{ supervisorId: actor.id }, { createdById: actor.id }];
  if (isResearchManagementStaff(actor)) {
    const managed: Array<Record<string, unknown>> = [{ officerId: actor.id }];
    const scopes = getOrganizationScopeIds(actor);
    if (scopes.length) managed.push({ organizationUnitId: { in: scopes } });
    return { OR: [...own, { AND: [{ status: { not: "DRAFT" } }, { OR: managed }] }] };
  }
  return { OR: own };
}
