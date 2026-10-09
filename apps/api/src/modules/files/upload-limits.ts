const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Giới hạn kích thước tệp tải lên, đọc từ FILE_MAX_UPLOAD_BYTES (mặc định 10 MB). */
export function readMaxUploadBytes(value = process.env.FILE_MAX_UPLOAD_BYTES): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Tuỳ chọn multer dùng chung cho MỌI FileInterceptor.
 *
 * Không có `limits`, multer đọc toàn bộ tệp vào RAM trước khi service kiểm tra kích thước, nên một
 * yêu cầu vài GB có thể làm sập API. Với `limits`, multer dừng ngay khi vượt ngưỡng và Nest trả 413
 * (PayloadTooLargeException). Service vẫn kiểm tra lại kích thước, đuôi tệp và MIME như trước.
 */
export function uploadInterceptorOptions(maxBytes = readMaxUploadBytes()) {
  return {
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 30,
      fieldSize: 64 * 1024,
      parts: 40
    }
  };
}
