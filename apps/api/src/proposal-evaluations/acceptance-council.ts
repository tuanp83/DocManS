import { BadRequestException, ConflictException } from "@nestjs/common";

/**
 * Luồng Hội đồng nghiệm thu (lưu trong research_proposals.acceptance_council_metadata):
 *
 *   NONE ──propose──▶ PROPOSED ──approve (lãnh đạo)──▶ ESTABLISHED ──biên bản──▶ EVALUATED
 *          ▲  propose lại khi còn PROPOSED (sửa danh sách trước khi thành lập)
 *
 * Mỗi bước kiểm tra trạng thái hiện tại; không bước nào được nhảy cóc hay ghi đè kết quả đã có.
 * Điểm hội đồng là dữ liệu bắt buộc, không có giá trị mặc định.
 */

export const ACCEPTANCE_STATUSES = ["NONE", "PROPOSED", "ESTABLISHED", "EVALUATED"] as const;
export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

export const ACCEPTANCE_COUNCIL_TYPES = ["FACILITY", "OFFICIAL"] as const;
export const ACCEPTANCE_MEMBER_ROLES = ["CHAIRMAN", "SECRETARY", "REVIEWER_1", "REVIEWER_2", "MEMBER"] as const;
export const ACCEPTANCE_RESOLUTIONS = ["approved", "revise", "rejected"] as const;

/** Thang điểm nghiệm thu: tổng tối đa 100. */
export const ACCEPTANCE_SCORE_MAX = {
  reportScore: 30,
  scientificProductsScore: 30,
  trainingProductsScore: 15,
  militaryMedicalPracticalScore: 25
} as const;

const SCORE_LABELS: Record<keyof typeof ACCEPTANCE_SCORE_MAX, string> = {
  reportScore: "Điểm báo cáo tổng kết",
  scientificProductsScore: "Điểm sản phẩm khoa học",
  trainingProductsScore: "Điểm sản phẩm đào tạo",
  militaryMedicalPracticalScore: "Điểm giá trị thực tiễn"
};

/** Đề tài phải đã được phê duyệt (đang thực hiện) mới được lập hội đồng nghiệm thu. */
export const ACCEPTANCE_ELIGIBLE_PROPOSAL_STATUSES = ["approved"];

export type AcceptanceMemberInput = {
  profileId: string;
  role: (typeof ACCEPTANCE_MEMBER_ROLES)[number];
};

function invalid(message: string): never {
  throw new BadRequestException({ code: "ACCEPTANCE_INVALID", message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Đọc trạng thái hiện tại, chấp nhận cả giá trị cũ ("proposed", "approved", "completed"). */
export function readAcceptanceStatus(metadata: unknown): AcceptanceStatus {
  const raw = isRecord(metadata) && typeof metadata.status === "string" ? metadata.status : "";
  const legacy: Record<string, AcceptanceStatus> = { proposed: "PROPOSED", approved: "ESTABLISHED", completed: "EVALUATED" };
  if ((ACCEPTANCE_STATUSES as readonly string[]).includes(raw)) return raw as AcceptanceStatus;
  return legacy[raw] ?? "NONE";
}

export function assertAcceptanceStatus(current: AcceptanceStatus, allowed: AcceptanceStatus[], action: string) {
  if (!allowed.includes(current)) {
    throw new ConflictException({
      code: "WORKFLOW_STATE_DENIED",
      message: `Không thể ${action} khi hội đồng nghiệm thu đang ở trạng thái ${current}.`
    });
  }
}

export function readCouncilType(value: unknown) {
  if (value === undefined || value === null || value === "") return "OFFICIAL";
  if (typeof value !== "string" || !(ACCEPTANCE_COUNCIL_TYPES as readonly string[]).includes(value)) invalid("Loại hội đồng không hợp lệ.");
  return value as (typeof ACCEPTANCE_COUNCIL_TYPES)[number];
}

/** Danh sách thành viên: 3–15 người, không trùng, đúng 1 chủ tịch, đúng 1 thư ký, ít nhất 1 phản biện. */
export function readAcceptanceMembers(value: unknown): AcceptanceMemberInput[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 15) {
    invalid("Hội đồng nghiệm thu cần từ 3 đến 15 thành viên (Chủ tịch, Thư ký, Phản biện).");
  }
  const members = value.map((item, index) => {
    if (!isRecord(item) || typeof item.profileId !== "string" || !item.profileId.trim() || item.profileId.length > 100) {
      invalid(`Thành viên #${index + 1} không hợp lệ.`);
    }
    if (typeof item.role !== "string" || !(ACCEPTANCE_MEMBER_ROLES as readonly string[]).includes(item.role)) {
      invalid(`Vai trò của thành viên #${index + 1} không hợp lệ.`);
    }
    return { profileId: item.profileId.trim(), role: item.role as AcceptanceMemberInput["role"] };
  });
  if (new Set(members.map((member) => member.profileId)).size !== members.length) invalid("Một người không thể giữ hai vị trí trong hội đồng.");
  const count = (role: string) => members.filter((member) => member.role === role).length;
  if (count("CHAIRMAN") !== 1) invalid("Hội đồng phải có đúng một Chủ tịch.");
  if (count("SECRETARY") !== 1) invalid("Hội đồng phải có đúng một Thư ký.");
  if (count("REVIEWER_1") + count("REVIEWER_2") < 1) invalid("Hội đồng phải có ít nhất một Ủy viên phản biện.");
  if (count("REVIEWER_1") > 1 || count("REVIEWER_2") > 1) invalid("Mỗi vị trí phản biện chỉ có một người.");
  return members;
}

/** Điểm bắt buộc, là số trong thang điểm; xếp loại do máy chủ tính. */
export function readAcceptanceScores(input: Record<string, unknown>) {
  const scores = {} as Record<keyof typeof ACCEPTANCE_SCORE_MAX, number>;
  for (const [key, max] of Object.entries(ACCEPTANCE_SCORE_MAX) as Array<[keyof typeof ACCEPTANCE_SCORE_MAX, number]>) {
    const raw = input[key];
    const score = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > max) {
      invalid(`${SCORE_LABELS[key]} là bắt buộc và phải trong khoảng 0–${max}.`);
    }
    scores[key] = Math.round(score * 10) / 10;
  }
  const totalScore = Math.round(Object.values(scores).reduce((sum, score) => sum + score, 0) * 10) / 10;
  const classification = totalScore >= 90 ? "EXCELLENT" : totalScore >= 70 ? "PASSED" : "FAILED";
  return { ...scores, totalScore, classification };
}

export function readResolution(value: unknown, classification: string) {
  const fallback = classification === "FAILED" ? "rejected" : "approved";
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !(ACCEPTANCE_RESOLUTIONS as readonly string[]).includes(value)) invalid("Kết luận của hội đồng không hợp lệ.");
  if (classification === "FAILED" && value === "approved") invalid("Tổng điểm dưới 70 thì không thể kết luận nghiệm thu đạt.");
  return value;
}

export function readOptionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > maxLength) invalid(`${field} không hợp lệ (tối đa ${maxLength} ký tự).`);
  return value.trim();
}

export function readOptionalDateText(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf())) invalid(`${field} không phải ngày hợp lệ.`);
  return value.slice(0, 32);
}
