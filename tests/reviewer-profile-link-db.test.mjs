import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedDatabase } from './helpers/disposable-database.mjs';
import { PrismaService } from '../dist/apps/api/infrastructure/prisma/prisma.service.js';
import { AuditLogService } from '../dist/apps/api/auth/audit-log.service.js';
import { ProposalReviewAssignmentsService } from '../dist/apps/api/proposal-evaluations/proposal-review-assignments.service.js';
import { ProposalParticipationService } from '../dist/apps/api/research-proposals/proposal-participation.service.js';
import { ProposalReviewAccessService } from '../dist/apps/api/proposals-shared/proposal-review-access.service.js';
import { proposalContextVersion } from '../dist/apps/api/proposals-shared/proposal-mutation.js';

// Hồ sơ nhà khoa học có ID khác ID tài khoản (như mọi dữ liệu thật). Trước bản sửa, phân công gán ID tài khoản
// vào researcher_profile_id nên vi phạm khoá ngoại và mọi phân công phản biện đều thất bại.
let database;
let db;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase('reviewer_profile_link');
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

const actorFor = (user, org) => ({ id: user.id, username: user.username, displayName: user.displayName, status: user.status, systemRole: user.systemRole, unit: user.unit, organizationScopes: [{ id: org.id, code: org.code, name: org.name }] });

async function createUser(username, systemRole, org) {
  return db.user.create({ data: { username, usernameKey: username, displayName: username, passwordHash: 'test-only-disabled', status: 'active', systemRole, unit: org.name, organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] } } });
}

test('assigning a reviewer links the reviewer\'s own researcher profile, so the assignment is stored and usable', async () => {
  const org = await db.organizationUnit.create({ data: { code: 'KHOA-NOI', name: 'Khoa Nội' } });
  const staff = await createUser('chuyenvien', 'RESEARCH_MANAGEMENT_STAFF', org);
  const pi = await createUser('chunhiem', 'RESEARCHER_INTERNAL_USER', org);
  const reviewer = await createUser('phanbien', 'RESEARCHER_INTERNAL_USER', org);
  const profile = await db.researcherProfile.create({
    data: { managementOrganizationUnitId: org.id, fullName: 'TS. Phản Biện', fullNameKey: 'ts. phan bien', status: 'ACTIVE', linkedUserId: reviewer.id, createdById: staff.id, updatedById: staff.id }
  });
  assert.notEqual(profile.id, reviewer.id, 'profile and account ids differ, as in real data');

  const intake = await db.proposalIntakePeriod.create({ data: { code: 'DOT-1', title: 'Đợt 1', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), requiredPackage: [] } });
  const submittedAt = new Date(Date.now() - 1000);
  const proposal = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: org.id, title: 'Hồ sơ thử', status: 'submitted', submittedAt } });
  const submission = await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: pi.id, fromStatus: 'draft', toStatus: 'submitted', submittedAt, snapshot: { members: [], attachments: [], requiredPackage: [] } } });
  await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: staff.id, fromStatus: 'submitted', toStatus: 'submitted', snapshot: { kind: 'completeness_check', submissionEventId: submission.id, readiness: { ready: true } } } });

  const participation = new ProposalParticipationService(db);
  const reviewAccess = new ProposalReviewAccessService(db);
  const assignments = new ProposalReviewAssignmentsService(db, new AuditLogService(db), participation, reviewAccess);
  const staffActor = actorFor(staff, org);

  const { profiles } = await assignments.candidates(staffActor, proposal.id);
  const candidate = profiles.find((item) => item.linkedUserId === reviewer.id);
  assert.ok(candidate, 'the reviewer is offered as a candidate through their profile');
  assert.equal(candidate.id, profile.id);

  const contextVersion = proposalContextVersion(await db.researchProposal.findUniqueOrThrow({ where: { id: proposal.id } }));
  const assignment = await assignments.assignReviewer(staffActor, proposal.id, { reviewerUserId: candidate.linkedUserId, assignmentRole: 'reviewer', contextVersion });
  assert.equal(assignment.reviewerUserId, reviewer.id);
  assert.equal(assignment.researcherProfileId, profile.id);
  assert.equal((await db.proposalReviewAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).researcherProfileId, profile.id);

  // Lời mời chưa được đồng ý: hiện trong danh sách của nhà khoa học nhưng chưa mở hồ sơ.
  const reviewerActor = actorFor(reviewer, org);
  assert.equal(assignment.invitationPending, true);
  const [queued] = await assignments.listMyAssignments(reviewerActor);
  assert.equal(queued.id, assignment.id);
  assert.equal(queued.statusLabel, 'Chờ xác nhận');
  await assert.rejects(() => assignments.getReviewPackage(reviewerActor, proposal.id), { status: 403 });

  const accepted = await assignments.respondToInvitation(reviewerActor, proposal.id, assignment.id, { response: 'accept' });
  assert.equal(accepted.invitationPending, false);
  assert.ok(accepted.acceptedAt);
  const reviewPackage = await assignments.getReviewPackage(reviewerActor, proposal.id);
  assert.equal(reviewPackage.assignmentId, assignment.id);
  await assert.rejects(() => assignments.respondToInvitation(reviewerActor, proposal.id, assignment.id, { response: 'decline', reason: 'Bận' }), /đã được trả lời/);
});

