import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { MailService } from "../mail/mail.service.js";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService
  ) {}

  async createNotification(data: { userId: string; title: string; message: string; type: string; link?: string; metadata?: any }) {
    const notification = await (this.prisma as any).userNotification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        link: data.link,
        metadata: data.metadata || {}
      }
    });

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

    try {
      const user = await (this.prisma as any).user.findUnique({
        where: { id: data.userId }
      });
      if (user && user.credentialEmail) {
        const safeTitle = escapeHtml(data.title);
        const safeMessage = escapeHtml(data.message);
        
        let fullLink = data.link || "";
        if (fullLink && !fullLink.startsWith("http")) {
          const baseUrl = process.env.ACCOUNT_LOGIN_URL ? new URL(process.env.ACCOUNT_LOGIN_URL).origin : "http://localhost:3000";
          fullLink = baseUrl + (fullLink.startsWith("/") ? "" : "/") + fullLink;
        }

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Thông báo từ DocManS</h2>
            <p><strong>${safeTitle}</strong></p>
            <p>${safeMessage}</p>
            ${fullLink ? `<p><a href="${fullLink}" style="display: inline-block; padding: 10px 15px; background-color: #3498db; color: white; text-decoration: none; border-radius: 4px;">Xem chi tiết</a></p>` : ""}
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
            <p style="font-size: 12px; color: #7f8c8d;">Hệ thống Quản lý Nghiên cứu Khoa học (DocManS)<br/>Học viện Quân Y</p>
          </div>
        `;
        await this.mailService.sendMail(user.credentialEmail, data.title, emailHtml);
      }
    } catch (e) {
      console.error("Failed to send email notification", e);
    }

    return notification;
  }

  async listMyNotifications(actor: SafeUserContext, query?: { limit?: string; unreadOnly?: string }) {
    const unreadOnly = query?.unreadOnly === "true";
    const take = Math.min(Math.max(Number(query?.limit ?? 20) || 20, 1), 100);

    const where = {
      userId: actor.id,
      ...(unreadOnly ? { isRead: false } : {})
    };

    const [notifications, unreadCount] = await Promise.all([
      (this.prisma as any).userNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take
      }),
      (this.prisma as any).userNotification.count({
        where: {
          userId: actor.id,
          isRead: false
        }
      })
    ]);

    return {
      notifications,
      unreadCount
    };
  }

  async markAsRead(actor: SafeUserContext, id: string) {
    const notification = await (this.prisma as any).userNotification.findFirst({
      where: {
        id,
        userId: actor.id
      }
    });

    if (!notification) {
      throw new NotFoundException({ message: "Không tìm thấy thông báo." });
    }

    const updated = await (this.prisma as any).userNotification.update({
      where: { id },
      data: { isRead: true }
    });

    const unreadCount = await (this.prisma as any).userNotification.count({
      where: {
        userId: actor.id,
        isRead: false
      }
    });

    return {
      notification: updated,
      unreadCount
    };
  }

  async markAllAsRead(actor: SafeUserContext) {
    await (this.prisma as any).userNotification.updateMany({
      where: {
        userId: actor.id,
        isRead: false
      },
      data: { isRead: true }
    });

    return {
      success: true,
      unreadCount: 0
    };
  }
}
