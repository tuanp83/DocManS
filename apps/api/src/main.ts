import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import helmet from "helmet";
import express from "express";

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.warn("⚠️ Bắt buộc hệ thống nên chạy với NODE_ENV=production trong môi trường thực tế.");
    // In strict mode, we could throw an error, but warning allows fallback. We'll set it to production if missing.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal");

  // Security headers
  app.use(helmet());

  // Body payload limits
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Graceful shutdown hooks
  app.enableShutdownHooks();

  const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
