import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { PasswordService } from "../dist/apps/api/auth/password.service.js";
import { ResearcherProfilesService } from "../dist/apps/api/researcher-profiles/researcher-profiles.service.js";
import { updateResearcherProfilePipe } from "../dist/apps/api/researcher-profiles/researcher-profiles.dto.js";

// Đổi quân hàm, học hàm, học vị trong lý lịch khoa học: danh sách đang dùng đổi theo; bản đã trình, đã ký,
// đã chốt giữ nguyên tên tại thời điểm đó (CONTEXT.md, bất biến 5).

let database;
let db;
let authStore;
let profiles;
let org;
let staff;
let sequence = 0;
const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;
const contextVersion = (profile) => ({ domain: "researcher-profile", recordId: profile.id, aggregateVersion: profile.aggregateVersion, policyVersion: "v1", relationshipVersion: 0, conflictVersion: 0, delegationVersion: 0 });
const mail = { configuration: () => ({ host: "localhost", port: 1025, from: "noreply@hvqy.test", loginUrl: "http://localhost:3000", localHost: true }), sendAccountActivation: async () => undefined };

async function createUser(role, displayName) {
  const name = unique(role.toLowerCase());
  return db.user.create({ data: { username: name, usernameKey: name, displayName, passwordHash: "not-used", status: "active", systemRole: role, unit: org.name, organizationScopes: { create: [{ organizationUnitId: org.id, isPrimary: true }] } } });
}

