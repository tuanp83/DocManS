import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { ProposalParticipationService } from "../dist/apps/api/research-proposals/proposal-participation.service.js";
import { ProposalReviewAccessService } from "../dist/apps/api/proposals-shared/proposal-review-access.service.js";
import { ProposalReviewAssignmentsService } from "../dist/apps/api/proposal-evaluations/proposal-review-assignments.service.js";
import { ProposalReviewsService } from "../dist/apps/api/proposal-evaluations/proposal-reviews.service.js";
import { ProposalEvaluationSummaryService } from "../dist/apps/api/proposal-evaluations/proposal-evaluation-summary.service.js";
import { ProposalDecisionsService } from "../dist/apps/api/proposal-evaluations/proposal-decisions.service.js";

// Council / IRB metadata writes: one serializable transaction with the proposal row locked,
// contextVersion verification, 403 for authority failures and unique IRB certificate numbers.
// Runs against a throwaway database migrated from the committed migrations.

let database;
let db;
let decisions;
let notifications;
let authStore;
let orgA;
let orgB;
let period;
let owner;
let staff;
let outsiderStaff;
let leader;
let irbManager;
let memberA;
let memberB;
let outsider;
let sequence = 0;

const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;

async function createUser(role, org, extra = {}) {
  const name = unique(role.toLowerCase().replace(/_/g, "-"));
  const user = await db.user.create({
    data: {
      username: name,
      usernameKey: name,
      displayName: name,
      passwordHash: "not-used",
      status: "active",
      systemRole: role,
      unit: org.name,
      organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] },
      ...extra
    }
  });
  return authStore.toSafeUser(await authStore.findUserById(user.id));
}

async function newProposal(irbMetadata = undefined) {
  return db.researchProposal.create({
    data: {
      intakePeriodId: period.id,
      ownerId: owner.id,
      hostOrganizationUnitId: orgA.id,
      title: unique("Đề tài kiểm thử IRB"),
      status: "submitted",
      submittedAt: new Date(),
      ...(irbMetadata ? { irbMetadata } : {})
    }
  });
}

/** Proposal whose IRB council (memberA, memberB) is already approved. */
async function approvedIrbProposal() {
  return newProposal({
    council: { status: "approved", members: [{ userId: memberA.id, displayName: memberA.displayName }, { userId: memberB.id, displayName: memberB.displayName }] },
    reviews: [],
    certificate: null
  });
}

/** Proposal whose acceptance council has been proposed and awaits the leadership decision. */
async function proposedAcceptanceProposal() {
  const proposal = await newProposal();
  return db.researchProposal.update({ where: { id: proposal.id }, data: { acceptanceCouncilMetadata: { status: "PROPOSED", members: [] } } });
}

const auditCount = (proposalId, action) => db.auditLog.count({ where: { targetEntityId: proposalId, action } });
const readIrb = async (proposalId) => (await db.researchProposal.findUnique({ where: { id: proposalId } })).irbMetadata;

