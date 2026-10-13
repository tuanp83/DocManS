import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type ObjectContentResponse = {
  setHeader(name: string, value: string): void;
  send(content: Buffer): void;
};

/**
 * Gửi nội dung tệp lấy từ MinIO. Stream được chuyển thẳng ra response nên RAM không tăng theo kích
 * thước tệp hay số lượt tải đồng thời (trước đây đọc cả tệp vào Buffer rồi mới gửi).
 */
export async function sendObjectContent(response: ObjectContentResponse, content: Readable | Buffer, sizeBytes?: number) {
  if (Buffer.isBuffer(content)) {
    response.setHeader("Content-Length", String(content.length));
    response.send(content);
    return;
  }
  if (sizeBytes !== undefined) response.setHeader("Content-Length", String(sizeBytes));
  try {
    await pipeline(content, response as unknown as NodeJS.WritableStream);
  } catch {
    // Header đã gửi nên không trả lỗi JSON được: pipeline đã huỷ kết nối (người dùng ngắt tải hoặc MinIO lỗi giữa chừng).
  }
}
