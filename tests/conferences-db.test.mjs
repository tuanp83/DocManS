import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { PasswordService } from "../dist/apps/api/auth/password.service.js";
import { NotificationsService } from "../dist/apps/api/notifications/notifications.service.js";
import { ConferencesService } from "../dist/apps/api/conferences/conferences.service.js";
import { ConferenceInvitationsService } from "../dist/apps/api/conferences/conference-invitations.service.js";
import { ConferencePapersService } from "../dist/apps/api/conferences/conference-papers.service.js";

// Hội nghị khoa học Đợt 1 trên PostgreSQL thật: Trưởng phòng tạo và giao chuyên viên; chuyên viên mời, gửi thư;
// khách mời nhận lời (tạo tài khoản nội bộ theo đơn vị hoặc tài khoản ngoài), nộp tóm tắt và toàn văn trước hạn;
// chuyên viên yêu cầu sửa; đóng nhận bài.

let database;
let db;
let authStore;
let conferences;
let invitations;
let papers;
let orgA;
let orgB;
let head;
let officer;
let otherStaff;
let researcher;
let leader;
let sequence = 0;
const sentMail = [];
const objects = new Map();

const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;
const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();
const ctx = { ip: "203.0.113.7", userAgent: "test" };
const tokenFrom = (html) => decodeURIComponent(/token=([^"&\s<]+)/.exec(html)[1]);
const pdf = (text) => { const buffer = Buffer.from(`%PDF-1.4 ${text}`); return { originalname: "bao-cao.pdf", mimetype: "application/pdf", size: buffer.length, buffer }; };

async function createUser(role, org, email) {
  const name = unique(role.toLowerCase().replace(/_/g, "-"));
  const user = await db.user.create({
    data: {
      username: name, usernameKey: name, displayName: name, passwordHash: "not-used", status: "active", systemRole: role, unit: org?.name ?? "Ngoài", credentialEmail: email ?? null,
      ...(org ? { organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] } } : {})
    }
  });
  return authStore.toSafeUser(await authStore.findUserById(user.id));
}

async function newConference(overrides = {}) {
  const result = await conferences.create(head, {
    title: unique("Hội nghị KH"), description: null, level: "academy", hostOrganizationUnitId: orgA.id, location: "Hội trường A",
    startsAt: new Date(daysFromNow(60)), endsAt: new Date(daysFromNow(61)), responseDeadline: null,
    abstractDeadline: new Date(daysFromNow(20)), fullPaperDeadline: new Date(daysFromNow(40)), ...overrides
  });
  return result.conference;
}

const version = async (actor, id) => (await conferences.detail(actor, id)).conference.version;

describe("Scientific conferences on real PostgreSQL", () => {
  before(async () => {
    process.env.APP_BASE_URL = "https://docmans.test";
    database = await createMigratedDatabase("conferences");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();
    authStore = new AuthStore(db);
    const audit = new AuditLogService(db);
    const notifications = new NotificationsService(db);
    const mail = { sendMail: async (to, subject, html) => { sentMail.push({ to, subject, html }); return { messageId: String(sentMail.length) }; } };
    const storage = {
      putObject: async ({ objectKey, content }) => { objects.set(objectKey, Buffer.from(content)); },
      getObject: async (objectKey) => { if (!objects.has(objectKey)) throw new Error("missing"); return objects.get(objectKey); },
      deleteObject: async (objectKey) => { objects.delete(objectKey); }
    };
    conferences = new ConferencesService(db, audit);
    invitations = new ConferenceInvitationsService(db, audit, new PasswordService(), mail, notifications);
    papers = new ConferencePapersService(db, audit, storage, notifications, { allowedExtensions: [".pdf", ".docx"], maxFileSizeBytes: 1_000_000 });

    orgA = await db.organizationUnit.create({ data: { code: unique("HN-A"), name: "Phòng KHQS" } });
    orgB = await db.organizationUnit.create({ data: { code: unique("HN-B"), name: "Khoa Nội" } });
    head = await createUser("RESEARCH_MANAGEMENT_HEAD", orgA);
    officer = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA, `${unique("officer")}@hvqy.test`);
    otherStaff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA);
    researcher = await createUser("RESEARCHER_INTERNAL_USER", orgB, `${unique("researcher")}@hvqy.test`);
    leader = await createUser("LEADERSHIP_APPROVAL_AUTHORITY", orgB);
  });

  after(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it("runs the whole phase-1 flow: create, assign, invite, accept with account creation, submit, revise, close", async () => {
    await assert.rejects(conferences.create(officer, { title: "x", level: "academy", hostOrganizationUnitId: orgA.id, location: "A", startsAt: new Date(), endsAt: new Date(), abstractDeadline: new Date(), fullPaperDeadline: new Date() }), /Trưởng phòng/);
    const created = await newConference();
    assert.match(created.code, /^HN-\d{4}-\d{3}$/);
    assert.equal(created.status, "draft");
    await assert.rejects(conferences.detail(leader, created.id), /Không tìm thấy/, "lãnh đạo không thấy bản nháp");

    const assigned = (await conferences.assignOfficer(head, created.id, { version: created.version, userId: officer.id })).conference;
    assert.equal(assigned.status, "preparing");
    assert.equal(assigned.officer.id, officer.id);
    await assert.rejects(conferences.detail(otherStaff, created.id), /Không tìm thấy/, "chuyên viên khác không xem được");
    assert.equal((await conferences.detail(leader, created.id)).mode, "management");

    const externalEmail = `${unique("ext")}@benhvien.test`;
    const internalEmail = `${unique("int")}@hvqy.test`;
    const delegateEmail = `${unique("del")}@benhvien.test`;
    await assert.rejects(invitations.addInvitations(head, created.id, [{ kind: "delegate", fullName: "x", email: "x@x.vn" }]), /chuyên viên phụ trách/);
    await assert.rejects(invitations.addInvitations(officer, created.id, [{ kind: "delegate", userId: officer.id }]), /Chuyên viên phụ trách không thể là khách mời/);
    await invitations.addInvitations(officer, created.id, [
      { kind: "speaker", userId: researcher.id },
      { kind: "speaker", fullName: "PGS Ngoài", academicTitle: "PGS.TS", email: externalEmail, isInternal: false, externalOrganization: "Bệnh viện X" },
      { kind: "speaker", fullName: "ThS Nội bộ", email: internalEmail, isInternal: true, organizationUnitId: orgB.id },
      { kind: "delegate", fullName: "Đại biểu", email: delegateEmail, isInternal: false }
    ]);
    await assert.rejects(invitations.addInvitations(officer, created.id, [{ kind: "delegate", fullName: "Lặp", email: externalEmail }]), /đã có trong danh sách/);
    await assert.rejects(conferences.assignOfficer(head, created.id, { version: await version(head, created.id), userId: researcher.id }), /chuyên viên QLKH/);

    let detail = (await conferences.detail(officer, created.id)).conference;
    const byEmail = (email) => detail.invitations.find((item) => item.email === email);
    assert.equal(detail.invitations.length, 4);
    const result = await invitations.sendMailing(officer, created.id, { kind: "invitation", invitationIds: detail.invitations.map((item) => item.id) });
    assert.deepEqual({ recipients: result.recipients, sent: result.sent, failed: result.failed }, { recipients: 4, sent: 4, failed: 0 });
    detail = (await conferences.detail(officer, created.id)).conference;
    assert.equal(detail.status, "inviting", "thư mời đầu tiên mở giai đoạn mời và nhận bài");
    assert.equal(sentMail.filter((mail) => [externalEmail, internalEmail, delegateEmail].includes(mail.to)).length, 3, "người chưa có tài khoản nhận email");
    assert.ok(await db.userNotification.findFirst({ where: { userId: researcher.id, type: "conference" } }), "người có tài khoản nhận thông báo");
    const mailTo = (email) => sentMail.filter((mail) => mail.to === email).at(-1);
    assert.match(mailTo(externalEmail).html, /Hội trường A/);
    assert.match(mailTo(externalEmail).html, /Hạn nộp tóm tắt/);
    assert.doesNotMatch(mailTo(delegateEmail).html, /Hạn nộp tóm tắt/);

    // Đường link công khai: tra cứu, mã sai, nhận lời tạo tài khoản ngoài, dùng lại mã bị từ chối.
    const externalToken = tokenFrom(mailTo(externalEmail).html);
    const lookup = await invitations.publicLookup(externalToken, ctx);
    assert.equal(lookup.invitation.fullName, "PGS Ngoài");
    assert.equal(lookup.conference.location, "Hội trường A");
    await assert.rejects(invitations.publicLookup("x".repeat(43), ctx), /không hợp lệ/);
    const accepted = await invitations.publicRespond({ token: externalToken, decision: "accept" }, ctx);
    assert.equal(accepted.account, "created");
    assert.match(accepted.activationPath, /^\/password-reset\?mode=activation&token=/);
    const externalUser = await db.user.findUnique({ where: { credentialEmail: externalEmail }, include: { organizationScopes: true } });
    assert.equal(externalUser.systemRole, "EXTERNAL_RESEARCHER_USER");
    assert.equal(externalUser.status, "pending_activation");
    assert.equal(externalUser.organizationScopes.length, 0);
    await assert.rejects(invitations.publicRespond({ token: externalToken, decision: "accept" }, ctx), /không hợp lệ|đã được dùng/);

    const internalUser = await (async () => {
      await invitations.publicRespond({ token: tokenFrom(mailTo(internalEmail).html), decision: "accept" }, ctx);
      return db.user.findUnique({ where: { credentialEmail: internalEmail }, include: { organizationScopes: true } });
    })();
    assert.equal(internalUser.systemRole, "RESEARCHER_INTERNAL_USER", "người trong Học viện được tài khoản nội bộ");
    assert.deepEqual(internalUser.organizationScopes.map((scope) => scope.organizationUnitId), [orgB.id]);

    const declined = await invitations.publicRespond({ token: tokenFrom(mailTo(delegateEmail).html), decision: "decline", reason: "Bận công tác" }, ctx);
    assert.equal(declined.account, null);
    assert.equal(await db.user.findUnique({ where: { credentialEmail: delegateEmail } }), null, "từ chối không tạo tài khoản");

    // Người có tài khoản nhận lời trong hệ thống, rồi nộp tóm tắt và toàn văn ngay, không chờ chấp nhận.
    let mine = await papers.myConferences(researcher);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].invitation.canRespond, true);
    assert.equal(mine[0].paper, null);
    await invitations.respondInApp(researcher, mine[0].invitation.id, { decision: "accept" });
    await assert.rejects(invitations.respondInApp(researcher, mine[0].invitation.id, { decision: "decline" }), /đã được trả lời/);
    mine = await papers.myConferences(researcher);
    let paper = mine[0].paper;
    assert.equal(paper.status, "awaiting_abstract");
    assert.equal(paper.viewer.canSubmitFullPaper, false);
    await assert.rejects(papers.submit(researcher, paper.id, { version: paper.version, kind: "full_paper" }, pdf("full")), /tóm tắt trước/);
    await papers.submit(researcher, paper.id, { version: paper.version, kind: "abstract", title: "Báo cáo A", abstractText: "Tóm tắt A", authors: [{ fullName: "Tác giả 1", corresponding: true }] });
    paper = (await papers.myConferences(researcher))[0].paper;
    assert.equal(paper.status, "abstract_submitted");
    await assert.rejects(papers.submit(officer, paper.id, { version: paper.version, kind: "full_paper" }, pdf("x")), /Chỉ báo cáo viên/);
    await papers.submit(researcher, paper.id, { version: paper.version, kind: "full_paper" }, pdf("full v1"));
    paper = (await papers.myConferences(researcher))[0].paper;
    assert.equal(paper.status, "full_paper_submitted");
    assert.ok(await db.userNotification.findFirst({ where: { userId: officer.id, title: { contains: "toàn văn" } } }), "chuyên viên được báo khi có bài nộp");

    // Yêu cầu sửa tóm tắt: không đổi trạng thái; nộp lại giải quyết yêu cầu.
    await assert.rejects(papers.requestRevision(head, paper.id, { version: paper.version, kind: "abstract", reason: "x", dueAt: new Date(daysFromNow(30)) }), /chuyên viên phụ trách/);
    await papers.requestRevision(officer, paper.id, { version: paper.version, kind: "abstract", reason: "Rút gọn còn 300 từ", dueAt: new Date(daysFromNow(30)) });
    paper = (await papers.myConferences(researcher))[0].paper;
    assert.equal(paper.status, "full_paper_submitted");
    assert.equal(paper.openRevisions.length, 1);
    await assert.rejects(papers.requestRevision(officer, paper.id, { version: paper.version, kind: "abstract", reason: "Lặp", dueAt: new Date(daysFromNow(30)) }), /chưa được nộp lại/);

    // Đóng nhận bài: chỉ còn nộp được theo yêu cầu sửa đang mở.
    await conferences.transition(officer, created.id, "close-submission", { version: await version(officer, created.id) });
    paper = (await papers.myConferences(researcher))[0].paper;
    assert.equal(paper.viewer.canSubmitFullPaper, false);
    assert.equal(paper.viewer.canSubmitAbstract, true);
    await assert.rejects(papers.submit(researcher, paper.id, { version: paper.version, kind: "full_paper" }, pdf("late")), /Đã đóng nhận bài/);
    await papers.submit(researcher, paper.id, { version: paper.version, kind: "abstract", title: "Báo cáo A", abstractText: "Tóm tắt rút gọn" });
    paper = (await papers.myConferences(researcher))[0].paper;
    assert.equal(paper.openRevisions.length, 0);
    assert.deepEqual(paper.versions.filter((item) => item.kind === "abstract").map((item) => item.versionNumber), [2, 1], "bản nộp cũ được giữ");

    // Tệp toàn văn: tác giả và chuyên viên tải được; người khác không.
    const fullVersion = paper.versions.find((item) => item.kind === "full_paper");
    assert.equal((await papers.download(researcher, paper.id, fullVersion.id)).content.toString(), "%PDF-1.4 full v1");
    assert.ok(await papers.download(officer, paper.id, fullVersion.id));
    await assert.rejects(papers.download(otherStaff, paper.id, fullVersion.id), /Không tìm thấy/);

    // Xuất Excel tình trạng nộp bài.
    const exported = await conferences.exportXlsx(officer, created.id);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.content);
    assert.equal(workbook.worksheets[0].rowCount, 5);

    // Huỷ lời mời đã nhận lời: báo cáo chuyển sang đã rút, người đó không còn thấy hội nghị.
    detail = (await conferences.detail(officer, created.id)).conference;
    const researcherInvitation = detail.invitations.find((item) => item.hasAccount && item.paper?.id === paper.id);
    await invitations.revokeInvitation(officer, created.id, researcherInvitation.id, "Đổi báo cáo viên");
    assert.equal((await db.conferencePaper.findUnique({ where: { id: paper.id } })).status, "withdrawn");
    assert.equal((await papers.myConferences(researcher)).length, 0);
    await assert.rejects(conferences.detail(researcher, created.id), /Không tìm thấy/);

    // Chưa tới ngày tổ chức thì chưa kết thúc được; huỷ cần lý do.
    await assert.rejects(conferences.transition(officer, created.id, "complete", { version: await version(officer, created.id) }), /sau ngày tổ chức/);
    await assert.rejects(conferences.transition(head, created.id, "cancel", { version: await version(head, created.id) }), /lý do/);
  });

  it("links an invitation to an existing account by email and blocks the officer from being invited by email", async () => {
    const created = await newConference();
    await conferences.assignOfficer(head, created.id, { version: created.version, userId: officer.id });
    await assert.rejects(invitations.addInvitations(officer, created.id, [{ kind: "delegate", fullName: "Chính mình", email: (await db.user.findUnique({ where: { id: officer.id } })).credentialEmail }]), /Chuyên viên phụ trách/);
    const researcherEmail = (await db.user.findUnique({ where: { id: researcher.id } })).credentialEmail;
    await invitations.addInvitations(officer, created.id, [{ kind: "delegate", fullName: "Nhập tay", email: researcherEmail, isInternal: false }]);
    const detail = (await conferences.detail(officer, created.id)).conference;
    assert.equal(detail.invitations[0].hasAccount, true, "email trùng tài khoản thì gắn luôn tài khoản");
    // Đã là khách mời thì không được giao làm chuyên viên phụ trách (chiều ngược lại).
    const staffEmail = `${unique("staff-invited")}@hvqy.test`;
    const invitedStaff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA, staffEmail);
    await invitations.addInvitations(officer, created.id, [{ kind: "delegate", userId: invitedStaff.id }]);
    await assert.rejects(conferences.assignOfficer(head, created.id, { version: await version(head, created.id), userId: invitedStaff.id }), /đang là khách mời/);
  });

  it("imports invitees from Excel all-or-nothing and reports bad rows", async () => {
    const created = await newConference();
    await conferences.assignOfficer(head, created.id, { version: created.version, userId: officer.id });
    const build = async (rows) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Khach_moi");
      sheet.addRow(["Họ tên", "Học hàm, học vị", "Email", "Loại (Báo cáo viên/Đại biểu)", "Mã đơn vị trong Học viện", "Đơn vị ngoài Học viện"]);
      for (const row of rows) sheet.addRow(row);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return { originalname: "khach-moi.xlsx", mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: buffer.length, buffer };
    };
    const bad = await invitations.importInvitations(officer, created.id, await build([
      ["A", "", `${unique("a")}@x.vn`, "Báo cáo viên", orgB.code, ""],
      ["B", "", "khong-phai-email", "Đại biểu", "", "BV"],
      ["C", "", `${unique("c")}@x.vn`, "Khách", "", ""]
    ]));
    assert.deepEqual(bad.errors.map((error) => error.row), [3, 4]);
    assert.equal(await db.conferenceInvitation.count({ where: { conferenceId: created.id } }), 0, "có lỗi thì không thêm dòng nào");
    const good = await invitations.importInvitations(officer, created.id, await build([
      ["A", "TS", `${unique("a")}@x.vn`, "Báo cáo viên", orgB.code, ""],
      ["B", "", `${unique("b")}@x.vn`, "Đại biểu", "", "Bệnh viện Y"]
    ]));
    assert.equal(good.created.length, 2);
    const rows = await db.conferenceInvitation.findMany({ where: { conferenceId: created.id }, orderBy: { fullName: "asc" } });
    assert.deepEqual(rows.map((row) => [row.kind, row.isInternal, row.organizationUnitId]), [["speaker", true, orgB.id], ["delegate", false, null]]);
  });
});
