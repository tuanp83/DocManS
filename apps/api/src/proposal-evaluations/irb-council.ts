import { BadRequestException } from "@nestjs/common";

/**
 * Hội đồng Đạo đức trong nghiên cứu Y sinh học (IRB) của một hồ sơ: kiểm tra dữ liệu, thành phần và nhãn hiển thị.
 * Một nguồn quy tắc cho service, controller và kiểm thử.
 *
 * Luồng: chuyên viên phụ trách lập danh sách, gửi lời mời → thành viên Đồng ý / Từ chối (chưa đồng ý chỉ thấy tên đề
 * tài) → trình qua Trưởng ban, Trưởng phòng → Giám đốc hoặc Phó GĐ KH ký thành lập (thành viên được đọc hồ sơ)
 * → thành viên nhận xét → thư ký lập kết luận → chuyên viên trình qua Phòng → Ban giám đốc ký cấp Giấy chứng nhận.
 */

export const IRB_MEMBER_ROLES = ["chair", "secretary", "reviewer", "member"] as const;
export type IrbMemberRole = (typeof IRB_MEMBER_ROLES)[number];

export const IRB_ROLE_LABELS: Record<IrbMemberRole, string> = {
  chair: "Chủ tịch",
  secretary: "Thư ký",
  reviewer: "Phản biện",
  member: "Ủy viên"
};

/** Thành phần: 1 Chủ tịch, 1 Thư ký, 2–3 Phản biện, 3–5 Ủy viên. */
export const IRB_COMPOSITION: Record<IrbMemberRole, { min: number; max: number }> = {
  chair: { min: 1, max: 1 },
  secretary: { min: 1, max: 1 },
  reviewer: { min: 2, max: 3 },
  member: { min: 3, max: 5 }
};

/** invited: chờ trả lời; accepted / declined: đã trả lời; active: hội đồng đã ký thành lập; revoked: bị bỏ. */
export const IRB_MEMBER_STATUS = { invited: "invited", accepted: "accepted", declined: "declined", active: "active", revoked: "revoked" } as const;

export const IRB_MEMBER_STATUS_LABELS: Record<string, string> = {
  invited: "Chờ trả lời",
  accepted: "Đã nhận lời",
  declined: "Đã từ chối",
  active: "Thành viên hội đồng",
  revoked: "Đã thu hồi"
};

/** save: lưu nháp; invite: lưu và gửi lời mời cho người mới; submit: trình (mọi người đã nhận lời). */
export const IRB_COUNCIL_ACTIONS = ["save", "invite", "submit"] as const;
export type IrbCouncilAction = (typeof IRB_COUNCIL_ACTIONS)[number];

export const IRB_RECOMMENDATIONS = ["approve", "revise", "reject"] as const;
export type IrbRecommendation = (typeof IRB_RECOMMENDATIONS)[number];
export const IRB_RECOMMENDATION_LABELS: Record<IrbRecommendation, string> = {
  approve: "Đồng ý thông qua",
  revise: "Thông qua với điều kiện chỉnh sửa",
  reject: "Không thông qua"
};

export const IRB_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type IrbDecision = (typeof IRB_DECISIONS)[number];
export const IRB_RISK_LEVELS = ["MINIMAL", "LOW", "HIGH"] as const;

/** Thư ký: save (nháp), finalize (chốt để chuyên viên trình). */
export const IRB_CONCLUSION_ACTIONS = ["save", "finalize"] as const;

export type IrbMemberInput = { role: IrbMemberRole; userId: string; displayName: string; academicTitle: string; unit: string };

const MAX_MEMBERS = Object.values(IRB_COMPOSITION).reduce((sum, limit) => sum + limit.max, 0);

function invalid(message: string): never {
  throw new BadRequestException({ code: "IRB_INPUT_INVALID", message });
}

