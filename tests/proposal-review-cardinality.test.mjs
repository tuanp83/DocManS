import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalReviewAssignmentsService } from '../dist/apps/api/proposal-evaluations/proposal-review-assignments.service.js';
import { ProposalEvaluationSummaryService } from '../dist/apps/api/proposal-evaluations/proposal-evaluation-summary.service.js';
import { proposalContextVersion } from '../dist/apps/api/proposals-shared/proposal-mutation.js';

const actor = { id: 'staff', role: 'scientific-management', systemRole: 'RESEARCH_MANAGEMENT_STAFF', organizationScopes: [{ id: 'unit' }] };
const submittedAt = new Date('2026-10-01T00:00:00.000Z');
const proposal = { id: 'proposal', status: 'under_review', hostOrganizationUnitId: 'unit', submittedAt, updatedAt: new Date(), authorizationRelationshipVersion: 1, authorizationConflictVersion: 1, authorizationDelegationVersion: 1 };
// Lần nộp hiện tại và kết quả kiểm tra đầy đủ của nó (submission-evidence.ts).
const submissionEvents = [
  { id: 'sub', proposalId: 'proposal', toStatus: 'submitted', submittedAt, snapshot: { members: [], attachments: [], requiredPackage: [] } },
  { id: 'check', proposalId: 'proposal', toStatus: 'submitted', submittedAt: new Date('2026-10-02T00:00:00.000Z'), snapshot: { kind: 'completeness_check', submissionEventId: 'sub', readiness: { ready: true } } }
];
const participation = { evaluateConflict: async () => ({ conflicted: false }) };
const access = { resolveForProposal: async () => ({ isAssignedReviewer: false }), resolveConflictForProposal: async () => ({ isAssignedReviewer: false, hasPersistedReview: false, hasScoringAssignment: false, unresolved: false }) };
// Hội đồng: 2–3 phản biện, 3–5 thành viên, đúng 1 thư ký (thư ký không chấm phiếu).
function roster(reviewers, council, secretaries = 1) {
  return Array.from({ length: reviewers + council + secretaries }, (_, i) => ({ id: String(i), reviewerUserId: String(i), reviewedSubmissionEventId: 'sub', assignmentRole: i < reviewers ? 'reviewer' : i < reviewers + council ? 'committee_member' : 'committee_secretary', status: i < reviewers + council ? 'completed' : 'assigned' }));
}
const submitted = assignments => assignments.filter(a => a.assignmentRole !== 'committee_secretary').map(a => ({ id: `review-${a.id}`, assignmentId: a.id, submissionEventId: 'sub', status: 'submitted', totalScore: 80 }));

test('readiness requires 2–3 reviewers, 3–5 distinct council members, exactly one secretary and every scoring review', () => {
  const service = new ProposalEvaluationSummaryService();
  for (const [r, c, s, ready] of [[0, 0, 1, false], [1, 3, 1, false], [2, 0, 1, false], [2, 2, 1, false], [4, 3, 1, false], [2, 6, 1, false], [2, 3, 0, false], [2, 3, 2, false], [2, 3, 1, true], [3, 3, 1, true], [2, 4, 1, true], [3, 5, 1, true]]) {
    const assignments = roster(r, c, s);
    assert.equal(service.summarizeProgress(assignments, submitted(assignments)).allReviewsSubmitted, ready, `${r} reviewers, ${c} council, ${s} secretary`);
  }
  // Thư ký không có phiếu nhưng không làm hồ sơ "chờ phiếu".
  const withSecretary = roster(2, 3, 1);
  assert.equal(service.summarizeProgress(withSecretary, submitted(withSecretary)).pendingCount, 0);
  const assignments = roster(2, 3);
  assert.equal(service.summarizeProgress(assignments, submitted(assignments).slice(1)).allReviewsSubmitted, false);
  for (const index of [0, 4]) {
    const revoked = assignments.map((a, i) => i === index ? { ...a, status: 'revoked' } : a);
    assert.equal(service.summarizeProgress(revoked, submitted(assignments)).allReviewsSubmitted, false);
    const replacement = [...revoked, { ...assignments[index], id: 'replacement', reviewerUserId: 'replacement' }];
    assert.equal(service.summarizeProgress(replacement, submitted(replacement)).allReviewsSubmitted, true);
  }
  const duplicate = assignments.map((a, i) => i === 4 ? { ...a, reviewerUserId: assignments[3].reviewerUserId } : a);
  assert.equal(service.summarizeProgress(duplicate, submitted(duplicate)).allReviewsSubmitted, false);
});

