import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";

// Seed production chạy ở mọi lần triển khai (service migrate): lần đầu tạo dữ liệu nền và tài khoản quản trị,
// các lần sau không được ghi đè những gì quản trị đã chỉnh, và không bao giờ tạo tài khoản mẫu mật khẩu 1234.
let database;
let db;
const originalUrl = process.env.DATABASE_URL;

function runProductionSeed(url) {
  execFileSync("node", ["apps/api/prisma/seed.mjs"], {
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "production", ADMIN_USERNAME: "quantri", ADMIN_INITIAL_PASSWORD: "KhoiTao2026Manh" },
    stdio: ["ignore", "ignore", "inherit"]
  });
}

before(async () => {
  database = await createMigratedDatabase("seed_production");
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

test("production seed creates only the bootstrap admin and keeps admin changes on every later deploy", async () => {
  runProductionSeed(database.url);
  const users = await db.user.findMany({ select: { username: true, systemRole: true, mustChangePassword: true } });
  assert.deepEqual(users, [{ username: "quantri", systemRole: "SYSTEM_ADMIN", mustChangePassword: true }], "không có tài khoản mẫu");

  // Quản trị chỉnh dữ liệu nền sau lần triển khai đầu.
  await db.organizationUnit.update({ where: { code: "BGD" }, data: { name: "Ban Giám đốc Học viện" } });
  await db.organizationUnit.update({ where: { code: "HVQY" }, data: { status: "inactive" } });
  await db.systemParameter.update({ where: { key: "session_timeout_minutes" }, data: { value: "240" } });
  const catalog = await db.catalogItem.findFirstOrThrow({ where: { type: "research-field" } });
  await db.catalogItem.update({ where: { id: catalog.id }, data: { name: "Lĩnh vực đã đổi tên", status: "inactive" } });
  await db.notificationTemplate.update({ where: { key: "user_created" }, data: { subject: "Tiêu đề do quản trị soạn" } });

  // Lần triển khai sau.
  runProductionSeed(database.url);
  assert.equal((await db.organizationUnit.findUniqueOrThrow({ where: { code: "BGD" } })).name, "Ban Giám đốc Học viện");
  assert.equal((await db.organizationUnit.findUniqueOrThrow({ where: { code: "HVQY" } })).status, "inactive");
  assert.equal((await db.systemParameter.findUniqueOrThrow({ where: { key: "session_timeout_minutes" } })).value, "240");
  const kept = await db.catalogItem.findUniqueOrThrow({ where: { id: catalog.id } });
  assert.deepEqual([kept.name, kept.status], ["Lĩnh vực đã đổi tên", "inactive"]);
  assert.equal((await db.notificationTemplate.findUniqueOrThrow({ where: { key: "user_created" } })).subject, "Tiêu đề do quản trị soạn");
  assert.equal(await db.user.count(), 1, "chạy lại không tạo thêm tài khoản");
});