describe("Scientist titles propagate to live lists, not to issued evidence", () => {
  before(async () => {
    database = await createMigratedDatabase("titles");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();
    authStore = new AuthStore(db);
    profiles = new ResearcherProfilesService(db, new AuditLogService(db), mail, new PasswordService());
    org = await db.organizationUnit.create({ data: { code: unique("ORG"), name: "Khoa Nội" } });
    staff = authStore.toSafeUser(await authStore.findUserById((await createUser("RESEARCH_MANAGEMENT_STAFF", "Chuyên viên")).id));
  });

  after(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it("updates members, invitations and unsigned councils; keeps submitted, signed and published records", async () => {
    const masters = await db.catalogItem.create({ data: { type: "academic-degree", code: "master", name: "Thạc sĩ" } });
    const doctor = await db.catalogItem.create({ data: { type: "academic-degree", code: "doctor", name: "Tiến sĩ" } });
    const associate = await db.catalogItem.create({ data: { type: "academic-rank", code: "associate-professor", name: "Phó giáo sư" } });
    const scientist = await createUser("RESEARCHER_INTERNAL_USER", "Thiếu tá, ThS. Lê Văn An");
    const profile = await db.researcherProfile.create({ data: { managementOrganizationUnitId: org.id, linkedUserId: scientist.id, fullName: "Lê Văn An", fullNameKey: "le van an", militaryRank: "Thiếu tá", academicDegreeCatalogItemId: masters.id, createdById: staff.id, updatedById: staff.id } });
    const old = { name: "Thiếu tá, ThS. Lê Văn An", plain: "Lê Văn An", title: "ThS." };
    const owner = await createUser("RESEARCHER_INTERNAL_USER", "Chủ nhiệm");

    // Hồ sơ đề xuất: thành viên (sống), bản nộp (bằng chứng), hội đồng nháp (sống), hội đồng đã ký và IRB đang trình (giữ).
    const period = await db.proposalIntakePeriod.create({ data: { code: unique("DOT"), title: "Đợt", startsAt: new Date("2030-01-01"), endsAt: new Date("2030-12-31"), status: "open", requiredPackage: {} } });
    const member = { userId: scientist.id, displayName: old.plain, academicTitle: old.title, role: "member", roleLabel: "Uỷ viên" };
    const draftCouncil = await db.researchProposal.create({ data: { intakePeriodId: period.id, ownerId: owner.id, hostOrganizationUnitId: org.id, title: "Đề xuất A", status: "submitted", councilMetadata: { status: "draft", members: [member, { ...member, userId: "someone-else", displayName: "Người khác" }] }, irbMetadata: { council: { status: "submitted", members: [member] } } } });
    const signedCouncil = await db.researchProposal.create({ data: { intakePeriodId: period.id, ownerId: owner.id, hostOrganizationUnitId: org.id, title: "Đề xuất B", status: "approved", councilMetadata: { status: "approved", decisionNumber: "123/QĐ", members: [member] }, irbMetadata: { council: { status: "rejected", members: [member] } } } });
    const proposalMember = await db.proposalMember.create({ data: { proposalId: draftCouncil.id, userId: scientist.id, name: old.name, role: "TOPIC_MEMBER", organization: org.name } });
    const submission = await db.proposalSubmissionEvent.create({ data: { proposalId: signedCouncil.id, actorId: owner.id, fromStatus: "draft", toStatus: "submitted", submittedAt: new Date(), snapshot: { members: [{ userId: scientist.id, name: old.name }] } } });
    const decision = await db.proposalDecision.create({ data: { proposalId: signedCouncil.id, decision: "approved", decidedById: staff.id, decidedAt: new Date(), fromStatus: "ready_for_approval", toStatus: "approved" } });

    // Đề tài: thành viên (sống); hội đồng nghiệm thu đang đề xuất (sống) và đã thành lập (giữ).
    const project = await db.approvedProject.create({ data: { proposalId: signedCouncil.id, sourceSubmissionEventId: submission.id, sourceDecisionId: decision.id, hostOrganizationUnitId: org.id, title: "Đề tài B", scopeSnapshot: {}, createdById: staff.id } });
    // Mỗi đề tài chỉ có một vòng nghiệm thu đang mở: hội đồng đã thành lập nằm ở một đề tài khác.
    const otherProposal = await db.researchProposal.create({ data: { intakePeriodId: period.id, ownerId: owner.id, hostOrganizationUnitId: org.id, title: "Đề xuất C", status: "approved" } });
    const otherSubmission = await db.proposalSubmissionEvent.create({ data: { proposalId: otherProposal.id, actorId: owner.id, fromStatus: "draft", toStatus: "submitted", submittedAt: new Date(), snapshot: {} } });
    const otherDecision = await db.proposalDecision.create({ data: { proposalId: otherProposal.id, decision: "approved", decidedById: staff.id, decidedAt: new Date(), fromStatus: "ready_for_approval", toStatus: "approved" } });
    const otherProject = await db.approvedProject.create({ data: { proposalId: otherProposal.id, sourceSubmissionEventId: otherSubmission.id, sourceDecisionId: otherDecision.id, hostOrganizationUnitId: org.id, title: "Đề tài C", scopeSnapshot: {}, createdById: staff.id } });
    const projectMember = await db.approvedProjectMember.create({ data: { projectId: project.id, userId: scientist.id, name: old.name, role: "TOPIC_MEMBER", effectiveFrom: new Date(), createdById: staff.id } });
    const acceptanceMember = { profileId: profile.id, userId: scientist.id, fullName: old.plain, academicTitle: old.title, role: "member" };
    const acceptance = (status, projectId) => db.projectAcceptance.create({ data: { projectId, round: 1, status, dossier: {}, councilMembers: [acceptanceMember], submittedById: staff.id, submittedAt: new Date() } });
    const proposedAcceptance = await acceptance("COUNCIL_PROPOSED", project.id);
    const establishedAcceptance = await acceptance("COUNCIL_ESTABLISHED", otherProject.id);

    // Hội nghị: lời mời (sống); chương trình đã chốt (bằng chứng).
    const conference = await db.scientificConference.create({ data: { code: unique("HN"), title: "Hội nghị", hostOrganizationUnitId: org.id, location: "A", startsAt: new Date("2030-03-01"), endsAt: new Date("2030-03-02"), abstractDeadline: new Date("2030-01-01"), fullPaperDeadline: new Date("2030-02-01"), status: "program_published", createdById: staff.id } });
    const invitation = await db.conferenceInvitation.create({ data: { conferenceId: conference.id, kind: "speaker", userId: scientist.id, fullName: old.name, email: null, isInternal: true, organizationUnitId: org.id, status: "accepted", createdById: staff.id } });
    const program = await db.conferenceProgramVersion.create({ data: { conferenceId: conference.id, versionNumber: 1, snapshot: { sessions: [{ items: [{ type: "paper", speaker: old.name }] }] }, publishedById: staff.id } });
    const proposalUpdatedAt = (await db.researchProposal.findUnique({ where: { id: draftCouncil.id } })).updatedAt;

    // Lên Thượng tá, nhận học vị Tiến sĩ và học hàm Phó giáo sư.
    const current = await profiles.getProfile(staff, profile.id);
    await profiles.updateProfile(staff, profile.id, updateResearcherProfilePipe.transform({ contextVersion: contextVersion(current), militaryRank: "Thượng tá", academicRankCatalogItemId: associate.id, academicDegreeCatalogItemId: doctor.id }));
    const next = "Thượng tá, PGS. TS. Lê Văn An";

    assert.equal((await db.user.findUnique({ where: { id: scientist.id } })).displayName, next);
    assert.equal((await db.proposalMember.findUnique({ where: { id: proposalMember.id } })).name, next, "thành viên hồ sơ đề xuất");
    assert.equal((await db.approvedProjectMember.findUnique({ where: { id: projectMember.id } })).name, next, "thành viên đề tài");
    assert.equal((await db.conferenceInvitation.findUnique({ where: { id: invitation.id } })).fullName, next, "khách mời hội nghị");

    const draft = await db.researchProposal.findUnique({ where: { id: draftCouncil.id } });
    assert.deepEqual(draft.councilMetadata.members.map((item) => [item.displayName, item.academicTitle]), [["Lê Văn An", "PGS. TS."], ["Người khác", old.title]], "hội đồng nháp đổi, người khác giữ nguyên");
    assert.equal(draft.irbMetadata.council.members[0].academicTitle, old.title, "tờ trình IRB đang trình: giữ");
    assert.equal(draft.updatedAt.getTime(), proposalUpdatedAt.getTime(), "không đổi phiên bản hồ sơ");
    const signed = await db.researchProposal.findUnique({ where: { id: signedCouncil.id } });
    assert.equal(signed.councilMetadata.members[0].academicTitle, old.title, "hội đồng đã ký: giữ");
    assert.equal(signed.irbMetadata.council.members[0].academicTitle, "PGS. TS.", "tờ trình IRB bị trả lại: đổi");

    assert.equal((await db.projectAcceptance.findUnique({ where: { id: proposedAcceptance.id } })).councilMembers[0].academicTitle, "PGS. TS.", "hội đồng nghiệm thu đang đề xuất");
    assert.equal((await db.projectAcceptance.findUnique({ where: { id: establishedAcceptance.id } })).councilMembers[0].academicTitle, old.title, "hội đồng nghiệm thu đã thành lập: giữ");
    assert.equal((await db.proposalSubmissionEvent.findUnique({ where: { id: submission.id } })).snapshot.members[0].name, old.name, "bản nộp: giữ");
    assert.equal((await db.conferenceProgramVersion.findUnique({ where: { id: program.id } })).snapshot.sessions[0].items[0].speaker, old.name, "chương trình đã chốt: giữ");

    const audit = await db.auditLog.findFirst({ where: { action: "propagate-researcher-titles", targetEntityId: profile.id } });
    assert.deepEqual(audit.afterFacts, { proposalMembers: 1, projectMembers: 1, conferenceInvitations: 1, evaluationCouncils: 1, irbCouncils: 1, acceptanceCouncils: 1 });

    // Lưu lại không đổi gì: không cập nhật, không ghi nhật ký lần nữa.
    const again = await profiles.getProfile(staff, profile.id);
    await profiles.updateProfile(staff, profile.id, updateResearcherProfilePipe.transform({ contextVersion: contextVersion(again), position: "Chủ nhiệm bộ môn" }));
    assert.equal(await db.auditLog.count({ where: { action: "propagate-researcher-titles", targetEntityId: profile.id } }), 1);
  });
});
