import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

/**
 * Một PrismaService (một pool kết nối) cho toàn bộ API. Module nghiệp vụ không tự khai báo
 * PrismaService trong `providers`: mỗi lần khai báo tạo thêm một PrismaClient với pool riêng,
 * nhân số kết nối PostgreSQL lên theo số module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
