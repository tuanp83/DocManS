import { Module } from "@nestjs/common";
import { CleanupService } from "./cleanup.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";

@Module({
  providers: [CleanupService, PrismaService],
})
export class TasksModule {}
