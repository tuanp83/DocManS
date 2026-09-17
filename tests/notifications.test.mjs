import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotificationsService } from "../dist/apps/api/notifications/notifications.service.js";

describe("NotificationsService", () => {
  const actor = {
    id: "user-test-1",
    username: "scientist1",
    displayName: "Nhà khoa học 1",
    systemRole: "RESEARCHER"
  };

  it("lists notifications and returns unreadCount", async () => {
    const mockNotifications = [
      {
        id: "notif-1",
        userId: actor.id,
        title: "Mời phản biện đề tài",
        message: "Bạn được mời phản biện",
        type: "INVITATION_TO_REVIEW",
        link: "/invitation-to-review",
        isRead: false,
        createdAt: new Date()
      }
    ];

    const prisma = {
      userNotification: {
        findMany: async (args) => {
          assert.equal(args.where.userId, actor.id);
          return mockNotifications;
        },
        count: async (args) => {
          assert.equal(args.where.userId, actor.id);
          assert.equal(args.where.isRead, false);
          return 1;
        }
      }
    };

    const service = new NotificationsService(prisma);
    const result = await service.listMyNotifications(actor);

    assert.equal(result.notifications.length, 1);
    assert.equal(result.unreadCount, 1);
    assert.equal(result.notifications[0].title, "Mời phản biện đề tài");
  });

  it("marks a single notification as read", async () => {
    let updatedId = null;
    const prisma = {
      userNotification: {
        findFirst: async (args) => {
          if (args.where.id === "notif-1" && args.where.userId === actor.id) {
            return { id: "notif-1", userId: actor.id, isRead: false };
          }
          return null;
        },
        update: async (args) => {
          updatedId = args.where.id;
          return { id: args.where.id, isRead: true };
        },
        count: async () => 0
      }
    };

    const service = new NotificationsService(prisma);
    const result = await service.markAsRead(actor, "notif-1");

    assert.equal(updatedId, "notif-1");
    assert.equal(result.notification.isRead, true);
    assert.equal(result.unreadCount, 0);
  });

  it("marks all notifications as read", async () => {
    let updatedWhere = null;
    const prisma = {
      userNotification: {
        updateMany: async (args) => {
          updatedWhere = args.where;
          return { count: 3 };
        }
      }
    };

    const service = new NotificationsService(prisma);
    const result = await service.markAllAsRead(actor);

    assert.equal(updatedWhere.userId, actor.id);
    assert.equal(updatedWhere.isRead, false);
    assert.equal(result.success, true);
    assert.equal(result.unreadCount, 0);
  });
});
