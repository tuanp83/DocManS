import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { CONFERENCE_LEVELS, type ConferenceLevel, type InvitationKind, type PaperVersionKind } from "./conference-workflow.js";

export type ConferenceInfoDto = {
  title: string;
  description?: string | null;
  level: ConferenceLevel;
  hostOrganizationUnitId: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  responseDeadline?: Date | null;
  abstractDeadline: Date;
  fullPaperDeadline: Date;
};

export type UpdateConferenceDto = Partial<ConferenceInfoDto> & { version: string };
export type VersionedReasonDto = { version: string; reason?: string };
export type AssignOfficerDto = { version: string; userId: string; reason?: string };

export type InvitationInputDto = {
  kind: InvitationKind;
  userId?: string;
  fullName?: string;
  academicTitle?: string | null;
  email?: string | null;
  isInternal?: boolean;
  organizationUnitId?: string | null;
  externalOrganization?: string | null;
};
export type UpdateInvitationDto = Omit<InvitationInputDto, "userId" | "kind"> & { kind?: InvitationKind };

export type MailingKind = "invitation" | "reminder" | "change_notice";
export type SendMailingDto = { kind: MailingKind; invitationIds: string[]; subject?: string; message?: string };

export type InvitationResponseDto = { decision: "accept" | "decline"; reason?: string };
export type PublicInvitationResponseDto = InvitationResponseDto & { token: string };

export type PaperAuthor = { fullName: string; organization?: string; corresponding?: boolean };
export type SubmitPaperDto = { version: string; kind: PaperVersionKind; title?: string; abstractText?: string; authors?: PaperAuthor[] };
export type RevisionRequestDto = { version: string; kind: PaperVersionKind; reason: string; dueAt: Date };

const MAX_INVITATIONS_PER_REQUEST = 500;

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ message: "Dữ liệu không hợp lệ." });
  return value as Record<string, unknown>;
}

export function readRequired(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException({ message: `${field} là bắt buộc và tối đa ${max} ký tự.` });
  return value.trim();
}

function readOptional(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return readRequired(value, field, max);
}

/** Thời điểm ISO (giao diện gửi sẵn đầu/cuối ngày theo giờ Việt Nam, như đợt tiếp nhận). */
function readInstant(value: unknown, field: string) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new BadRequestException({ message: `${field} không hợp lệ.` });
  return new Date(value);
}

function readOptionalInstant(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return readInstant(value, field);
}

/** Phiên bản hội nghị/báo cáo người dùng đang xem (updatedAt, ISO): chặn ghi đè thay đổi của người khác. */
export function readVersion(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new BadRequestException({ code: "CONTEXT_VERSION_REQUIRED", message: "Thiếu phiên bản dữ liệu. Vui lòng tải lại trang." });
  return new Date(value).toISOString();
}

function readLevel(value: unknown): ConferenceLevel {
  if (typeof value !== "string" || !(CONFERENCE_LEVELS as readonly string[]).includes(value)) throw new BadRequestException({ message: "Cấp hội nghị không hợp lệ." });
  return value as ConferenceLevel;
}

function readKind(value: unknown): InvitationKind {
  if (value !== "speaker" && value !== "delegate") throw new BadRequestException({ message: "Loại khách mời phải là báo cáo viên hoặc đại biểu." });
  return value;
}

export function readPaperKind(value: unknown): PaperVersionKind {
  if (value !== "abstract" && value !== "full_paper") throw new BadRequestException({ message: "Loại bài phải là tóm tắt hoặc toàn văn." });
  return value;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readEmail(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > 254 || !EMAIL_PATTERN.test(value.trim())) throw new BadRequestException({ message: "Email không hợp lệ." });
  return value.trim().toLowerCase();
}

/** Thứ tự các mốc: hạn tóm tắt ≤ hạn toàn văn ≤ ngày kết thúc; bắt đầu ≤ kết thúc. */
export function assertConferenceDates(input: Pick<ConferenceInfoDto, "startsAt" | "endsAt" | "abstractDeadline" | "fullPaperDeadline"> & { responseDeadline?: Date | null }) {
  if (input.endsAt < input.startsAt) throw new BadRequestException({ message: "Ngày kết thúc phải sau ngày bắt đầu." });
  if (input.fullPaperDeadline < input.abstractDeadline) throw new BadRequestException({ message: "Hạn nộp toàn văn phải sau hạn nộp tóm tắt." });
  if (input.fullPaperDeadline > input.endsAt) throw new BadRequestException({ message: "Hạn nộp toàn văn phải trước khi hội nghị kết thúc." });
  if (input.responseDeadline && input.responseDeadline > input.endsAt) throw new BadRequestException({ message: "Hạn trả lời thư mời phải trước khi hội nghị kết thúc." });
}

