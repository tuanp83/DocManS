import { BadRequestException } from "@nestjs/common";
import path from "node:path";

/**
 * Quy tắc kiểm tra tệp tải lên dùng chung (hồ sơ đề xuất, đề tài, NCKH sinh viên): đuôi tệp trong danh sách
 * cho phép, MIME khớp đuôi, dung lượng trong giới hạn và khớp nội dung thực nhận.
 */

export const MIME_TYPES_BY_EXTENSION: Record<string, string[]> = {
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pdf": ["application/pdf"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
};

export type FileModuleConfig = {
  allowedExtensions: string[];
  maxFileSizeBytes: number;
  bucketName?: string;
};

export function defaultFileConfig(): FileModuleConfig {
  const allowedExtensions = (process.env.FILE_ALLOWED_EXTENSIONS ?? ".doc,.docx,.pdf,.xls,.xlsx")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const maxFileSizeBytes = Number(process.env.FILE_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024);
  return {
    allowedExtensions,
    maxFileSizeBytes: Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0 ? maxFileSizeBytes : 10 * 1024 * 1024,
    bucketName: process.env.MINIO_BUCKET_NAME
  };
}

export function readUploadFileName(value: unknown) {
  if (typeof value !== "string") throw new BadRequestException({ message: "Tên tệp không hợp lệ." });
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) throw new BadRequestException({ message: "Tên tệp không hợp lệ." });
  return trimmed.normalize("NFC");
}

export function assertValidUpload(input: { fileName: string; mimeType: string; sizeBytes: number; content: Buffer }, config: FileModuleConfig) {
  const extension = path.extname(input.fileName).toLowerCase();
  if (!config.allowedExtensions.includes(extension)) {
    throw new BadRequestException({ message: "Định dạng tệp không được hỗ trợ." });
  }
  const allowedMimeTypes = MIME_TYPES_BY_EXTENSION[extension];
  if (allowedMimeTypes && !allowedMimeTypes.includes(input.mimeType)) {
    throw new BadRequestException({ message: "MIME type của tệp không khớp định dạng cho phép." });
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > config.maxFileSizeBytes) {
    throw new BadRequestException({ message: "Dung lượng tệp vượt quá giới hạn cho phép." });
  }
  if (input.content.length !== input.sizeBytes) {
    throw new BadRequestException({ message: "Dung lượng tệp không khớp nội dung tải lên." });
  }
}
