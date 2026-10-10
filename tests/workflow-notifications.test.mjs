import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotificationsService } from "../dist/apps/api/notifications/notifications.service.js";
import { DeadlineReminderService } from "../dist/apps/api/notifications/deadline-reminder.service.js";
import { collectProjectReminders, collectProposalSupplementReminders, collectSuperiorReminders, upcomingBucket } from "../dist/apps/api/notifications/deadline-reminders.js";
import { absoluteLink, recipientsOf, renderNotificationEmail } from "../dist/apps/api/notifications/workflow-events.js";
import { createClosureDb, seedExecutingProject } from "./helpers/project-closure-prisma.mjs";

// Thứ Bảy 10/10/2026, 09:00 giờ Việt Nam.
const NOW = new Date("2026-10-10T02:00:00.000Z");
const day = (offset) => new Date(Date.UTC(2026, 9, 10 + offset));

describe("Phát thông báo", () => {
  it("bỏ trùng người nhận, bỏ người thực hiện, bỏ giá trị rỗng", () => {
    assert.deepEqual(recipientsOf({ userIds: ["a", "b", "a", null, "", "actor"], excludeUserIds: ["actor"] }), ["a", "b"]);
  });

  it("email: thoát HTML trong tiêu đề/nội dung; chỉ liên kết nội bộ, tuyệt đối theo APP_BASE_URL", () => {
    const html = renderNotificationEmail({ title: "<script>x</script>", message: "Tên \"đề tài\" & <b>", link: "/projects/1" }, { APP_BASE_URL: "https://nckh.hvqy.edu.vn/app" });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&quot;đề tài&quot; &amp; &lt;b&gt;"));
    assert.ok(html.includes('href="https://nckh.hvqy.edu.vn/app/projects/1"'), "giữ đường dẫn con của APP_BASE_URL");
    assert.equal(absoluteLink("https://evil.example/x", { APP_BASE_URL: "https://nckh.hvqy.edu.vn" }), "");
    assert.equal(absoluteLink("//evil.example/x", { APP_BASE_URL: "https://nckh.hvqy.edu.vn" }), "");
    assert.equal(absoluteLink("/projects/1", {}), "");
    assert.equal(absoluteLink("/projects/1", { ACCOUNT_LOGIN_URL: "https://nckh.hvqy.edu.vn/login" }), "https://nckh.hvqy.edu.vn/projects/1");
    assert.equal(absoluteLink("/projects/1", { ACCOUNT_LOGIN_URL: "https://host.vn/docmans/login" }), "https://host.vn/docmans/projects/1");
    assert.equal(absoluteLink("/projects/1", { APP_BASE_URL: "https://host.vn/docmans/" }), "https://host.vn/docmans/projects/1");
  });

  it("chỉ gửi cho tài khoản đang hoạt động; dedupKey chặn gửi lại; email gửi nền và lỗi email không ném ra", async () => {
    const db = seedExecutingProject(createClosureDb());
    db.tables.users.find((user) => user.id === "member").status = "inactive";
    const sent = [];
    const mail = { sendMail: async (to, subject, html) => { sent.push({ to, subject, html }); if (to.startsWith("officer")) throw new Error("SMTP down"); } };
    const service = new NotificationsService(db, mail);
    const event = { type: "REPORT_DUE", userIds: ["pi", "member", "officer"], title: "Sắp đến hạn", message: "Kỳ báo cáo", link: "/projects/project-1", dedupKey: "report-due:c1:d7" };
    assert.equal(await service.dispatch([event]), 2);
    assert.equal(await service.dispatch([event]), 0, "chạy lại không tạo trùng");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent.map((item) => item.to).sort(), ["officer@example.test", "pi@example.test"]);
    assert.deepEqual(db.tables.notifications.map((row) => row.userId).sort(), ["officer", "pi"]);
    assert.ok(db.tables.notifications.every((row) => row.dedupKey === "report-due:c1:d7"));
  });

  it("lỗi ghi CSDL khi phát thông báo không làm hỏng thao tác gọi tới", async () => {
    const db = seedExecutingProject(createClosureDb());
    db.userNotification.create = async () => { throw new Error("db down"); };
    const service = new NotificationsService(db);
    assert.equal(await service.dispatch([{ type: "X", userIds: ["pi"], title: "t", message: "m" }]), 0);
  });
});

