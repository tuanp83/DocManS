import { BadRequestException } from "@nestjs/common";

export const STUDENT_DOCUMENT_TYPES = ["REGISTRATION", "PROPOSAL", "PROGRESS_REPORT", "FINAL_REPORT", "EVALUATION", "OTHER"] as const;

export type StudentDocumentType = (typeof STUDENT_DOCUMENT_TYPES)[number];

/** Loại tài liệu gửi kèm tệp (multipart): không phân biệt hoa thường, chỉ nhận loại trong danh mục. */
export function readStudentDocumentType(value: unknown): StudentDocumentType {
  const documentType = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!(STUDENT_DOCUMENT_TYPES as readonly string[]).includes(documentType)) throw new BadRequestException({ message: `Loại tài liệu chỉ được là: ${STUDENT_DOCUMENT_TYPES.join(", ")}.` });
  return documentType as StudentDocumentType;
}
