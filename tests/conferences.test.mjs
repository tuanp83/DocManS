import assert from "node:assert/strict";
import test from "node:test";
import { canConference, canCreateConference, canReadConferenceManagement, conferenceActions, conferenceManagementFilter, isConferenceParticipant } from "../dist/apps/api/conferences/conference-access.js";
import { paperStatusAfterSubmit, submissionBlockReason } from "../dist/apps/api/conferences/conference-workflow.js";
import { createConferencePipe, readInvitationInput, readSubmitPaper, sendMailingPipe, updateConferencePipe } from "../dist/apps/api/conferences/conferences.dto.js";
import { renderConferenceMailHtml, renderConferenceMailText } from "../dist/apps/api/conferences/conference-mail-templates.js";

// Hội nghị khoa học (docs/design/hoi-nghi-khoa-hoc.md): phân quyền, quy tắc nộp bài, kiểm tra dữ liệu, mẫu thư.

const actor = (id, systemRole, scopes = ["unit-a"]) => ({ id, username: id, displayName: id, systemRole, unit: "", organizationScopes: scopes.map((scope) => ({ id: scope, code: scope, name: scope })) });
const conference = (overrides = {}) => ({ status: "inviting", hostOrganizationUnitId: "unit-a", createdById: "head", activeOfficerId: "officer", ...overrides });

const head = actor("head", "RESEARCH_MANAGEMENT_HEAD");
const headB = actor("head-b", "RESEARCH_MANAGEMENT_HEAD", ["unit-b"]);
const officer = actor("officer", "RESEARCH_MANAGEMENT_STAFF");
const otherStaff = actor("staff", "RESEARCH_MANAGEMENT_STAFF");
const deputy = actor("deputy", "RESEARCH_MANAGEMENT_DEPUTY_HEAD");
const director = actor("director", "LEADERSHIP_APPROVAL_AUTHORITY", []);
const researcher = actor("researcher", "RESEARCHER_INTERNAL_USER");
const admin = actor("admin", "SYSTEM_ADMIN", []);

test("only the head creates conferences, for a host unit in their own scope", () => {
  assert.equal(canCreateConference(head, "unit-a"), true);
  assert.equal(canCreateConference(head, "unit-b"), false);
  for (const user of [officer, deputy, director, researcher, admin]) assert.equal(canCreateConference(user, "unit-a"), false, user.id);
});

test("the head assigns the officer; only the assigned officer runs invitations and mailings", () => {
  assert.equal(canConference(head, conference({ status: "draft", activeOfficerId: null }), "officer.assign"), true);
  assert.equal(canConference(headB, conference(), "officer.assign"), false);
  assert.equal(canConference(headB, conference({ createdById: "head-b" }), "officer.assign"), true, "người tạo vẫn quản lý");
  assert.equal(canConference(officer, conference(), "officer.assign"), false);
  for (const action of ["invitation.manage", "mailing.send", "paper.review", "close-submission"]) {
    assert.equal(canConference(officer, conference(), action), true, action);
    assert.equal(canConference(otherStaff, conference(), action), false, action);
    assert.equal(canConference(head, conference(), action), false, `Trưởng phòng không làm thay chuyên viên: ${action}`);
  }
  // Tài khoản đổi vai trò thì mất quyền phụ trách dù dòng giao việc còn.
  assert.equal(canConference({ ...officer, systemRole: "RESEARCHER_INTERNAL_USER" }, conference(), "mailing.send"), false);
  assert.equal(canConference(officer, conference({ status: "draft" }), "mailing.send"), false);
  assert.deepEqual(conferenceActions(officer, conference({ status: "completed" })), ["export"]);
  assert.deepEqual(conferenceActions(head, conference({ status: "cancelled" })), ["export"]);
});

