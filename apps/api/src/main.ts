import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { requestContextMiddleware } from "./infrastructure/observability/request-context.js";
import helmet from "helmet";
import express from "express";
import { csrfProtection } from "./auth/csrf.js";
import { CSP_REPORT_PATH, cspReportHandler } from "./security/csp-report.js";

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.warn("⚠️ Bắt buộc hệ thống nên chạy với NODE_ENV=production trong môi trường thực tế.");
    // In strict mode, we could throw an error, but warning allows fallback. We'll set it to production if missing.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal");

  // Request id + log JSON cho request lỗi/chậm; đặt trước mọi middleware khác để luôn có mã tra cứu.
  app.use(requestContextMiddleware());

  // Security headers
  app.use(helmet());

  const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // CORS trước lớp chống giả mạo yêu cầu: phản hồi từ chối vẫn kèm header CORS để giao diện đọc được thông báo.
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });

  // Báo cáo vi phạm CSP do trình duyệt gửi (kiểu application/csp-report, không mang cookie phiên): xử lý trước lớp
  // chống giả mạo yêu cầu, chỉ ghi log.
  app.getHttpAdapter().getInstance().post(CSP_REPORT_PATH, ...cspReportHandler());

  // Chống giả mạo yêu cầu: kiểu dữ liệu, nguồn gửi và mã CSRF của phiên (auth/csrf.ts), trước mọi controller.
  // Không nhận thân dạng biểu mẫu (x-www-form-urlencoded): giao diện chỉ gửi JSON và multipart.
  app.use(csrfProtection(allowedOrigins));

  // Body payload limits
  app.use(express.json({ limit: "1mb" }));

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