test('a reviewer can decline an invitation with a reason; only the invitee may answer, and the slot is freed', async () => {
  const org = await db.organizationUnit.create({ data: { code: 'KHOA-NGOAI', name: 'Khoa Ngoại' } });
  const staff = await createUser('chuyenvien2', 'RESEARCH_MANAGEMENT_STAFF', org);
  const pi = await createUser('chunhiem2', 'RESEARCHER_INTERNAL_USER', org);
  const reviewer = await createUser('phanbien2', 'RESEARCHER_INTERNAL_USER', org);
  const other = await createUser('phanbien3', 'RESEARCHER_INTERNAL_USER', org);
  const intake = await db.proposalIntakePeriod.create({ data: { code: 'DOT-2', title: 'Đợt 2', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), requiredPackage: [] } });
  const submittedAt = new Date(Date.now() - 1000);
  const proposal = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: org.id, title: 'Hồ sơ thử 2', status: 'submitted', submittedAt } });
  const submission = await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: pi.id, fromStatus: 'draft', toStatus: 'submitted', submittedAt, snapshot: { members: [], attachments: [], requiredPackage: [] } } });
  await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: staff.id, fromStatus: 'submitted', toStatus: 'submitted', snapshot: { kind: 'completeness_check', submissionEventId: submission.id, readiness: { ready: true } } } });

  const assignments = new ProposalReviewAssignmentsService(db, new AuditLogService(db), new ProposalParticipationService(db), new ProposalReviewAccessService(db));
  const staffActor = actorFor(staff, org);
  const reviewerActor = actorFor(reviewer, org);
  const assign = async (userId) =>
    assignments.assignReviewer(staffActor, proposal.id, { reviewerUserId: userId, assignmentRole: 'reviewer', contextVersion: proposalContextVersion(await db.researchProposal.findUniqueOrThrow({ where: { id: proposal.id } })) });

  const assignment = await assign(reviewer.id);
  await assert.rejects(() => assignments.respondToInvitation(actorFor(other, org), proposal.id, assignment.id, { response: 'accept' }), { status: 403 });
  await assert.rejects(() => assignments.respondToInvitation(reviewerActor, proposal.id, assignment.id, { response: 'decline', reason: '  ' }), /lý do/);

  const declined = await assignments.respondToInvitation(reviewerActor, proposal.id, assignment.id, { response: 'decline', reason: 'Đang đi công tác' });
  assert.equal(declined.status, 'declined');
  assert.equal(declined.statusLabel, 'Đã từ chối');
  assert.equal(declined.declineReason, 'Đang đi công tác');
  assert.deepEqual(await assignments.listMyAssignments(reviewerActor), []);
  await assert.rejects(() => assignments.getReviewPackage(reviewerActor, proposal.id), { status: 403 });
  assert.ok(await db.auditLog.findFirst({ where: { action: 'decline-review-invitation', targetEntityId: assignment.id } }));

  // Người từ chối không còn chiếm chỗ: chuyên viên mời người khác, và có thể mời lại chính người đó.
  await assign(other.id);
  const again = await assign(reviewer.id);
  assert.equal(again.invitationPending, true);
});

