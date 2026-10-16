import { BadRequestException } from "@nestjs/common";

/**
 * Nội dung đề nghị điều chỉnh / gia hạn đề tài, lưu ở cột JSON `ProjectRequest.proposedValues`
 * (và `ProjectRequestRevision.proposedValues`). Mọi giá trị đi qua `assertAdjustmentValues` /
 * `assertExtensionValues` trước khi lưu, nên dữ liệu đọc lại từ cột JSON có đúng cấu trúc này.
 */

export const SCOPE_CHANGE_KEYS = ["title", "objectives", "summary", "researchFieldCode", "proposalTypeCode"];
export const PLAN_CHANGE_KEYS = ["methodology", "activities"];
export const MILESTONE_CHANGE_KEYS = ["id", "title", "description", "dueDate", "responsibleMemberId", "weightPercent"];
export const MEMBER_ROLES_ADDABLE = ["TOPIC_MEMBER", "TOPIC_SECRETARY"];
const ADJUSTMENT_KEYS = ["milestoneChanges", "scope", "plan", "membershipChanges"];
/** Khoá chỉ thuộc về gia hạn: điều chỉnh không được đổi thời hạn hay ngày kết thúc. */
const EXTENSION_ONLY_KEYS = ["endDate", "end_date", "requestedEndDate", "requested_end_date", "duration", "durationDays"];

/** Thay đổi phạm vi: tên, mục tiêu, tóm tắt, lĩnh vực, cấp đề tài (giá trị ghép vào scopeSnapshot). */
export type ScopeChanges = { title?: string; objectives?: unknown; summary?: unknown; researchFieldCode?: unknown; proposalTypeCode?: unknown };
/** Thay đổi kế hoạch: phương pháp và danh sách hoạt động (ghép vào planSnapshot). */
export type PlanChanges = { methodology?: string; activities?: string[] };
/** Thay đổi một mốc; mốc quan trọng mới được đổi tên, hạn, người phụ trách, mô tả (trọng số đổi được mọi mốc). */
export type MilestoneChange = { id: string; title?: string; description?: unknown; dueDate?: string; responsibleMemberId?: unknown; weightPercent?: number | null };
export type MembershipChange = { action: "add"; userId: string; name?: unknown; participationRole: string } | { action: "end"; memberId: string };
export type AdjustmentValues = { scope?: ScopeChanges; plan?: PlanChanges; milestoneChanges?: MilestoneChange[]; membershipChanges?: MembershipChange[] };
export type ExtensionValues = { requestedEndDate: string };

const denied = (message?: string) => new BadRequestException(message ? { code: "ADJUSTMENT_SCOPE_DENIED", message } : { code: "ADJUSTMENT_SCOPE_DENIED" });

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const onlyKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));

export function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) throw new BadRequestException({ message: `${field} không hợp lệ.` });
  return value.trim();
}

export function optionalText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 5000) throw new BadRequestException({ message: "Nội dung không hợp lệ." });
  return value.trim() || null;
}

/** Ngày dạng YYYY-MM-DD, lưu 00:00Z. */
export function projectDay(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException({ message: "Ngày không hợp lệ." });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException({ message: "Ngày không hợp lệ." });
  return date;
}

function isValidPlan(plan: Record<string, unknown>) {
  if (!onlyKeys(plan, PLAN_CHANGE_KEYS)) return false;
  if (plan.methodology !== undefined && (typeof plan.methodology !== "string" || plan.methodology.length > 10000)) return false;
  const activities = plan.activities;
  if (activities !== undefined && (!Array.isArray(activities) || activities.length > 100 || activities.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 1000))) return false;
  return true;
}

function isValidMembershipChange(change: unknown) {
  if (!isObject(change)) return false;
  if (change.action === "add") return onlyKeys(change, ["action", "userId", "name", "participationRole"]) && typeof change.userId === "string" && MEMBER_ROLES_ADDABLE.includes(change.participationRole as string);
  if (change.action === "end") return onlyKeys(change, ["action", "memberId"]) && typeof change.memberId === "string";
  return false;
}