function readInfo(input: Record<string, unknown>): ConferenceInfoDto {
  return {
    title: readRequired(input.title, "Tên hội nghị", 500),
    description: readOptional(input.description, "Mô tả", 5000) ?? null,
    level: readLevel(input.level ?? "academy"),
    hostOrganizationUnitId: readRequired(input.hostOrganizationUnitId, "Đơn vị chủ trì", 80),
    location: readRequired(input.location, "Địa điểm", 500),
    startsAt: readInstant(input.startsAt, "Ngày bắt đầu"),
    endsAt: readInstant(input.endsAt, "Ngày kết thúc"),
    responseDeadline: readOptionalInstant(input.responseDeadline, "Hạn trả lời thư mời") ?? null,
    abstractDeadline: readInstant(input.abstractDeadline, "Hạn nộp tóm tắt"),
    fullPaperDeadline: readInstant(input.fullPaperDeadline, "Hạn nộp toàn văn")
  };
}

export const createConferencePipe: PipeTransform<unknown, ConferenceInfoDto> = { transform(value) {
  const result = readInfo(record(value));
  assertConferenceDates(result);
  return result;
} };

export const updateConferencePipe: PipeTransform<unknown, UpdateConferenceDto> = { transform(value) {
  const input = record(value);
  const result: UpdateConferenceDto = { version: readVersion(input.version) };
  if ("title" in input) result.title = readRequired(input.title, "Tên hội nghị", 500);
  if ("description" in input) result.description = readOptional(input.description, "Mô tả", 5000) ?? null;
  if ("level" in input) result.level = readLevel(input.level);
  if ("hostOrganizationUnitId" in input) result.hostOrganizationUnitId = readRequired(input.hostOrganizationUnitId, "Đơn vị chủ trì", 80);
  if ("location" in input) result.location = readRequired(input.location, "Địa điểm", 500);
  if ("startsAt" in input) result.startsAt = readInstant(input.startsAt, "Ngày bắt đầu");
  if ("endsAt" in input) result.endsAt = readInstant(input.endsAt, "Ngày kết thúc");
  if ("responseDeadline" in input) result.responseDeadline = readOptionalInstant(input.responseDeadline, "Hạn trả lời thư mời") ?? null;
  if ("abstractDeadline" in input) result.abstractDeadline = readInstant(input.abstractDeadline, "Hạn nộp tóm tắt");
  if ("fullPaperDeadline" in input) result.fullPaperDeadline = readInstant(input.fullPaperDeadline, "Hạn nộp toàn văn");
  if (Object.keys(result).length === 1) throw new BadRequestException({ message: "Không có thông tin nào cần sửa." });
  return result;
} };

export const versionedReasonPipe: PipeTransform<unknown, VersionedReasonDto> = { transform(value) {
  const input = record(value ?? {});
  return { version: readVersion(input.version), reason: readOptional(input.reason, "Lý do", 1000) };
} };

export const assignOfficerPipe: PipeTransform<unknown, AssignOfficerDto> = { transform(value) {
  const input = record(value);
  return { version: readVersion(input.version), userId: readRequired(input.userId, "Chuyên viên phụ trách", 80), reason: readOptional(input.reason, "Lý do", 1000) };
} };

export function readInvitationInput(value: unknown): InvitationInputDto {
  const input = record(value);
  const kind = readKind(input.kind);
  const userId = readOptional(input.userId, "Tài khoản", 80);
  if (userId) return { kind, userId };
  const isInternal = input.isInternal === true;
  const result: InvitationInputDto = {
    kind,
    fullName: readRequired(input.fullName, "Họ tên", 200),
    academicTitle: readOptional(input.academicTitle, "Học hàm, học vị", 100) ?? null,
    email: readEmail(input.email) ?? null,
    isInternal,
    organizationUnitId: isInternal ? readRequired(input.organizationUnitId, "Đơn vị trong Học viện", 80) : null,
    externalOrganization: isInternal ? null : readOptional(input.externalOrganization, "Đơn vị công tác", 300) ?? null
  };
  // Người chưa có tài khoản chỉ nhận được thư qua email.
  if (!result.email) throw new BadRequestException({ message: `Cần email của ${result.fullName} để gửi thư mời.` });
  return result;
}

export const createInvitationsPipe: PipeTransform<unknown, InvitationInputDto[]> = { transform(value) {
  const input = record(value);
  if (!Array.isArray(input.invitations) || !input.invitations.length) throw new BadRequestException({ message: "Chưa có khách mời nào." });
  if (input.invitations.length > MAX_INVITATIONS_PER_REQUEST) throw new BadRequestException({ message: `Mỗi lần thêm tối đa ${MAX_INVITATIONS_PER_REQUEST} khách mời.` });
  return input.invitations.map(readInvitationInput);
} };

