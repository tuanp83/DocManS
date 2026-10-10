import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { readRequired } from "./create-student-project.dto.js";

export type UploadStudentDocumentDto = { documentType: string; fileId: string };

export const STUDENT_DOCUMENT_TYPES = ["REGISTRATION", "PROPOSAL", "PROGRESS_REPORT", "FINAL_REPORT", "EVALUATION", "OTHER"] as const;

export const uploadStudentDocumentPipe: PipeTransform<unknown, UploadStudentDocumentDto> = { transform(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ message: "Dữ liệu không hợp lệ." });
  const input = value as Record<string, unknown>;
  const documentType = readRequired(input.documentType, "Loại tài liệu", 40).toUpperCase();
  if (!(STUDENT_DOCUMENT_TYPES as readonly string[]).includes(documentType)) throw new BadRequestException({ message: `Loại tài liệu chỉ được là: ${STUDENT_DOCUMENT_TYPES.join(", ")}.` });
  return { documentType, fileId: readRequired(input.fileId, "Mã tệp", 80) };
} };
