import { BadRequestException, type PipeTransform } from "@nestjs/common";

export type CreateStudentProjectDto = {
  code: string;
  name: string;
  studentName: string;
  studentClass: string;
  studentContact?: string;
  supervisorId: string;
  organizationUnitId: string;
  startDate?: Date;
  endDate?: Date;
};

/** Giảng viên đăng ký: tự là giảng viên hướng dẫn; mã đề tài do chuyên viên cấp khi duyệt. */
export type RegisterStudentProjectDto = Omit<CreateStudentProjectDto, "code" | "supervisorId">;

/** Sửa đề tài: chỉ các trường gửi lên; null/"" ở trường tuỳ chọn nghĩa là xoá giá trị. */
export type UpdateStudentProjectDto = {
  version: string;
  code?: string;
  name?: string;
  studentName?: string;
  studentClass?: string;
  studentContact?: string | null;
  supervisorId?: string;
  organizationUnitId?: string;
  startDate?: Date | null;
  endDate?: Date | null;
};

export type TransitionStudentProjectDto = { version: string; reason?: string; code?: string };

export type CompleteStudentProjectDto = { score?: number; award?: string; version: string };

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

/** Ngày dạng YYYY-MM-DD (ô nhập ngày của trình duyệt), lưu 00:00 UTC. */
function readDay(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException({ message: `${field} phải có dạng YYYY-MM-DD.` });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException({ message: `${field} không hợp lệ.` });
  return date;
}

/** Phiên bản đề tài người dùng đang xem (updatedAt, ISO): chặn ghi đè thay đổi của người khác. */
function readVersion(value: unknown) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new BadRequestException({ code: "CONTEXT_VERSION_REQUIRED", message: "Thiếu phiên bản đề tài. Vui lòng tải lại trang." });
  return new Date(value).toISOString();
}

const CODE_MAX = 50;

function assertDateOrder(startDate?: Date | null, endDate?: Date | null) {
  if (startDate && endDate && endDate < startDate) throw new BadRequestException({ message: "Ngày kết thúc phải sau ngày bắt đầu." });
}

function readCommon(input: Record<string, unknown>) {
  return {
    name: readRequired(input.name, "Tên đề tài", 500),
    studentName: readRequired(input.studentName, "Tên sinh viên", 200),
    studentClass: readRequired(input.studentClass, "Lớp", 100),
    studentContact: readOptional(input.studentContact, "Liên lạc", 100),
    organizationUnitId: readRequired(input.organizationUnitId, "Đơn vị quản lý", 80),
    startDate: readDay(input.startDate, "Ngày bắt đầu"),
    endDate: readDay(input.endDate, "Ngày kết thúc")
  };
}

export const createStudentProjectPipe: PipeTransform<unknown, CreateStudentProjectDto> = { transform(value) {
  const input = record(value);
  const result: CreateStudentProjectDto = {
    code: readRequired(input.code, "Mã đề tài", CODE_MAX),
    supervisorId: readRequired(input.supervisorId, "Giảng viên hướng dẫn", 80),
    ...readCommon(input)
  };
  assertDateOrder(result.startDate, result.endDate);
  return result;
} };

export const registerStudentProjectPipe: PipeTransform<unknown, RegisterStudentProjectDto> = { transform(value) {
  const input = record(value);
  const result: RegisterStudentProjectDto = readCommon(input);
  assertDateOrder(result.startDate, result.endDate);
  return result;
} };

export const updateStudentProjectPipe: PipeTransform<unknown, UpdateStudentProjectDto> = { transform(value) {
  const input = record(value);
  const result: UpdateStudentProjectDto = { version: readVersion(input.version) };
  if ("code" in input) result.code = readRequired(input.code, "Mã đề tài", CODE_MAX);
  if ("name" in input) result.name = readRequired(input.name, "Tên đề tài", 500);
  if ("studentName" in input) result.studentName = readRequired(input.studentName, "Tên sinh viên", 200);
  if ("studentClass" in input) result.studentClass = readRequired(input.studentClass, "Lớp", 100);
  if ("studentContact" in input) result.studentContact = readOptional(input.studentContact, "Liên lạc", 100) ?? null;
  if ("supervisorId" in input) result.supervisorId = readRequired(input.supervisorId, "Giảng viên hướng dẫn", 80);
  if ("organizationUnitId" in input) result.organizationUnitId = readRequired(input.organizationUnitId, "Đơn vị quản lý", 80);
  if ("startDate" in input) result.startDate = readDay(input.startDate, "Ngày bắt đầu") ?? null;
  if ("endDate" in input) result.endDate = readDay(input.endDate, "Ngày kết thúc") ?? null;
  if (Object.keys(result).length === 1) throw new BadRequestException({ message: "Không có thông tin nào cần sửa." });
  return result;
} };

export const transitionStudentProjectPipe: PipeTransform<unknown, TransitionStudentProjectDto> = { transform(value) {
  const input = record(value ?? {});
  return { version: readVersion(input.version), reason: readOptional(input.reason, "Lý do", 1000), code: readOptional(input.code, "Mã đề tài", CODE_MAX) };
} };

export const completeStudentProjectPipe: PipeTransform<unknown, CompleteStudentProjectDto> = { transform(value) {
  const input = record(value ?? {});
  let score: number | undefined;
  if (input.score !== undefined && input.score !== null && input.score !== "") {
    score = typeof input.score === "string" ? Number(input.score) : (input.score as number);
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10 || Math.abs(score * 100 - Math.round(score * 100)) > 1e-6) throw new BadRequestException({ message: "Điểm theo thang 10, tối đa 2 chữ số thập phân." });
  }
  return { score, award: readOptional(input.award, "Giải thưởng", 200), version: readVersion(input.version) };
} };