/** Kiểm tra nội dung đề nghị điều chỉnh: chỉ mốc, phạm vi/kế hoạch, thành viên; không đổi thời hạn. */
export function assertAdjustmentValues(values: unknown): asserts values is AdjustmentValues {
  if (!isObject(values)) throw denied();
  if (EXTENSION_ONLY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(values, key))) throw new BadRequestException({ code: "EXTENSION_REQUIRED", message: "Tăng thời hạn hoặc ngày kết thúc phải dùng quy trình gia hạn." });
  if (!onlyKeys(values, ADJUSTMENT_KEYS)) throw denied("Điều chỉnh chỉ được thay đổi mốc quan trọng, phạm vi/kế hoạch hoặc thành viên được quản trị.");
  const { scope, plan, milestoneChanges, membershipChanges } = values;
  if (!Object.keys(values).length || [scope, plan].some((value) => value !== undefined && !isObject(value))) throw denied();
  // Phạm vi/kế hoạch rỗng không thay đổi gì: không cho một bản sửa trống thay thế nội dung đề nghị trước đó.
  if ([scope, plan].some((value) => isObject(value) && !Object.keys(value).length)) throw new BadRequestException({ code: "ADJUSTMENT_EMPTY", message: "Đề nghị điều chỉnh chưa có nội dung thay đổi." });
  if (isObject(plan) && !isValidPlan(plan)) throw denied();
  if (isObject(scope) && !onlyKeys(scope, SCOPE_CHANGE_KEYS)) throw denied();
  if (milestoneChanges !== undefined && (!Array.isArray(milestoneChanges) || !milestoneChanges.length)) throw denied();
  if (membershipChanges !== undefined && (!Array.isArray(membershipChanges) || !membershipChanges.length)) throw denied();
  for (const change of (milestoneChanges ?? []) as unknown[]) {
    if (!isObject(change) || typeof change.id !== "string" || !onlyKeys(change, MILESTONE_CHANGE_KEYS)) throw denied();
    if (change.dueDate !== undefined) projectDay(change.dueDate);
    const weight = change.weightPercent;
    if (weight !== undefined && weight !== null && (typeof weight !== "number" || !Number.isInteger(weight) || weight < 0 || weight > 100)) throw denied("Trọng số mốc phải là số nguyên từ 0 đến 100.");
    if (change.title !== undefined) requiredText(change.title, "title");
  }
  for (const change of (membershipChanges ?? []) as unknown[]) {
    if (!isValidMembershipChange(change)) throw denied();
  }
}

/** Kiểm tra đề nghị gia hạn; trả về ngày kết thúc mới (phải sau ngày kết thúc hiện tại). */
export function assertExtensionValues(project: { endDate: Date | null }, values: unknown): Date {
  if (!isObject(values) || Object.keys(values).some((key) => key !== "requestedEndDate") || !project.endDate) throw new BadRequestException({ code: "EXTENSION_DATE_INVALID" });
  const raw = values.requestedEndDate ?? values.requested_end_date ?? values.endDate ?? values.end_date;
  const requested = projectDay(raw);
  if (Number.isNaN(requested.valueOf()) || (project.endDate && requested.getTime() <= new Date(project.endDate).getTime())) throw new BadRequestException({ code: "EXTENSION_DATE_INVALID", message: "Ngày kết thúc gia hạn phải sau ngày kết thúc hiện tại." });
  return requested;
}

/** Đọc lại nội dung điều chỉnh từ cột JSON, kiểm tra lại trước khi dùng. */
export function parseAdjustmentValues(values: unknown): AdjustmentValues {
  assertAdjustmentValues(values);
  return values;
}

/** Phiên bản ngữ cảnh đề tài lưu kèm đề nghị (cột JSON submittedContextVersion). */
export function storedContextVersion(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
