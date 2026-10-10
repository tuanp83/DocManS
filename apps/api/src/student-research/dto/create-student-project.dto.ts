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

export type CompleteStudentProjectDto = { score?: number; award?: string };

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

export const createStudentProjectPipe: PipeTransform<unknown, CreateStudentProjectDto> = { transform(value) {
  const input = record(value);
  const result: CreateStudentProjectDto = {
    code: readRequired(input.code, "Mã đề tài", 50),
    name: readRequired(input.name, "Tên đề tài", 500),
    studentName: readRequired(input.studentName, "Tên sinh viên", 200),
    studentClass: readRequired(input.studentClass, "Lớp", 100),
    studentContact: readOptional(input.studentContact, "Liên lạc", 100),
    supervisorId: readRequired(input.supervisorId, "Giảng viên hướng dẫn", 80),
    organizationUnitId: readRequired(input.organizationUnitId, "Đơn vị quản lý", 80),
    startDate: readDay(input.startDate, "Ngày bắt đầu"),
    endDate: readDay(input.endDate, "Ngày kết thúc")
  };
  if (result.startDate && result.endDate && result.endDate < result.startDate) throw new BadRequestException({ message: "Ngày kết thúc phải sau ngày bắt đầu." });
  return result;
} };

export const completeStudentProjectPipe: PipeTransform<unknown, CompleteStudentProjectDto> = { transform(value) {
  const input = record(value ?? {});
  let score: number | undefined;
  if (input.score !== undefined && input.score !== null && input.score !== "") {
    score = typeof input.score === "string" ? Number(input.score) : (input.score as number);
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10 || Math.abs(score * 100 - Math.round(score * 100)) > 1e-6) throw new BadRequestException({ message: "Điểm theo thang 10, tối đa 2 chữ số thập phân." });
  }
  return { score, award: readOptional(input.award, "Giải thưởng", 200) };
} };
