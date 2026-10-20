import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { AuthService } from "../dist/apps/api/auth/auth.service.js";
import { AuthRateLimitService } from "../dist/apps/api/auth/auth-rate-limit.service.js";
import { PasswordService } from "../dist/apps/api/auth/password.service.js";
import { LoginOtpService, loginOtpApplies, maskEmail } from "../dist/apps/api/auth/login-otp.js";
import { AdminUsersService } from "../dist/apps/api/admin/admin-users.service.js";

// Xác thực hai lớp qua thư (apps/api/src/auth/login-otp.ts) trên PostgreSQL thật, thư giả bắt mã gửi đi.

let database;
let db;
let auth;
let store;
let org;
const sent = [];
let mailFails = false;
const context = { ip: "203.0.113.9", userAgent: "test" };
const PASSWORD = "MatKhauThu123";
let sequence = 0;

async function account(systemRole, { email = true, otpEnabled = false } = {}) {
  const username = `otp-${systemRole.toLowerCase().replace(/_/g, "-")}-${++sequence}`;
  return db.user.create({
    data: {
      username, usernameKey: username, displayName: username, passwordHash: await new PasswordService().hashPassword(PASSWORD), status: "active", systemRole, unit: org.name,
      credentialEmail: email ? `${username}@hvqy.test` : null, loginOtpEnabled: otpEnabled,
      organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] }
    }
  });
}

const lastCode = (to) => /letter-spacing:4px">(\d{6})</.exec(sent.filter((mail) => mail.to === to).at(-1).html)[1];
const login = (user) => auth.login({ username: user.username, password: PASSWORD }, context);

