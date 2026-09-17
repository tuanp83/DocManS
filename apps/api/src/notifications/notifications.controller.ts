import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("api/v1/notifications")
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Req() request: RequestWithCurrentUser, @Query() query: { limit?: string; unreadOnly?: string }) {
    return this.notificationsService.listMyNotifications(request.currentUser!, query);
  }

  @Post(":id/read")
  async markAsRead(@Req() request: RequestWithCurrentUser, @Param("id") id: string) {
    return this.notificationsService.markAsRead(request.currentUser!, id);
  }

  @Post("read-all")
  async markAllAsRead(@Req() request: RequestWithCurrentUser) {
    return this.notificationsService.markAllAsRead(request.currentUser!);
  }
}
