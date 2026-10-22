import { BadRequestException } from "@nestjs/common";

/**
 * Kiểm tra dữ liệu tờ trình, duyệt/trả lại và biên bản hội đồng đánh giá (councilMetadata). Dùng chung cho pipe
 * của controller và cho service, để dữ liệu ghi vào hồ sơ luôn đã chuẩn hoá dù gọi từ đâu.
 */

export const COUNCIL_MEMBER_ROLES = ["chair", "vice_chair", "secretary", "reviewer_1", "reviewer_2", "reviewer", "member"] as const;
export type CouncilMemberRole = (typeof COUNCIL_MEMBER_ROLES)[number];

/** save: lưu nháp; invite: lưu và gửi lời mời cho thành viên mới; submit: trình lãnh đạo (mọi người đã nhận lời). */
export const COUNCIL_ACTIONS = ["save", "invite", "submit"] as const;
export type CouncilAction = (typeof COUNCIL_ACTIONS)[number];

export const COUNCIL_CONCLUSIONS = ["approved", "revision_required", "rejected"] as const;
export type CouncilConclusion = (typeof COUNCIL_CONCLUSIONS)[number];

export type CouncilMemberInput = {
  role: CouncilMemberRole;
  roleLabel: string;
  userId?: string;
  displayName: string;
  academicTitle?: string;
  unit?: string;
  /** Cấp bậc, chức vụ, loại lý lịch (INTERNAL / EXTERNAL) chép từ lý lịch khoa học lúc lập / duyệt hội đồng, để in quyết định. */
  militaryRank?: string;
  position?: string;
  profileType?: string;
};

const MAX_MEMBERS = 15;

function invalid(message: string): never {
  throw new BadRequestException({ code: "COUNCIL_INPUT_INVALID", message });
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

/** Ngày dạng YYYY-MM-DD hoặc ISO; rỗng = chưa đặt. Trả về chuỗi ISO để mọi nơi đọc lại được. */
export function readCouncilDate(value: unknown, label: string) {
  const raw = text(value, label, 40);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(parsed.getTime())) invalid(`${label} không phải ngày hợp lệ.`);
  return parsed.toISOString();
}

function optionalFacts(member: Record<string, unknown>, index: number) {
  const militaryRank = text(member.militaryRank, `Cấp bậc của thành viên thứ ${index + 1}`, 100);
  const position = text(member.position, `Chức vụ của thành viên thứ ${index + 1}`, 255);
  const profileType = member.profileType === "INTERNAL" || member.profileType === "EXTERNAL" ? member.profileType : "";
  return { ...(militaryRank ? { militaryRank } : {}), ...(position ? { position } : {}), ...(profileType ? { profileType } : {}) };
}

export function readCouncilMembers(value: unknown): CouncilMemberInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid("Danh sách thành viên hội đồng không hợp lệ.");
  if (value.length > MAX_MEMBERS) invalid(`Hội đồng tối đa ${MAX_MEMBERS} người.`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`Thành viên thứ ${index + 1} không hợp lệ.`);
    const member = item as Record<string, unknown>;
    if (typeof member.role !== "string" || !(COUNCIL_MEMBER_ROLES as readonly string[]).includes(member.role)) invalid(`Vai trò của thành viên thứ ${index + 1} không hợp lệ.`);
    const userId = text(member.userId, `Tài khoản của thành viên thứ ${index + 1}`, 64);
    return {
      role: member.role as CouncilMemberRole,
      roleLabel: text(member.roleLabel, `Chức danh trong hội đồng của thành viên thứ ${index + 1}`, 100),
      ...(userId ? { userId } : {}),
      displayName: text(member.displayName, `Họ tên thành viên thứ ${index + 1}`, 200, true),
      academicTitle: text(member.academicTitle, `Học hàm, học vị của thành viên thứ ${index + 1}`, 200),
      unit: text(member.unit ?? member.organization, `Đơn vị của thành viên thứ ${index + 1}`, 255),
      ...optionalFacts(member, index)
    };
  });
}

export function readProposeCouncilInput(input: Record<string, unknown>) {
  let action: CouncilAction = "save";
  if (input.action !== undefined) {
    if (typeof input.action !== "string" || !(COUNCIL_ACTIONS as readonly string[]).includes(input.action)) invalid("Thao tác với tờ trình không hợp lệ.");
    action = input.action as CouncilAction;
  } else if (input.submitToLeadership === true || input.status === "submitted") {
    // Tương thích client cũ: "trình lãnh đạo" = submit.
    action = "submit";
  }
  return {
    action,
    members: readCouncilMembers(input.members),
    meetingDate: readCouncilDate(input.meetingDate, "Ngày họp hội đồng"),
    meetingLocation: text(input.meetingLocation, "Địa điểm họp", 500),
    tentativeAgenda: text(input.tentativeAgenda, "Dự thảo nội dung phiên họp", 3000)
  };
}

export function readApproveCouncilInput(input: Record<string, unknown>) {
  return {
    decisionNumber: text(input.decisionNumber, "Số quyết định", 100),
    approvalNote: text(input.approvalNote, "Ý kiến phê duyệt", 2000)
  };
}

export function readRejectCouncilInput(input: Record<string, unknown>) {
  return { reason: text(input.reason, "Lý do trả lại", 2000) };
}

export function readCouncilMinutesInput(input: Record<string, unknown>) {
  const conclusion = input.conclusion === undefined ? "approved" : input.conclusion;
  if (typeof conclusion !== "string" || !(COUNCIL_CONCLUSIONS as readonly string[]).includes(conclusion)) invalid("Kết luận của hội đồng không hợp lệ.");
  const score = input.averageScore === undefined || input.averageScore === null || input.averageScore === "" ? 0 : Number(input.averageScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) invalid("Điểm trung bình phải từ 0 đến 100.");
  if (input.attendance !== undefined && (!Array.isArray(input.attendance) || input.attendance.length > MAX_MEMBERS * 2)) invalid("Danh sách có mặt không hợp lệ.");
  const attendance = ((input.attendance as unknown[]) ?? []).map((item, index) => text(item, `Người có mặt thứ ${index + 1}`, 200, true));
  let minutesAttachment: { fileName: string; fileUrl?: string; uploadedAt?: string } | null = null;
  if (input.minutesAttachment !== undefined && input.minutesAttachment !== null) {
    if (typeof input.minutesAttachment !== "object" || Array.isArray(input.minutesAttachment)) invalid("Tệp biên bản không hợp lệ.");
    const file = input.minutesAttachment as Record<string, unknown>;
    const fileUrl = text(file.fileUrl, "Đường dẫn tệp biên bản", 1000);
    const uploadedAt = readCouncilDate(file.uploadedAt, "Thời điểm tải biên bản");
    minutesAttachment = { fileName: text(file.fileName, "Tên tệp biên bản", 255, true), ...(fileUrl ? { fileUrl } : {}), ...(uploadedAt ? { uploadedAt } : {}) };
  }
  return {
    meetingConductedAt: readCouncilDate(input.meetingConductedAt, "Ngày họp"),
    attendance,
    conclusion: conclusion as CouncilConclusion,
    averageScore: Math.round(score * 100) / 100,
    summaryComments: text(input.summaryComments, "Ý kiến tổng hợp", 5000),
    modificationsRequired: text(input.modificationsRequired, "Nội dung cần chỉnh sửa", 5000),
    minutesAttachment
  };
}
