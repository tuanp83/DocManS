import "dotenv/config";
import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";

// Khởi động toàn bộ AppModule: bắt lỗi khai báo module (thiếu provider, thiếu import) mà các test đơn vị bỏ sót.
// Cần DATABASE_URL (CI có PostgreSQL) vì PrismaService kết nối khi khởi tạo.
test("the whole Nest application context boots", { skip: !process.env.DATABASE_URL && "DATABASE_URL chưa đặt" }, async () => {
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../dist/apps/api/app.module.js");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  try {
    assert.ok(app.get(AppModule));
  } finally {
    await app.close();
  }
});