describe("Council and IRB writes on real PostgreSQL", () => {
  before(async () => {
    database = await createMigratedDatabase("council_irb");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();

    authStore = new AuthStore(db);
    const auditLog = new AuditLogService(db);
    const participation = new ProposalParticipationService(db);
    const reviewAccess = new ProposalReviewAccessService(db);
    const assignments = new ProposalReviewAssignmentsService(db, auditLog, participation, reviewAccess);
    const reviews = new ProposalReviewsService(db, auditLog, reviewAccess, participation);
    const summaries = new ProposalEvaluationSummaryService(db, auditLog, assignments, reviews, participation, reviewAccess);
    notifications = { sent: [], async createNotification(input) { this.sent.push(input); } };
    decisions = new ProposalDecisionsService(db, auditLog, participation, reviewAccess, assignments, reviews, summaries, notifications);

    orgA = await db.organizationUnit.create({ data: { code: unique("IRB-A"), name: "Đơn vị IRB A" } });
    orgB = await db.organizationUnit.create({ data: { code: unique("IRB-B"), name: "Đơn vị IRB B" } });
    period = await db.proposalIntakePeriod.create({
      data: { code: unique("DOT"), title: "Đợt kiểm thử", startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000), status: "open", requiredPackage: {} }
    });
    owner = await createUser("RESEARCHER_INTERNAL_USER", orgA);
    staff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA);
    outsiderStaff = await createUser("RESEARCH_MANAGEMENT_STAFF", orgB);
    leader = await createUser("LEADERSHIP_APPROVAL_AUTHORITY", orgA);
    irbManager = await createUser("RESEARCH_MANAGEMENT_STAFF", orgA, { unit: "Trưởng phòng KHQS" });
    memberA = await createUser("RESEARCHER_INTERNAL_USER", orgB);
    memberB = await createUser("RESEARCHER_INTERNAL_USER", orgB);
    outsider = await createUser("RESEARCHER_INTERNAL_USER", orgB);
  });

  after(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it("council actions return 403 for out-of-scope staff and non-leaders, with no write or audit", async () => {
    const proposal = await newProposal();
    await assert.rejects(decisions.proposeCouncil(outsiderStaff, proposal.id, { members: [] }), ForbiddenException);
    await assert.rejects(decisions.proposeIrbCouncil(outsiderStaff, proposal.id, { members: [] }), ForbiddenException);

    await decisions.proposeIrbCouncil(staff, proposal.id, { members: [{ userId: memberA.id }] });
    await assert.rejects(decisions.approveIrbCouncil(staff, proposal.id, {}), ForbiddenException);
    await assert.rejects(decisions.updateIRBStatus(outsiderStaff, proposal.id, { status: "APPROVED" }), ForbiddenException);

    const after = await db.researchProposal.findUnique({ where: { id: proposal.id } });
    assert.equal(after.councilMetadata, null);
    assert.equal(after.irbMetadata.council.status, "submitted");
    assert.equal(after.irbMetadata.certificate, undefined);
    assert.equal(await auditCount(proposal.id, "propose-council"), 0);
    assert.equal(await auditCount(proposal.id, "approve-irb-council"), 0);
    assert.equal(await auditCount(proposal.id, "update-irb-status"), 0);
  });

  it("an IRB review by a non-member is 403 (not 400) and changes nothing", async () => {
    const proposal = await approvedIrbProposal();
    await assert.rejects(decisions.submitIrbReview(outsider, proposal.id, { comment: "x" }), ForbiddenException);
    assert.deepEqual((await readIrb(proposal.id)).reviews, []);
    assert.equal(await auditCount(proposal.id, "submit-irb-review"), 0);
  });

  it("verifies contextVersion: a stale token is 409, the current token succeeds and the response carries the new token", async () => {
    const proposal = await newProposal();
    const { contextVersion: initial } = await decisions.getIRBInfo(staff, proposal.id);
    assert.equal(initial.domain, "proposal");
    assert.equal(initial.recordId, proposal.id);

    const proposed = await decisions.proposeIrbCouncil(staff, proposal.id, { contextVersion: initial, members: [{ userId: memberA.id }] });
    assert.ok(proposed.contextVersion.aggregateVersion > initial.aggregateVersion);

    // Re-using the token the first write consumed is stale now.
    await assert.rejects(decisions.approveIrbCouncil(leader, proposal.id, { contextVersion: initial }), (error) =>
      error instanceof ConflictException && error.getResponse().code === "CONTEXT_VERSION_MISMATCH");
    assert.equal((await readIrb(proposal.id)).council.status, "submitted");
    assert.equal(await auditCount(proposal.id, "approve-irb-council"), 0);

    const approved = await decisions.approveIrbCouncil(leader, proposal.id, { contextVersion: proposed.contextVersion });
    assert.equal(approved.irb.council.status, "approved");
    assert.equal(await auditCount(proposal.id, "approve-irb-council"), 1);

    await assert.rejects(decisions.proposeCouncil(staff, proposal.id, { contextVersion: initial, members: [] }), ConflictException);
    const council = await decisions.proposeCouncil(staff, proposal.id, { contextVersion: approved.contextVersion, members: [] });
    assert.equal(council.councilMetadata.status, "draft");
    assert.ok(council.contextVersion.aggregateVersion >= approved.contextVersion.aggregateVersion);
  });

  it("concurrent reviews without contextVersion are both kept: the server retries the serialization conflict", async () => {
    const proposal = await approvedIrbProposal();
    await Promise.all([
      decisions.submitIrbReview(memberA, proposal.id, { comment: "A", recommendation: "APPROVE" }),
      decisions.submitIrbReview(memberB, proposal.id, { comment: "B", recommendation: "REVISE" })
    ]);
    const reviews = (await readIrb(proposal.id)).reviews;
    assert.deepEqual(reviews.map((review) => review.reviewerId).sort(), [memberA.id, memberB.id].sort());
    assert.equal(await auditCount(proposal.id, "submit-irb-review"), 2);
  });

  it("concurrent reviews sent with the same contextVersion: one commits, the other gets 409 (record really changed)", async () => {
    const proposal = await approvedIrbProposal();
    const { contextVersion } = await decisions.getIRBInfo(leader, proposal.id);
    const results = await Promise.allSettled([
      decisions.submitIrbReview(memberA, proposal.id, { comment: "A", contextVersion }),
      decisions.submitIrbReview(memberB, proposal.id, { comment: "B", contextVersion })
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof ConflictException, String(rejected[0].reason));
    assert.equal(rejected[0].reason.getResponse().code, "CONTEXT_VERSION_MISMATCH");
    assert.equal((await readIrb(proposal.id)).reviews.length, 1);
    assert.equal(await auditCount(proposal.id, "submit-irb-review"), 1);
  });

  it("generates unique IRB-HVQY-YYYY-NNN numbers, keeps the number on re-issue and notifies after commit", async () => {
    const first = await newProposal();
    const second = await newProposal();
    notifications.sent.length = 0;

    const a = await decisions.updateIRBStatus(irbManager, first.id, { status: "APPROVED", decisionDate: "2026-03-01T00:00:00.000Z" });
    const b = await decisions.updateIRBStatus(irbManager, second.id, { status: "APPROVED", decisionDate: "2026-03-02T00:00:00.000Z" });
    const numberA = a.irb.certificate.certificateNumber;
    const numberB = b.irb.certificate.certificateNumber;
    assert.match(numberA, /^IRB-HVQY-2026-\d{3,}$/);
    assert.match(numberB, /^IRB-HVQY-2026-\d{3,}$/);
    assert.notEqual(numberA, numberB);
    assert.ok(a.contextVersion);
    assert.equal(notifications.sent.length, 2);
    assert.equal(notifications.sent[0].metadata.certificateNumber, numberA);

    const reissued = await decisions.updateIRBStatus(irbManager, first.id, { status: "APPROVED", contextVersion: a.contextVersion });
    assert.equal(reissued.irb.certificate.certificateNumber, numberA);
    assert.equal(await auditCount(first.id, "update-irb-status"), 2);
  });

  it("rejects a manual number already held by another proposal with 409 and writes nothing", async () => {
    const holder = await newProposal();
    const other = await newProposal();
    const manual = unique("IRB-MANUAL");
    await decisions.updateIRBStatus(irbManager, holder.id, { status: "APPROVED", certificateNumber: manual });
    notifications.sent.length = 0;

    await assert.rejects(decisions.updateIRBStatus(irbManager, other.id, { status: "APPROVED", certificateNumber: manual }), (error) =>
      error instanceof ConflictException && error.getResponse().code === "IRB_CERTIFICATE_NUMBER_TAKEN");
    assert.equal(await readIrb(other.id), null);
    assert.equal(await auditCount(other.id, "update-irb-status"), 0);
    assert.equal(notifications.sent.length, 0, "no notification for a rolled-back certificate");
  });

  it("validates status and number length; REJECTED without a number stores null", async () => {
    const proposal = await newProposal();
    await assert.rejects(decisions.updateIRBStatus(irbManager, proposal.id, { status: "MAYBE" }), BadRequestException);
    await assert.rejects(decisions.updateIRBStatus(irbManager, proposal.id, { status: "APPROVED", certificateNumber: "x".repeat(101) }), BadRequestException);
    assert.equal(await readIrb(proposal.id), null);

    const rejected = await decisions.updateIRBStatus(irbManager, proposal.id, { status: "REJECTED" });
    assert.equal(rejected.irb.certificate.status, "REJECTED");
    assert.equal(rejected.irb.certificate.certificateNumber, null);
  });

  it("the partial unique index blocks duplicate certificate numbers written directly", async () => {
    const number = unique("IRB-DIRECT");
    await newProposal({ certificate: { certificateNumber: number } });
    await assert.rejects(newProposal({ certificate: { certificateNumber: number } }), (error) => error.code === "P2002" || /unique/i.test(String(error.message)));
    // Proposals without a number are not constrained.
    await newProposal({ certificate: null });
    await newProposal({ certificate: null });
  });

  it("IRB numbering restarts at 001 each year and skips a slot already taken by a manual number", async () => {
    const issue = async (date, extra = {}) =>
      (await decisions.updateIRBStatus(staff, (await newProposal()).id, { status: "APPROVED", decisionDate: date, ...extra })).irb.certificate.certificateNumber;
    assert.equal(await issue("2031-02-01T00:00:00.000Z"), "IRB-HVQY-2031-001");
    assert.equal(await issue("2031-05-01T00:00:00.000Z"), "IRB-HVQY-2031-002");
    assert.equal(await issue("2032-01-15T00:00:00.000Z"), "IRB-HVQY-2032-001");
    assert.equal(await issue("2033-01-15T00:00:00.000Z", { certificateNumber: "IRB-HVQY-2033-001" }), "IRB-HVQY-2033-001");
    assert.equal(await issue("2033-03-01T00:00:00.000Z"), "IRB-HVQY-2033-002");
  });

  it("concurrent certificate issues on two proposals, each with its own contextVersion, both succeed with distinct numbers", async () => {
    const [p1, p2] = [await newProposal(), await newProposal()];
    const [v1, v2] = [(await decisions.getIRBInfo(leader, p1.id)).contextVersion, (await decisions.getIRBInfo(leader, p2.id)).contextVersion];
    const [r1, r2] = await Promise.all([
      decisions.updateIRBStatus(staff, p1.id, { status: "APPROVED", decisionDate: "2034-01-01T00:00:00.000Z", contextVersion: v1 }),
      decisions.updateIRBStatus(leader, p2.id, { status: "APPROVED", decisionDate: "2034-01-02T00:00:00.000Z", contextVersion: v2 })
    ]);
    assert.deepEqual([r1.irb.certificate.certificateNumber, r2.irb.certificate.certificateNumber].sort(), ["IRB-HVQY-2034-001", "IRB-HVQY-2034-002"]);
  });

});