test('fourth reviewer is rejected inside the locked proposal mutation before any write', async () => {
  let locked = false;
  const tx = {
    $queryRaw: async strings => { if (strings.join('').includes('research_proposals')) locked = true; return [{ asOf: new Date() }]; },
    researchProposal: { findUnique: async () => proposal, updateMany: async () => ({ count: 1 }), update: async () => {} },
    user: { 
      findUnique: async ({ where }) => where.id === actor.id
        ? { ...actor, status: 'active', organizationScopes: [{ organizationUnit: { id: 'unit', status: 'active' } }] }
        : { id: 'third', status: 'active', researcherProfile: null },
      findFirst: async ({ where }) => ({ id: where.id, status: 'active' })
    },
    proposalReviewAssignment: { count: async ({ where }) => {
      assert.equal(locked, true);
      assert.equal(where.proposalId, proposal.id);
      assert.equal(where.assignmentRole, 'reviewer');
      // Giới hạn tính trong vòng của lần nộp hiện tại.
      assert.equal(where.reviewedSubmissionEventId, 'sub');
      assert.deepEqual(where.status.in, ['assigned', 'completed']);
      return 3;
    }, findFirst: async () => null, updateMany: async () => ({ count: 1 }), create: async () => ({ id: 'new', createdAt: new Date(), updatedAt: new Date() }) },
    auditLog: { create: async () => {} },
    proposalSubmissionEvent: { findMany: async () => submissionEvents },
    // The production conflict resolver uses these reads before the cardinality check.
    proposalMember: { findMany: async () => [] },
    proposalParticipation: { findMany: async () => [] }
  };
  const service = new ProposalReviewAssignmentsService({ $transaction: async work => work(tx) }, {}, participation, access);
  await assert.rejects(() => service.assignReviewer(actor, proposal.id, { reviewerUserId: 'third', contextVersion: proposalContextVersion(proposal) }), /tối đa 3 người phản biện/);
});

test('submitting the package rechecks the round inside the locked mutation and rejects a concurrent revocation before writes', async () => {
  const assignments = roster(2, 3);
  const reviews = submitted(assignments);
  let locked = false;
  const writes = [];
  // Bản tổng hợp đã chốt với đủ 6 phân công và 5 phiếu; sau đó một phân công bị thu hồi đồng thời.
  const summary = { id: 'summary', proposalId: 'proposal', status: 'finalized', revision: 2, createdAt: new Date(), updatedAt: new Date(), evidenceSnapshot: { lifecycle: 'finalized', submissionEventId: 'sub', assignmentIds: assignments.map((a) => a.id), reviewIds: reviews.map((r) => r.id) } };
  const tx = {
    $queryRaw: async () => { locked = true; return [{ asOf: new Date() }]; },
    researchProposal: { findUnique: async () => proposal, updateMany: async () => { writes.push('status'); return { count: 1 }; }, update: async () => {} },
    user: { findUnique: async () => ({ ...actor, status: 'active', organizationScopes: [{ organizationUnit: { id: 'unit', status: 'active' } }] }) },
    proposalReviewAssignment: { findMany: async () => { assert.equal(locked, true); return assignments.map((a, i) => i === 0 ? { ...a, status: 'revoked' } : a); }, updateMany: async () => { writes.push('assignments'); return { count: 1 }; } },
    proposalReview: { findMany: async () => reviews },
    proposalEvaluationSummary: { findFirst: async () => summary, update: async () => { writes.push('summary'); return summary; } },
    proposalSubmissionEvent: { findMany: async () => submissionEvents, create: async () => { writes.push('event'); } },
    auditLog: { create: async () => { writes.push('audit'); } },
    // Đọc quan hệ tham gia và phân công thật trong giao dịch (kiểm tra xung đột lợi ích).
    proposalMember: { findMany: async () => [] },
    proposalParticipation: { findMany: async () => [] }
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const service = new ProposalEvaluationSummaryService(prisma, { record: async () => {} }, {}, {}, participation, access);
  await assert.rejects(() => service.submitEvaluationPackage(actor, proposal.id, { contextVersion: proposalContextVersion(proposal) }), /không còn khớp/);
  assert.deepEqual(writes, []);
});