test('any scientist may be invited to review, whatever their unit; only the PI, members and secretary of the proposal are excluded', async () => {
  const host = await db.organizationUnit.create({ data: { code: 'KHOA-MAT', name: 'Khoa Mắt' } });
  const other = await db.organizationUnit.create({ data: { code: 'KHOA-TMH', name: 'Khoa Tai Mũi Họng' } });
  const staff = await createUser('chuyenvien4', 'RESEARCH_MANAGEMENT_STAFF', host);
  const pi = await createUser('chunhiem4', 'RESEARCHER_INTERNAL_USER', host);
  const member = await createUser('thanhvien4', 'RESEARCHER_INTERNAL_USER', host);
  const secretary = await createUser('thuky4', 'RESEARCHER_INTERNAL_USER', host);
  const outsider = await createUser('phanbien4', 'RESEARCHER_INTERNAL_USER', other);
  for (const [user, unit] of [[pi, host], [member, host], [secretary, host], [outsider, other]]) {
    await db.researcherProfile.create({ data: { managementOrganizationUnitId: unit.id, fullName: `NKH ${user.username}`, fullNameKey: `nkh ${user.username}`, status: 'ACTIVE', linkedUserId: user.id, createdById: staff.id, updatedById: staff.id } });
  }
  const intake = await db.proposalIntakePeriod.create({ data: { code: 'DOT-4', title: 'Đợt 4', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), requiredPackage: [] } });
  const submittedAt = new Date(Date.now() - 1000);
  const proposal = await db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: host.id, title: 'Hồ sơ thử 4', status: 'submitted', submittedAt } });
  await db.proposalMember.create({ data: { proposalId: proposal.id, userId: member.id, name: member.displayName, role: 'TOPIC_MEMBER', participationRole: 'TOPIC_MEMBER', organization: host.name } });
  await db.proposalMember.create({ data: { proposalId: proposal.id, userId: secretary.id, name: secretary.displayName, role: 'TOPIC_SECRETARY', participationRole: 'TOPIC_SECRETARY', organization: host.name } });
  const submission = await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: pi.id, fromStatus: 'draft', toStatus: 'submitted', submittedAt, snapshot: { members: [], attachments: [], requiredPackage: [] } } });
  await db.proposalSubmissionEvent.create({ data: { proposalId: proposal.id, actorId: staff.id, fromStatus: 'submitted', toStatus: 'submitted', snapshot: { kind: 'completeness_check', submissionEventId: submission.id, readiness: { ready: true } } } });

  const assignments = new ProposalReviewAssignmentsService(db, new AuditLogService(db), new ProposalParticipationService(db), new ProposalReviewAccessService(db));
  const staffActor = actorFor(staff, host);
  const offered = (await assignments.candidates(staffActor, proposal.id)).profiles.map((item) => item.linkedUserId);
  assert.ok(offered.includes(outsider.id), 'a scientist of another unit is offered');
  for (const excluded of [pi.id, member.id, secretary.id]) assert.ok(!offered.includes(excluded), 'proposal participants are never offered');

  const contextVersion = proposalContextVersion(await db.researchProposal.findUniqueOrThrow({ where: { id: proposal.id } }));
  const invitation = await assignments.assignReviewer(staffActor, proposal.id, { reviewerUserId: outsider.id, assignmentRole: 'reviewer', contextVersion });
  const outsiderActor = actorFor(outsider, other);
  assert.deepEqual((await assignments.listMyAssignments(outsiderActor)).map((item) => item.id), [invitation.id]);
  await assignments.respondToInvitation(outsiderActor, proposal.id, invitation.id, { response: 'accept' });
  assert.equal((await assignments.getReviewPackage(outsiderActor, proposal.id)).assignmentId, invitation.id);
});