describe("Nhắc hạn báo cáo", () => {
  const project = (overrides = {}) => ({
    id: "p1", code: "DT-01", title: "Đề tài", status: "executing", endDate: day(90), piUserId: "pi", officerUserId: "officer",
    checkpoints: [], reports: [], requests: [], ...overrides
  });

  it("nấc nhắc: ≤7, ≤3, ≤1 ngày (kể cả hôm nay); quá hạn không thuộc nấc trước hạn", () => {
    assert.deepEqual([8, 7, 4, 3, 2, 1, 0, -1].map(upcomingBucket), [null, "d7", "d7", "d3", "d3", "d1", "d1", null]);
  });

  it("kỳ báo cáo sắp đến hạn chưa nộp → nhắc chủ nhiệm; đã nộp → không nhắc", () => {
    const open = { id: "c1", title: "Báo cáo quý", dueDate: day(3), status: "open" };
    const events = collectProjectReminders(project({ checkpoints: [open] }), NOW);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "REPORT_DUE");
    assert.deepEqual(events[0].userIds, ["pi"]);
    assert.equal(events[0].dedupKey, "report-due:c1:d3");
    assert.match(events[0].message, /13\/10\/2026/);
    const submitted = collectProjectReminders(project({ checkpoints: [open], reports: [{ id: "r1", checkpointId: "c1", status: "submitted", revision: 1, responseDeadline: null }] }), NOW);
    assert.equal(submitted.length, 0);
    const draftOnly = collectProjectReminders(project({ checkpoints: [open], reports: [{ id: "r1", checkpointId: "c1", status: "draft", revision: 1, responseDeadline: null }] }), NOW);
    assert.equal(draftOnly.length, 1, "bản nháp chưa nộp vẫn được nhắc");
  });

  it("quá hạn: nhắc cả chủ nhiệm và chuyên viên, mỗi tuần một lần", () => {
    const overdue = (offset) => collectProjectReminders(project({ checkpoints: [{ id: "c1", title: "Báo cáo quý", dueDate: day(offset), status: "open" }] }), NOW)[0];
    assert.equal(overdue(-1).type, "REPORT_OVERDUE");
    assert.deepEqual(overdue(-1).userIds, ["pi", "officer"]);
    assert.equal(overdue(-1).dedupKey, "report-overdue:c1:w0");
    assert.equal(overdue(-6).dedupKey, "report-overdue:c1:w0");
    assert.equal(overdue(-7).dedupKey, "report-overdue:c1:w1");
  });

  it("hạn bổ sung báo cáo / yêu cầu, sắp hết thời gian thực hiện; đề tài không còn thực hiện thì không nhắc", () => {
    const events = collectProjectReminders(project({
      endDate: day(20),
      reports: [{ id: "r1", checkpointId: null, status: "supplement_requested", revision: 2, responseDeadline: day(1) }],
      requests: [{ id: "q1", requestType: "extension", status: "supplement_requested", responseDeadline: day(6) }]
    }), NOW);
    assert.deepEqual(events.map((event) => event.dedupKey), ["report-supplement-due:r1:d1", "request-supplement-due:q1:d7", "project-end:p1:2026-10-30:d30"]);
    assert.equal(collectProjectReminders(project({ status: "accepted", checkpoints: [{ id: "c1", title: "x", dueDate: day(1), status: "open" }] }), NOW).length, 0);
  });

  it("hạn bổ sung hồ sơ đề xuất", () => {
    const request = { id: "s1", proposalId: "pr1", dueDate: new Date("2026-10-12T10:00:00.000Z"), proposal: { code: "HS-1", title: "Hồ sơ", ownerId: "pi", status: "supplement_requested" } };
    const [event] = collectProposalSupplementReminders(request, NOW);
    assert.equal(event.dedupKey, "proposal-supplement-due:s1:d3");
    assert.deepEqual(event.userIds, ["pi"]);
    assert.equal(collectProposalSupplementReminders({ ...request, proposal: { ...request.proposal, status: "resubmitted" } }, NOW).length, 0);
  });

  it("tác vụ hằng ngày: chạy hai lần trong ngày chỉ tạo thông báo một lần", async () => {
    const db = seedExecutingProject(createClosureDb());
    db.tables.checkpoints.push({ id: "c1", projectId: "project-1", title: "Báo cáo quý", dueDate: day(2), status: "open" });
    const original = db.approvedProject.findMany;
    db.approvedProject.findMany = async (args) => {
      const rows = await original({ where: args.where, include: true });
      return rows.map((row) => ({ ...row, members: row.members.filter((member) => member.participationRole === "TOPIC_PI"), checkpoints: row.checkpoints.filter((item) => item.status === "open") }));
    };
    const service = new DeadlineReminderService(db, new NotificationsService(db));
    assert.equal(await service.run(NOW), 1);
    assert.equal(await service.run(NOW), 0);
    assert.equal(db.tables.notifications[0].userId, "pi");
    assert.equal(db.tables.notifications[0].type, "REPORT_DUE");
  });
});

