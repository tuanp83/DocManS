import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log("Bắt đầu dọn dẹp dữ liệu hết hạn...");

    try {
      // Dọn dẹp session
      const deletedSessions = await this.prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      this.logger.log(`Đã xoá ${deletedSessions.count} phiên đăng nhập (session) hết hạn.`);

      // Dọn dẹp token kích hoạt tài khoản
      const deletedActivationTokens = await this.prisma.accountActivationToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      this.logger.log(`Đã xoá ${deletedActivationTokens.count} token kích hoạt hết hạn.`);

      // Dọn dẹp password reset token
      const deletedResetTokens = await this.prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      this.logger.log(`Đã xoá ${deletedResetTokens.count} token đặt lại mật khẩu hết hạn.`);

      this.logger.log("Hoàn thành quá trình dọn dẹp.");
    } catch (error) {
      this.logger.error("Lỗi khi dọn dẹp dữ liệu:", error);
    }
  }
}