test("drafts are visible to the head only; oversight reads later states", () => {
  const draft = conference({ status: "draft", activeOfficerId: null });
  assert.equal(canReadConferenceManagement(head, draft), true);
  for (const user of [deputy, director, otherStaff, researcher, admin]) assert.equal(canReadConferenceManagement(user, draft), false, user.id);
  assert.equal(canReadConferenceManagement(deputy, conference()), true);
  assert.equal(canReadConferenceManagement(actor("deputy-b", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", ["unit-b"]), conference()), false);
  assert.equal(canReadConferenceManagement(director, conference()), true);
  for (const user of [otherStaff, researcher, admin]) assert.equal(canReadConferenceManagement(user, conference()), false, user.id);
  assert.equal(conferenceManagementFilter(researcher), null);
  assert.deepEqual(conferenceManagementFilter(director), { status: { not: "draft" } });
});

test("invitees see the conference only once the invitation was sent to them or accepted", () => {
  for (const status of ["sent", "accepted"]) assert.equal(isConferenceParticipant(researcher, { userId: "researcher", status }), true, status);
  for (const status of ["draft", "declined", "revoked"]) assert.equal(isConferenceParticipant(researcher, { userId: "researcher", status }), false, status);
  assert.equal(isConferenceParticipant(researcher, { userId: "someone-else", status: "accepted" }), false);
});

test("speakers submit before the deadline without abstract approval; afterwards only on an open revision", () => {
  const base = { conferenceStatus: "inviting", paperStatus: "awaiting_abstract", abstractDeadline: new Date("2030-01-10T16:59:59Z"), fullPaperDeadline: new Date("2030-02-10T16:59:59Z"), hasAbstract: false, openRevisions: [] };
  const before = new Date("2030-01-05T00:00:00Z");
  assert.equal(submissionBlockReason({ ...base, kind: "abstract", now: before }), null);
  assert.match(submissionBlockReason({ ...base, kind: "full_paper", now: before }), /tóm tắt trước/);
  // Có tóm tắt là nộp toàn văn được ngay, không chờ chấp nhận.
  assert.equal(submissionBlockReason({ ...base, paperStatus: "abstract_submitted", hasAbstract: true, kind: "full_paper", now: before }), null);
  const late = new Date("2030-01-11T00:00:00Z");
  assert.match(submissionBlockReason({ ...base, kind: "abstract", now: late }), /quá hạn nộp tóm tắt/);
  const revision = [{ kind: "abstract", dueAt: new Date("2030-01-20T16:59:59Z") }];
  assert.equal(submissionBlockReason({ ...base, paperStatus: "abstract_submitted", hasAbstract: true, kind: "abstract", openRevisions: revision, now: late }), null);
  // Yêu cầu sửa còn hạn vẫn cho nộp lại sau khi đã đóng nhận bài; không có yêu cầu thì không.
  assert.equal(submissionBlockReason({ ...base, conferenceStatus: "submission_closed", paperStatus: "abstract_submitted", hasAbstract: true, kind: "abstract", openRevisions: revision, now: late }), null);
  assert.match(submissionBlockReason({ ...base, conferenceStatus: "submission_closed", paperStatus: "abstract_submitted", hasAbstract: true, kind: "full_paper", openRevisions: revision, now: before }), /Đã đóng nhận bài/);
  assert.match(submissionBlockReason({ ...base, paperStatus: "withdrawn", kind: "abstract", now: before }), /đã rút/);
  assert.match(submissionBlockReason({ ...base, conferenceStatus: "preparing", kind: "abstract", now: before }), /không ở giai đoạn nhận bài/);
  assert.equal(paperStatusAfterSubmit("full_paper_submitted", "abstract"), "full_paper_submitted", "nộp lại tóm tắt không kéo lùi trạng thái");
  assert.equal(paperStatusAfterSubmit("awaiting_abstract", "abstract"), "abstract_submitted");
});

test("conference input keeps deadlines in order and invitations need a unit when internal", () => {
  const valid = { title: "Hội nghị KH 2030", hostOrganizationUnitId: "unit-a", location: "Hội trường A", startsAt: "2030-03-01T17:00:00.000Z", endsAt: "2030-03-02T16:59:59.999Z", abstractDeadline: "2030-01-10T16:59:59.999Z", fullPaperDeadline: "2030-02-10T16:59:59.999Z" };
  assert.equal(createConferencePipe.transform(valid).level, "academy");
  assert.throws(() => createConferencePipe.transform({ ...valid, fullPaperDeadline: "2030-01-01T00:00:00.000Z" }), /sau hạn nộp tóm tắt/);
  assert.throws(() => createConferencePipe.transform({ ...valid, fullPaperDeadline: "2030-04-01T00:00:00.000Z" }), /trước khi hội nghị kết thúc/);
  assert.throws(() => updateConferencePipe.transform({ title: "x" }), /phiên bản/);
  assert.throws(() => readInvitationInput({ kind: "speaker", fullName: "A", email: "a@x.vn", isInternal: true }), /Đơn vị trong Học viện/);
  assert.throws(() => readInvitationInput({ kind: "speaker", fullName: "A" }), /Cần email/);
  assert.throws(() => readInvitationInput({ kind: "guest", fullName: "A", email: "a@x.vn" }), /báo cáo viên hoặc đại biểu/);
  assert.equal(readInvitationInput({ kind: "delegate", fullName: "A", email: " A@X.VN " }).email, "a@x.vn");
  assert.deepEqual(readInvitationInput({ kind: "speaker", userId: "u1", fullName: "ignored" }), { kind: "speaker", userId: "u1" });
  assert.throws(() => sendMailingPipe.transform({ kind: "change_notice", invitationIds: ["a"] }), /nội dung thay đổi/);
  assert.deepEqual(sendMailingPipe.transform({ kind: "reminder", invitationIds: ["a", "a", "b"] }).invitationIds, ["a", "b"]);
  const version = new Date().toISOString();
  assert.throws(() => readSubmitPaper({ version, kind: "abstract", title: "T" }), /Nội dung tóm tắt/);
  assert.deepEqual(readSubmitPaper({ version, kind: "abstract", title: "T", abstractText: "S", authors: JSON.stringify([{ fullName: "A", corresponding: "true" }]) }).authors, [{ fullName: "A", organization: undefined, corresponding: true }]);
});

test("invitation mail carries time and location, deadlines for speakers, and escapes HTML", () => {
  const facts = { title: "Hội nghị <KH>", location: "Hội trường A", startsAt: new Date("2030-03-01T17:00:00Z"), endsAt: new Date("2030-03-02T16:59:59Z"), responseDeadline: null, abstractDeadline: new Date("2030-01-10T16:59:59Z"), fullPaperDeadline: new Date("2030-02-10T16:59:59Z"), hostUnitName: "Học viện Quân y" };
  const speaker = renderConferenceMailText({ kind: "invitation", conference: facts, recipient: { fullName: "Nguyễn A", academicTitle: "PGS.TS", kind: "speaker" }, responseUrl: "https://app/conference-invitation?token=abc" });
  assert.match(speaker, /Kính gửi PGS.TS Nguyễn A/);
  assert.match(speaker, /Thời gian: 02\/03\/2030 – 02\/03\/2030|Thời gian: 02\/03\/2030/);
  assert.match(speaker, /Địa điểm: Hội trường A/);
  assert.match(speaker, /Hạn nộp tóm tắt: 10\/01\/2030/);
  assert.match(speaker, /token=abc/);
  const delegate = renderConferenceMailText({ kind: "invitation", conference: facts, recipient: { fullName: "B", academicTitle: null, kind: "delegate" } });
  assert.doesNotMatch(delegate, /Hạn nộp/);
  assert.doesNotMatch(renderConferenceMailHtml({ kind: "invitation", conference: facts, recipient: { fullName: "B", academicTitle: null, kind: "delegate" } }), /<KH>/);
});