export const updateInvitationPipe: PipeTransform<unknown, UpdateInvitationDto> = { transform(value) {
  const input = record(value);
  const result: UpdateInvitationDto = {};
  if ("kind" in input) result.kind = readKind(input.kind);
  if ("fullName" in input) result.fullName = readRequired(input.fullName, "Họ tên", 200);
  if ("academicTitle" in input) result.academicTitle = readOptional(input.academicTitle, "Học hàm, học vị", 100) ?? null;
  if ("email" in input) result.email = readEmail(input.email) ?? null;
  if ("isInternal" in input) result.isInternal = input.isInternal === true;
  if ("organizationUnitId" in input) result.organizationUnitId = readOptional(input.organizationUnitId, "Đơn vị trong Học viện", 80) ?? null;
  if ("externalOrganization" in input) result.externalOrganization = readOptional(input.externalOrganization, "Đơn vị công tác", 300) ?? null;
  if (!Object.keys(result).length) throw new BadRequestException({ message: "Không có thông tin nào cần sửa." });
  return result;
} };

export const reasonPipe: PipeTransform<unknown, { reason: string }> = { transform(value) {
  const input = record(value ?? {});
  return { reason: readRequired(input.reason, "Lý do", 1000) };
} };

export const sendMailingPipe: PipeTransform<unknown, SendMailingDto> = { transform(value) {
  const input = record(value);
  if (input.kind !== "invitation" && input.kind !== "reminder" && input.kind !== "change_notice") throw new BadRequestException({ message: "Loại thư không hợp lệ." });
  if (!Array.isArray(input.invitationIds) || !input.invitationIds.length) throw new BadRequestException({ message: "Chưa chọn người nhận." });
  if (input.invitationIds.length > 2000) throw new BadRequestException({ message: "Mỗi đợt thư tối đa 2000 người nhận." });
  const invitationIds = [...new Set(input.invitationIds.map((id) => readRequired(id, "Người nhận", 80)))];
  const subject = readOptional(input.subject, "Tiêu đề", 300);
  const message = readOptional(input.message, "Nội dung", 5000);
  if (input.kind === "change_notice" && !message) throw new BadRequestException({ message: "Thông báo thay đổi cần nêu nội dung thay đổi." });
  return { kind: input.kind, invitationIds, subject, message };
} };

function readDecision(input: Record<string, unknown>): InvitationResponseDto {
  if (input.decision !== "accept" && input.decision !== "decline") throw new BadRequestException({ message: "Cần chọn nhận lời hoặc từ chối." });
  return { decision: input.decision, reason: readOptional(input.reason, "Lý do", 1000) };
}

export const invitationResponsePipe: PipeTransform<unknown, InvitationResponseDto> = { transform(value) {
  return readDecision(record(value));
} };

export function readInvitationToken(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(value)) throw new BadRequestException({ code: "INVITATION_TOKEN_INVALID", message: "Đường link thư mời không hợp lệ hoặc đã hết hạn." });
  return value;
}

export const invitationTokenPipe: PipeTransform<unknown, { token: string }> = { transform(value) {
  return { token: readInvitationToken(record(value).token) };
} };

export const publicInvitationResponsePipe: PipeTransform<unknown, PublicInvitationResponseDto> = { transform(value) {
  const input = record(value);
  return { token: readInvitationToken(input.token), ...readDecision(input) };
} };

function readAuthors(value: unknown): PaperAuthor[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  let parsed = value;
  // Biểu mẫu tải tệp (multipart) gửi danh sách tác giả dạng chuỗi JSON.
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { throw new BadRequestException({ message: "Danh sách tác giả không hợp lệ." }); }
  }
  if (!Array.isArray(parsed) || parsed.length > 50) throw new BadRequestException({ message: "Danh sách tác giả không hợp lệ (tối đa 50 tác giả)." });
  return parsed.map((item) => {
    const author = record(item);
    return { fullName: readRequired(author.fullName, "Họ tên tác giả", 200), organization: readOptional(author.organization, "Đơn vị của tác giả", 300), corresponding: author.corresponding === true || author.corresponding === "true" };
  });
}

/** Thân biểu mẫu nộp bài (multipart): tệp đi riêng, các trường là chuỗi. */
export function readSubmitPaper(value: unknown): SubmitPaperDto {
  const input = record(value ?? {});
  const kind = readPaperKind(input.kind);
  const result: SubmitPaperDto = { version: readVersion(input.version), kind, title: readOptional(input.title, "Tên báo cáo", 500), authors: readAuthors(input.authors) };
  if (kind === "abstract") {
    result.title = readRequired(input.title, "Tên báo cáo", 500);
    result.abstractText = readRequired(input.abstractText, "Nội dung tóm tắt", 10000);
  }
  return result;
}

export const revisionRequestPipe: PipeTransform<unknown, RevisionRequestDto> = { transform(value) {
  const input = record(value);
  return { version: readVersion(input.version), kind: readPaperKind(input.kind), reason: readRequired(input.reason, "Nội dung cần sửa", 2000), dueAt: readInstant(input.dueAt, "Hạn nộp lại") };
} };