function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) invalid(`${label} không được để trống.`);
    return "";
  }
  if (typeof value !== "string") invalid(`${label} không hợp lệ.`);
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${label} không được để trống.`);
  if (trimmed.length > max) invalid(`${label} tối đa ${max} ký tự.`);
  return trimmed;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string, fallback?: T): T {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) invalid(`${label} không hợp lệ.`);
  return value as T;
}

/** Ngày dạng YYYY-MM-DD hoặc ISO; rỗng = chưa đặt. */
export function readIrbDate(value: unknown, label: string) {
  const raw = text(value, label, 40);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(parsed.getTime())) invalid(`${label} không phải ngày hợp lệ.`);
  return parsed.toISOString();
}

export function readIrbMembers(value: unknown): IrbMemberInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid("Danh sách thành viên hội đồng IRB không hợp lệ.");
  if (value.length > MAX_MEMBERS) invalid(`Hội đồng IRB tối đa ${MAX_MEMBERS} người.`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`Thành viên thứ ${index + 1} không hợp lệ.`);
    const member = item as Record<string, unknown>;
    return {
      role: oneOf(member.role, IRB_MEMBER_ROLES, `Vai trò của thành viên thứ ${index + 1}`),
      // Lời mời gửi tới tài khoản: mọi thành viên phải gắn tài khoản trên hệ thống.
      userId: text(member.userId, `Tài khoản của thành viên thứ ${index + 1}`, 64, true),
      displayName: text(member.displayName, `Họ tên thành viên thứ ${index + 1}`, 200, true),
      academicTitle: text(member.academicTitle, `Học hàm, học vị của thành viên thứ ${index + 1}`, 200),
      unit: text(member.unit, `Đơn vị của thành viên thứ ${index + 1}`, 255)
    };
  });
}

export function readProposeIrbCouncilInput(input: Record<string, unknown>) {
  return {
    action: oneOf(input.action, IRB_COUNCIL_ACTIONS, "Thao tác với tờ trình", "save"),
    members: readIrbMembers(input.members),
    meetingDate: readIrbDate(input.meetingDate, "Ngày họp hội đồng"),
    meetingLocation: text(input.meetingLocation, "Địa điểm họp", 500)
  };
}

/**
 * Lý do thành phần chưa đúng. Nháp và gửi lời mời chỉ bị chặn khi trùng người hoặc vượt mức; khi trình (strict) phải đủ.
 */
export function irbCompositionProblems(members: IrbMemberInput[], strict: boolean) {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member.userId)) problems.push(`${member.displayName} có tên hai lần trong hội đồng.`);
    seen.add(member.userId);
  }
  for (const role of IRB_MEMBER_ROLES) {
    const count = members.filter((member) => member.role === role).length;
    const { min, max } = IRB_COMPOSITION[role];
    if (count > max) problems.push(`${IRB_ROLE_LABELS[role]} tối đa ${max} người (đang có ${count}).`);
    else if (strict && count < min) problems.push(min === max ? `Cần ${min} ${IRB_ROLE_LABELS[role]} (đang có ${count}).` : `${IRB_ROLE_LABELS[role]} cần ${min}–${max} người (đang có ${count}).`);
  }
  return problems;
}

export function readIrbReviewInput(input: Record<string, unknown>) {
  return {
    recommendation: oneOf(typeof input.recommendation === "string" ? input.recommendation.toLowerCase() : input.recommendation, IRB_RECOMMENDATIONS, "Ý kiến đề nghị"),
    comment: text(input.comment, "Nhận xét", 5000, true)
  };
}

export function readIrbConclusionInput(input: Record<string, unknown>) {
  return {
    action: oneOf(input.action, IRB_CONCLUSION_ACTIONS, "Thao tác với kết luận", "save"),
    decision: oneOf(input.decision, IRB_DECISIONS, "Kết luận của hội đồng", "APPROVED"),
    riskLevel: oneOf(input.riskLevel, IRB_RISK_LEVELS, "Mức độ rủi ro", "LOW"),
    targetSubjects: text(input.targetSubjects, "Đối tượng nghiên cứu", 2000),
    ethicsNotes: text(input.ethicsNotes, "Ý kiến kết luận về đạo đức", 5000, true),
    conditions: text(input.conditions, "Điều kiện / yêu cầu chỉnh sửa", 5000),
    meetingConductedAt: readIrbDate(input.meetingConductedAt, "Ngày họp")
  };
}

export function readIrbReasonInput(input: Record<string, unknown>, label: string) {
  return text(input.reason, label, 2000, true);
}

export function readIrbSignInput(input: Record<string, unknown>) {
  return {
    decisionNumber: text(input.decisionNumber, "Số quyết định", 100),
    approvalNote: text(input.approvalNote, "Ý kiến phê duyệt", 2000)
  };
}
