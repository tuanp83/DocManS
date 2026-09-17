import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
