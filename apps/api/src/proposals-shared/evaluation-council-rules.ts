/**
 * Thành phần hội đồng đánh giá đề xuất (một nguồn quy tắc cho phân công, điều kiện trình duyệt và hội đồng
 * được lãnh đạo duyệt):
 *   - Người phản biện: 2–3 người.
 *   - Thành viên hội đồng: 3–5 người (gồm chủ tịch, phó chủ tịch và uỷ viên).
 *   - Thư ký hội đồng: đúng 1 người; thư ký ghi biên bản, KHÔNG chấm phiếu.
 * Mỗi người chỉ giữ một vai trò trong một hồ sơ.
 */

export type EvaluationCouncilRole = "reviewer" | "committee_member" | "committee_secretary";

export const EVALUATION_COUNCIL_LIMITS: Record<EvaluationCouncilRole, { min: number; max: number; label: string }> = {
  reviewer: { min: 2, max: 3, label: "người phản biện" },
  committee_member: { min: 3, max: 5, label: "thành viên hội đồng" },
  committee_secretary: { min: 1, max: 1, label: "thư ký hội đồng" }
};

/** Vai trò chấm phiếu (thư ký không chấm). */
export const SCORING_ROLES: EvaluationCouncilRole[] = ["reviewer", "committee_member"];

type AssignmentLike = { id: string; reviewerUserId: string; assignmentRole?: string | null; status: string };

export function councilRoleOf(value: string | null | undefined): EvaluationCouncilRole {
  return value === "committee_member" || value === "committee_secretary" ? value : "reviewer";
}

export function isScoringRole(value: string | null | undefined) {
  return SCORING_ROLES.includes(councilRoleOf(value));
}

/** Số người KHÁC NHAU theo từng vai trò trong các phân công còn hiệu lực. */
export function countCouncilRoles(active: AssignmentLike[]) {
  const people: Record<EvaluationCouncilRole, Set<string>> = { reviewer: new Set(), committee_member: new Set(), committee_secretary: new Set() };
  for (const assignment of active) people[councilRoleOf(assignment.assignmentRole)].add(assignment.reviewerUserId);
  return { reviewer: people.reviewer.size, committee_member: people.committee_member.size, committee_secretary: people.committee_secretary.size };
}

/** Thông báo lỗi nếu thêm một người vào vai trò này sẽ vượt giới hạn; null nếu được phép. */
export function assignmentLimitError(role: EvaluationCouncilRole, currentCount: number) {
  const limit = EVALUATION_COUNCIL_LIMITS[role];
  if (currentCount >= limit.max) return limit.max === 1 ? `Hội đồng đánh giá chỉ có 1 ${limit.label}.` : `Hội đồng đánh giá chỉ được có tối đa ${limit.max} ${limit.label}.`;
  return null;
}

/** Thiếu sót của thành phần hội đồng so với quy định (rỗng = đủ). checkMinimum = false: chỉ chặn khi vượt mức tối đa. */
export function councilCompositionProblems(active: AssignmentLike[], checkMinimum = true) {
  const counts = countCouncilRoles(active);
  const problems: string[] = [];
  for (const role of Object.keys(EVALUATION_COUNCIL_LIMITS) as EvaluationCouncilRole[]) {
    const { min, max, label } = EVALUATION_COUNCIL_LIMITS[role];
    const tooFew = checkMinimum && counts[role] < min;
    if (tooFew || counts[role] > max) problems.push(min === max ? `Cần đúng ${min} ${label} (hiện có ${counts[role]}).` : `Cần ${min}–${max} ${label} (hiện có ${counts[role]}).`);
  }
  const users = active.map((assignment) => assignment.reviewerUserId);
  if (new Set(users).size !== users.length) problems.push("Một người không được giữ nhiều vai trò trong cùng hội đồng.");
  return problems;
}

/**
 * Đủ điều kiện trình duyệt: thành phần hội đồng đúng quy định và mọi người chấm phiếu (phản biện, thành viên)
 * đã gửi phiếu. Thư ký không có phiếu nên không được tính là "chờ phiếu".
 */
export function councilReady(active: AssignmentLike[], submittedAssignmentIds: Set<string>) {
  if (!active.length) return false;
  if (active.some((assignment) => isScoringRole(assignment.assignmentRole) && !submittedAssignmentIds.has(assignment.id))) return false;
  return councilCompositionProblems(active).length === 0;
}

/** Vai trò trong quyết định thành lập hội đồng (councilMetadata) → vai trò phân công đánh giá. */
export function councilMetadataRoleToAssignmentRole(role: unknown): EvaluationCouncilRole {
  if (role === "reviewer_1" || role === "reviewer_2" || role === "reviewer") return "reviewer";
  if (role === "secretary") return "committee_secretary";
  return "committee_member";
}

/**
 * Kiểm tra danh sách hội đồng trong đề xuất thành lập hội đồng. Bản nháp chỉ bị chặn khi vượt mức tối đa hoặc
 * trùng người; khi trình lãnh đạo (strict) phải đủ cả mức tối thiểu.
 */
export function councilMetadataProblems(members: Array<Record<string, unknown>>, strict: boolean) {
  const pseudo = members.map((member, index) => ({
    id: String(index),
    // Thành viên chưa gắn tài khoản được coi là một người riêng (không thể kiểm tra trùng).
    reviewerUserId: typeof member.userId === "string" && member.userId ? member.userId : `__unlinked_${index}`,
    assignmentRole: councilMetadataRoleToAssignmentRole(member.role),
    status: "assigned"
  }));
  const problems = councilCompositionProblems(pseudo, strict);
  // Mỗi người trong hội đồng cần tài khoản để nhận phân công (chấm phiếu hoặc ghi biên bản); chuyên gia ngoài
  // được tạo tài khoản "nhà nghiên cứu bên ngoài" trước. Bản nháp vẫn cho phép nhập tên tạm.
  const unlinked = members.filter((member) => !(typeof member.userId === "string" && member.userId)).length;
  if (strict && unlinked) problems.push(`${unlinked} thành viên chưa gắn tài khoản; cần chọn người có tài khoản trong hệ thống.`);
  return problems;
}
