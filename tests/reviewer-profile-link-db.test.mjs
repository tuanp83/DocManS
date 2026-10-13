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

  const reviewPackage = await assignments.getReviewPackage(actorFor(reviewer, org), proposal.id);
  assert.equal(reviewPackage.assignmentId, assignment.id);
});
