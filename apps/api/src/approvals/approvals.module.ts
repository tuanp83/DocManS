import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ApprovalRoutingController } from "./approval-routing.controller.js";
import { ApprovalRoutingService } from "./approval-routing.service.js";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ApprovalRoutingController],
  providers: [ApprovalRoutingService]
})
export class ApprovalsModule {}