describe("Xác thực hai lớp qua thư trên PostgreSQL thật", () => {
  before(async () => {
    process.env.LOGIN_OTP_MODE = "required-roles";
    database = await createMigratedDatabase("login-otp");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();
    store = new AuthStore(db);
    const mail = { sendMail: async (to, subject, html) => { if (mailFails) throw new Error("smtp down"); sent.push({ to, subject, html }); return { messageId: String(sent.length) }; } };
    auth = new AuthService(new AuditLogService(db), new AuthRateLimitService(), store, new PasswordService(), new LoginOtpService(db, mail));
    org = await db.organizationUnit.create({ data: { code: "OTP-ORG", name: "Đơn vị thử OTP" } });
  });

  beforeEach(() => { mailFails = false; });

  after(async () => {
    delete process.env.LOGIN_OTP_MODE;
    await db?.$disconnect();
    await database?.drop();
  });

  it("vai trò bắt buộc: mật khẩu đúng chưa cấp phiên, mã đúng mới cấp, mã chỉ dùng một lần", async () => {
    const head = await account("RESEARCH_MANAGEMENT_HEAD");
    const sessionsBefore = await db.session.count({ where: { userId: head.id } });
    const step1 = await login(head);
    assert.ok(step1.challenge, "phải chờ mã");
    assert.equal(step1.session, undefined);
    assert.equal(await db.session.count({ where: { userId: head.id } }), sessionsBefore, "chưa có phiên");
    assert.equal(step1.challenge.emailHint, maskEmail(head.credentialEmail));
    const stored = await db.loginChallenge.findUnique({ where: { id: step1.challenge.challengeId } });
    const code = lastCode(head.credentialEmail);
    assert.notEqual(stored.codeHash, code, "mã không lưu dạng rõ");
    assert.doesNotMatch(stored.codeHash, new RegExp(code));

    const result = await auth.verifyLoginOtp({ challengeId: step1.challenge.challengeId, code }, context);
    assert.equal(result.user.id, head.id);
    assert.ok(result.session.id);
    assert.deepEqual(result.user.loginOtp, { required: true, enabled: true });
    await assert.rejects(() => auth.verifyLoginOtp({ challengeId: step1.challenge.challengeId, code }, context), (error) => error.getResponse().code === "LOGIN_OTP_INVALID");
  });

  it("sai mã 5 lần thì lượt hết hiệu lực, kể cả khi sau đó nhập đúng", async () => {
    const staff = await account("RESEARCH_MANAGEMENT_STAFF");
    const { challenge } = await login(staff);
    const code = lastCode(staff.credentialEmail);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 1; left--) {
      await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code: wrong }, context), (error) => error.getResponse().attemptsLeft === left);
    }
    await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code: wrong }, context), (error) => error.getResponse().code === "LOGIN_OTP_INVALID");
    await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code }, context), (error) => error.getResponse().code === "LOGIN_OTP_INVALID");
    assert.equal(await db.session.count({ where: { userId: staff.id } }), 0);
  });

  it("mã hết hạn sau 10 phút; gửi lại phải chờ 60 giây và làm mã cũ mất hiệu lực", async () => {
    const director = await account("LEADERSHIP_APPROVAL_AUTHORITY");
    const { challenge } = await login(director);
    const first = lastCode(director.credentialEmail);
    await assert.rejects(() => auth.resendLoginOtp({ challengeId: challenge.challengeId }, context), (error) => error.getResponse().code === "LOGIN_OTP_RESEND_TOO_SOON");
    await db.loginChallenge.update({ where: { id: challenge.challengeId }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    await auth.resendLoginOtp({ challengeId: challenge.challengeId }, context);
    const second = lastCode(director.credentialEmail);
    if (first !== second) await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code: first }, context), (error) => error.getResponse().code === "LOGIN_OTP_WRONG");
    await db.loginChallenge.update({ where: { id: challenge.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code: second }, context), (error) => error.getResponse().code === "LOGIN_OTP_INVALID");
  });

  it("đổi mật khẩu sau khi gửi mã thì mã không cấp được phiên", async () => {
    const admin = await account("SYSTEM_ADMIN");
    const { challenge } = await login(admin);
    await db.user.update({ where: { id: admin.id }, data: { credentialVersion: { increment: 1 } } });
    await assert.rejects(() => auth.verifyLoginOtp({ challengeId: challenge.challengeId, code: lastCode(admin.credentialEmail) }, context), (error) => error.getResponse().code === "LOGIN_OTP_INVALID");
  });

  it("vai trò bắt buộc chưa có thư thì không đăng nhập được; không gửi được thư thì báo lỗi và không để lại lượt chờ", async () => {
    const noEmail = await account("RESEARCH_BOARD_HEAD", { email: false });
    await assert.rejects(() => login(noEmail), (error) => error.getResponse().code === "LOGIN_OTP_EMAIL_MISSING");
    const deputy = await account("RESEARCH_MANAGEMENT_DEPUTY_HEAD");
    mailFails = true;
    process.env.NODE_ENV = "production";
    try {
      await assert.rejects(() => login(deputy), (error) => error.getResponse().code === "LOGIN_OTP_MAIL_FAILED");
    } finally {
      process.env.NODE_ENV = "test";
    }
    assert.equal(await db.loginChallenge.count({ where: { userId: deputy.id } }), 0);
  });

  it("nhà khoa học: mặc định đăng nhập thẳng, tự bật thì cần mã; vai trò bắt buộc không tắt được", async () => {
    const researcher = await account("RESEARCHER_INTERNAL_USER");
    const direct = await login(researcher);
    assert.ok(direct.session, "chưa bật thì cấp phiên ngay");
    assert.deepEqual(direct.user.loginOtp, { required: false, enabled: false });
    assert.deepEqual((await auth.setLoginOtpEnabled(researcher.id, true, context)).loginOtp, { required: false, enabled: true });
    assert.ok((await login(researcher)).challenge, "đã bật thì phải chờ mã");
    await auth.setLoginOtpEnabled(researcher.id, false, context);

    const head = await account("RESEARCH_MANAGEMENT_HEAD");
    await assert.rejects(() => auth.setLoginOtpEnabled(head.id, false, context), (error) => error.getResponse().code === "LOGIN_OTP_REQUIRED");
    const noEmail = await account("RESEARCHER_INTERNAL_USER", { email: false });
    await assert.rejects(() => auth.setLoginOtpEnabled(noEmail.id, true, context), (error) => error.getResponse().code === "LOGIN_OTP_EMAIL_MISSING");
  });

  it("quản trị khai thư công vụ khi tạo, sửa tài khoản: kiểm tra định dạng, không trùng, ghi nhật ký; sau đó đăng nhập được bằng mã", async () => {
    const admin = await account("SYSTEM_ADMIN");
    const actor = store.toSafeUser(await store.findUserById(admin.id));
    const users = new AdminUsersService(db, new AuditLogService(db), new PasswordService());
    const created = await users.createUser(actor, { username: `otp-new-${++sequence}`, displayName: "Chuyên viên mới", password: "MatKhauMoi12345", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationUnitId: org.id, credentialEmail: "ChuyenVien.Moi@HVQY.test" });
    assert.equal(created.credentialEmail, "chuyenvien.moi@hvqy.test");
    await assert.rejects(() => users.createUser(actor, { username: `otp-dup-${++sequence}`, displayName: "Trùng thư", password: "MatKhauMoi12345", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationUnitId: org.id, credentialEmail: "chuyenvien.moi@hvqy.test" }), /đã được dùng/);

    const noEmail = await account("RESEARCH_BOARD_HEAD", { email: false });
    await assert.rejects(() => users.updateUser(actor, noEmail.id, { credentialEmail: "khong-hop-le" }), /không hợp lệ/);
    await assert.rejects(() => users.updateUser(actor, noEmail.id, { credentialEmail: "chuyenvien.moi@hvqy.test" }), /đã được dùng/);
    const updated = await users.updateUser(actor, noEmail.id, { credentialEmail: "truongban@hvqy.test" });
    assert.equal(updated.credentialEmail, "truongban@hvqy.test");
    assert.equal(await db.auditLog.count({ where: { action: "admin-user-email-change", targetEntityId: noEmail.id } }), 1);
    const { challenge } = await login({ username: noEmail.username });
    assert.ok(challenge, "đã có thư thì đăng nhập được, qua bước nhập mã");
  });

  it("chế độ off tắt bước này cho mọi vai trò; nhật ký ghi lượt gửi mã và đăng nhập bằng mã", async () => {
    assert.equal(loginOtpApplies({ systemRole: "SYSTEM_ADMIN", loginOtpEnabled: false }, "off"), false);
    assert.equal(loginOtpApplies({ systemRole: "RESEARCHER_INTERNAL_USER", loginOtpEnabled: true }, "off"), false);
    assert.equal(loginOtpApplies({ systemRole: "SCIENCE_DEPUTY_DIRECTOR", loginOtpEnabled: false }, "required-roles"), true);
    const actions = (await db.auditLog.findMany({ select: { action: true, result: true, reason: true } })).map((row) => `${row.action}:${row.result}:${row.reason ?? ""}`);
    assert.ok(actions.includes("login-otp-send:success:"));
    assert.ok(actions.includes("login:success:email-otp"));
    assert.ok(actions.some((row) => row.startsWith("login-otp-verify:failure")));
  });
});
