import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedDatabase } from './helpers/disposable-database.mjs';
import { PrismaService } from '../dist/apps/api/infrastructure/prisma/prisma.service.js';
import { ApprovalRoutingService } from '../dist/apps/api/approvals/approval-routing.service.js';
import { assertReadyForLeadership, boardReviewEvent, closeApprovalSubmission, openApprovalSubmission } from '../dist/apps/api/proposals-shared/approval-routing.js';

// Luồng trình duyệt qua Phòng KHQS trên PostgreSQL thật:
// chuyên viên → Trưởng ban QLKH → Trưởng phòng KHQS → Ban giám đốc; trả lại luôn về chuyên viên; không bỏ bước.
let database;
let db;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase('approval_routing');
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

async function setup(code) {
  const org = await db.organizationUnit.create({ data: { code, name: `Phòng ${code}` } });
  const make = async (username, systemRole) => {
    const user = await db.user.create({ data: { username: `${username}-${code}`, usernameKey: `${username}-${code}`.toLowerCase(), displayName: username, passwordHash: 'x', status: 'active', systemRole, unit: org.name, organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] } } });
    return { id: user.id, username: user.username, displayName: username, systemRole, unit: org.name, organizationScopes: [{ id: org.id, code: org.code, name: org.name }] };
  };
  const people = {
    staff: await make('chuyenvien', 'RESEARCH_MANAGEMENT_STAFF'),
    board: await make('truongban', 'RESEARCH_BOARD_HEAD'),
    deputy: await make('phophong', 'RESEARCH_MANAGEMENT_DEPUTY_HEAD'),
    head: await make('truongphong', 'RESEARCH_MANAGEMENT_HEAD'),
    director: await make('giamdoc', 'LEADERSHIP_APPROVAL_AUTHORITY'),
    science: await make('pgdkh', 'SCIENCE_DEPUTY_DIRECTOR'),
    pi: await make('chunhiem', 'RESEARCHER_INTERNAL_USER')
  };
  const intake = await db.proposalIntakePeriod.create({ data: { code: `DOT-${code}`, title: 'Đợt', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), requiredPackage: [] } });
  const proposal = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: people.pi.id, hostOrganizationUnitId: org.id, title: `Đề tài ${code}`, status: 'submitted', submittedAt: new Date(), councilMetadata: { status: 'submitted', members: [] } } });
  return { org, people, proposal, routing: new ApprovalRoutingService(db) };
}

test('a council submission walks Board Head → Head → leadership; no skipped steps, right people only', async () => {
  const { people, proposal, routing } = await setup('A');
  const key = { kind: 'EVALUATION_COUNCIL', subjectType: 'proposal', subjectId: proposal.id };
  const submission = await openApprovalSubmission(db, people.staff, key, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });

  // Ban giám đốc chưa ký được; Trưởng phòng không được làm thay bước của Trưởng ban.
  await assert.rejects(() => assertReadyForLeadership(db, people.director, key), /Chờ Trưởng ban QLKH/);
  await assert.rejects(() => routing.advance(people.head, submission.id, {}), { status: 403 });
  await assert.rejects(() => routing.advance(people.deputy, submission.id, {}), { status: 403 });
  assert.deepEqual((await routing.inbox(people.board)).submissions.map((item) => item.id), [submission.id]);
  assert.deepEqual((await routing.inbox(people.head)).submissions, []);

  await routing.advance(people.board, submission.id, { note: 'Đủ thành phần' });
  assert.deepEqual((await routing.inbox(people.head)).submissions.map((item) => item.id), [submission.id]);
  await assert.rejects(() => routing.advance(people.board, submission.id, {}), { status: 403 });
  await routing.advance(people.head, submission.id, { note: 'Trình Ban giám đốc' });

  // Hội đồng: Phó GĐ phụ trách Khoa học ký được.
  assert.deepEqual((await routing.inbox(people.science)).submissions.map((item) => item.id), [submission.id]);
  assert.ok(await assertReadyForLeadership(db, people.science, key));
  await closeApprovalSubmission(db, people.science, key, 'APPROVED');
  const closed = await db.approvalSubmission.findUnique({ where: { id: submission.id }, include: { steps: { orderBy: { createdAt: 'asc' } } } });
  assert.equal(closed.status, 'APPROVED');
  assert.deepEqual(closed.steps.map((step) => step.action), ['SUBMIT', 'FORWARD', 'APPROVE', 'APPROVE']);
  assert.equal((await routing.inbox(people.staff)).submissions[0].statusLabel, 'Đã phê duyệt');
});