describe("Nhắc hạn 30 ngày đề nghị cấp trên nghiệm thu", () => {
  const item = (offset, status = "PREPARING") => ({ projectId: "p1", code: "DT-B1", title: "Đề tài cấp Bộ", level: "ministry-level", facilityAcceptedOn: day(offset - 30), dueDate: day(offset), status, officerUserId: "officer", leadershipUserIds: ["leader"] });

  it("nhắc chuyên viên khi còn ≤10, ≤3, ≤1 ngày; quá hạn báo cả lãnh đạo mỗi tuần; đã gửi thì thôi", () => {
    assert.equal(collectSuperiorReminders(item(11), NOW).length, 0);
    const d10 = collectSuperiorReminders(item(10), NOW)[0];
    assert.equal(d10.dedupKey, "superior-due:p1:2026-10-20:d10");
    assert.deepEqual(d10.userIds, ["officer"]);
    assert.equal(collectSuperiorReminders(item(3), NOW)[0].dedupKey, "superior-due:p1:2026-10-13:d3");
    assert.equal(collectSuperiorReminders(item(0), NOW)[0].dedupKey, "superior-due:p1:2026-10-10:d1");
    const overdue = collectSuperiorReminders(item(-8), NOW)[0];
    assert.equal(overdue.type, "SUPERIOR_REQUEST_OVERDUE");
    assert.deepEqual(overdue.userIds, ["officer", "leader"]);
    assert.equal(overdue.dedupKey, "superior-overdue:p1:w1");
    assert.equal(collectSuperiorReminders(item(-8, "SENT"), NOW).length, 0);
  });

  it("tác vụ hằng ngày đọc các đề tài đang chờ cấp trên", async () => {
    const db = seedExecutingProject(createClosureDb(), { level: "ministry-level" });
    db.tables.superiors.push({ projectId: "project-1", level: "ministry-level", acceptanceId: "a1", facilityAcceptedOn: day(-32), dueDate: day(-2), status: "PREPARING", checklist: [] });
    const original = db.approvedProject.findMany;
    db.approvedProject.findMany = async () => [];
    const service = new DeadlineReminderService(db, new NotificationsService(db));
    assert.equal(await service.run(NOW), 2);
    assert.deepEqual(db.tables.notifications.map((row) => row.userId).sort(), ["leader", "officer"]);
    assert.equal(await service.run(NOW), 0);
    db.approvedProject.findMany = original;
  });
});
