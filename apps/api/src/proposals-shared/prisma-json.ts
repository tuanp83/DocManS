import { Prisma } from "@prisma/client";

/**
 * Giá trị ghi vào cột JSON có thể trống: null / undefined thành SQL NULL (Prisma.DbNull), còn lại ghi nguyên.
 * Dữ liệu ở đây đã được kiểm tra trước (pipe, hàm đọc của service); hàm chỉ nói rõ ý định với kiểu của Prisma.
 */
export function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