test('returning sends the submission back to the staff member and reopens the procedure; signer rules hold', async () => {
  const { people, proposal, routing } = await setup('B');
  const councilKey = { kind: 'EVALUATION_COUNCIL', subjectType: 'proposal', subjectId: proposal.id };
  const council = await openApprovalSubmission(db, people.staff, councilKey, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
  await routing.advance(people.board, council.id, {});
  await assert.rejects(() => routing.returnToStaff(people.head, council.id, { note: ' ' }), /lý do/);
  await routing.returnToStaff(people.head, council.id, { note: 'Bổ sung ngày họp' });
  const after = await db.researchProposal.findUnique({ where: { id: proposal.id } });
  assert.equal(after.councilMetadata.status, 'returned');
  assert.equal(after.councilMetadata.returnReason, 'Bổ sung ngày họp');
  // Tờ trình đã trả lại: Ban giám đốc không ký được cho tới khi chuyên viên trình lại.
  await assert.rejects(() => assertReadyForLeadership(db, people.director, councilKey), /Chưa có tờ trình đang chờ/);
  assert.ok(await db.auditLog.findFirst({ where: { action: 'return-approval-submission', targetEntityId: council.id } }));

  // Gói phê duyệt đề tài và kinh phí: chỉ Giám đốc ký; trả lại thì hồ sơ về "đang đánh giá".
  await db.researchProposal.update({ where: { id: proposal.id }, data: { status: 'ready_for_approval' } });
  const packageKey = { kind: 'DECISION_PACKAGE', subjectType: 'proposal', subjectId: proposal.id };
  const pkg = await openApprovalSubmission(db, people.staff, packageKey, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
  await routing.advance(people.board, pkg.id, {});
  await routing.advance(people.head, pkg.id, {});
  await assert.rejects(() => assertReadyForLeadership(db, people.science, packageKey), /Giám đốc Học viện ký/);
  assert.deepEqual((await routing.inbox(people.science)).submissions, []);
  assert.ok(await assertReadyForLeadership(db, people.director, packageKey));

  const pkg2 = await openApprovalSubmission(db, people.staff, packageKey, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
  assert.equal((await db.approvalSubmission.findUnique({ where: { id: pkg.id } })).status, 'CANCELLED', 'trình lại thay tờ trình cũ');
  await routing.returnToStaff(people.board, pkg2.id, { note: 'Thiếu biên bản' });
  assert.equal((await db.researchProposal.findUnique({ where: { id: proposal.id } })).status, 'under_review');
});

test('a submission outside the reviewer\'s unit scope or submitted by themselves cannot be handled by them', async () => {
  const a = await setup('C');
  const b = await setup('D');
  const submission = await openApprovalSubmission(db, a.people.staff, { kind: 'LIQUIDATION', subjectType: 'project', subjectId: 'project-x' }, { title: 'Đề tài C', hostOrganizationUnitId: a.org.id });
  await assert.rejects(() => b.routing.advance(b.people.board, submission.id, {}), /ngoài phạm vi/);
  assert.deepEqual((await b.routing.inbox(b.people.board)).submissions, []);
  // Trưởng ban tự lập thì tờ trình đi thẳng Trưởng phòng: Trưởng ban không xử lý tiếp tờ trình của chính mình.
  const own = await openApprovalSubmission(db, a.people.board, { kind: 'LIQUIDATION', subjectType: 'project', subjectId: 'project-y' }, { title: 'Đề tài C2', hostOrganizationUnitId: a.org.id });
  await assert.rejects(() => a.routing.advance(a.people.board, own.id, {}), { status: 403 });
});

test('a council set up by the Board Head goes straight to the Head, who approves and submits it to leadership', async () => {
  const { people, proposal, routing } = await setup('E');
  const key = { kind: 'EVALUATION_COUNCIL', subjectType: 'proposal', subjectId: proposal.id };
  const submission = await openApprovalSubmission(db, people.board, key, { title: proposal.title, hostOrganizationUnitId: proposal.hostOrganizationUnitId });
  assert.equal(submission.stage, 'HEAD_REVIEW');

  const event = await boardReviewEvent(db, submission);
  assert.deepEqual(event.userIds, [people.head.id], 'thông báo Trưởng phòng, không phải Trưởng ban');
  assert.match(event.title, /Trưởng ban QLKH đã trình/);

  await assert.rejects(() => assertReadyForLeadership(db, people.director, key), /Chờ Trưởng phòng KHQS/);
  assert.deepEqual((await routing.inbox(people.board)).submissions, [], 'không chờ Trưởng ban rà soát');
  assert.deepEqual((await routing.inbox(people.head)).submissions.map((item) => item.id), [submission.id]);
  await routing.advance(people.head, submission.id, { note: 'Trình Ban giám đốc' });

  assert.ok(await assertReadyForLeadership(db, people.director, key));
  await closeApprovalSubmission(db, people.director, key, 'APPROVED');
  const closed = await db.approvalSubmission.findUnique({ where: { id: submission.id }, include: { steps: { orderBy: { createdAt: 'asc' } } } });
  assert.deepEqual(closed.steps.map((step) => [step.stage, step.action]), [['HEAD_REVIEW', 'SUBMIT'], ['HEAD_REVIEW', 'APPROVE'], ['LEADERSHIP', 'APPROVE']]);
});
