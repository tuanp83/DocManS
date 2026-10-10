import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { MailService } from "../mail/mail.service.js";
import { recipientsOf, renderNotificationEmail, type WorkflowEvent } from "./workflow-events.js";

type NotificationInput = { userId: string; title: string; message: string; type: string; link?: string; metadata?: any; dedupKey?: string };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mailService?: MailService
  ) {}

  /** Một thông báo cho một người; email gửi nền, không chặn và không làm hỏng thao tác gọi tới. */
  async createNotification(data: NotificationInput) {
    try {
      const [created] = await this.persist([data]);
      return created ?? null;
    } catch (error) {
      this.logger.error(`Không ghi được thông báo: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  /**
   * Phát các sự kiện nghiệp vụ đã commit. Người nhận không hoạt động bị bỏ qua; trùng `dedupKey` với thông
   * báo đã có của cùng người nhận thì không tạo lại (dùng cho nhắc hạn chạy định kỳ). Không ném lỗi.
   */
  async dispatch(events: WorkflowEvent[]): Promise<number> {
    const inputs: NotificationInput[] = [];
    for (const event of events) {
      for (const userId of recipientsOf(event)) {
        inputs.push({ userId, title: event.title, message: event.message, type: event.type, link: event.link, metadata: event.metadata ?? {}, dedupKey: event.dedupKey });
      }
    }
    if (!inputs.length) return 0;
    try {
      return (await this.persist(inputs)).length;
    } catch (error) {
      this.logger.error(`Không thể ghi thông báo: ${(error as Error)?.message ?? error}`);
      return 0;
    }
  }

  private async persist(inputs: NotificationInput[]) {
    const prisma = this.prisma as any;
    const userIds = [...new Set(inputs.map((input) => input.userId))];
    const users = typeof prisma.user?.findMany === "function"
      ? ((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, status: true, credentialEmail: true } })) as Array<{ id: string; status: string; credentialEmail: string | null }>)
      : userIds.map((id) => ({ id, status: "active", credentialEmail: null }));
    const byId = new Map(users.map((user) => [user.id, user]));
    const created: any[] = [];
    for (const input of inputs) {
      const user = byId.get(input.userId);
      if (!user || user.status !== "active") continue;
      if (input.dedupKey && typeof prisma.userNotification.findFirst === "function") {
        const existing = await prisma.userNotification.findFirst({ where: { userId: input.userId, dedupKey: input.dedupKey }, select: { id: true } });
        if (existing) continue;
      }
      try {
        const notification = await prisma.userNotification.create({
          data: { userId: input.userId, title: input.title, message: input.message, type: input.type, link: input.link, metadata: input.metadata || {}, ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}) }
        });
        created.push(notification);
        if (user.credentialEmail) this.sendEmail(user.credentialEmail, input);
      } catch (error) {
        // Hai tiến trình nhắc hạn chạy cùng lúc: chỉ một bản ghi thắng nhờ chỉ mục duy nhất (user_id, dedup_key).
        if ((error as { code?: string })?.code === "P2002") continue;
        // Lỗi với một người nhận không chặn những người còn lại.
        this.logger.error(`Không ghi được thông báo cho ${input.userId}: ${(error as Error)?.message ?? error}`);
      }
    }
    return created;
  }

  private sendEmail(to: string, input: NotificationInput) {
    if (!this.mailService) return;
    const html = renderNotificationEmail(input);
    void Promise.resolve()
      .then(() => this.mailService!.sendMail(to, input.title, html))
      .catch((error) => this.logger.error(`Không gửi được email thông báo: ${(error as Error)?.message ?? error}`));
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
