import "dotenv/config";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { AuditLogService } from "../dist/apps/api/auth/audit-log.service.js";
import { AuthRateLimitService } from "../dist/apps/api/auth/auth-rate-limit.service.js";
import { AuthService } from "../dist/apps/api/auth/auth.service.js";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { PasswordService } from "../dist/apps/api/auth/password.service.js";
import { SessionAuthGuard } from "../dist/apps/api/auth/session-auth.guard.js";
import { ResearcherProfilesService } from "../dist/apps/api/researcher-profiles/researcher-profiles.service.js";
import {
  createResearcherProfilePipe,
  researcherAccountPipe,
  updateMyProfilePipe,
  updateResearcherProfilePipe
} from "../dist/apps/api/researcher-profiles/researcher-profiles.dto.js";

// Epic 2 regression coverage deferred by spec-researcher-profile-completion.md (deferred-work.md).
// Runs against a throwaway database migrated from the committed migrations, so constraints,
// triggers, row locks and transactions are the real PostgreSQL behaviour, not fakes.

const TEMP_PASSWORD = "Tam-Thoi-2026a";
const NEW_PASSWORD = "Mat-Khau-Moi-2026b";
const REQUEST = { ip: "127.0.0.1", userAgent: "epic2-test" };

let database;
let db;
let mail;
let passwords;
let authStore;
let auth;
let profiles;
let orgA;
let orgB;
let field;
let staff;
let outsider;
let sequence = 0;

const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;
const uniqueEmail = () => `${unique("ns")}@hvqy.test`.toLowerCase();
const tokenFrom = (message) => new URL(message.activationUrl).searchParams.get("token");

function contextVersion(profile) {
  return { domain: "researcher-profile", recordId: profile.id, aggregateVersion: profile.aggregateVersion, policyVersion: "v1", relationshipVersion: 0, conflictVersion: 0, delegationVersion: 0 };
}

function createMail() {
  return {
    mode: "ok",
    sent: [],
    configuration() {
      if (this.mode === "unconfigured") throw new ServiceUnavailableException({ code: "MAIL_NOT_CONFIGURED" });
      return { host: "localhost", port: 1025, from: "noreply@hvqy.test", loginUrl: "http://localhost:3000", localHost: true };
    },
    async sendAccountActivation(input) {
      if (this.mode === "fail") throw new Error("smtp timeout");
      this.sent.push(input);
    }
  };
}

async function createUser({ role, orgs = [orgA], status = "active", password = "Khong-Dung-2026x", mustChangePassword = false, email = null }) {
  const name = unique(role.toLowerCase().replace(/_/g, "-"));
  return db.user.create({
    data: {
      username: name,
      usernameKey: name,
      displayName: name,
      passwordHash: await passwords.hashPassword(password),
      credentialEmail: email,
      mustChangePassword,
      status,
      systemRole: role,
      unit: orgs[0].name,
      organizationScopes: { create: orgs.map((org, index) => ({ organizationUnitId: org.id, isPrimary: index === 0 })) }
    }
  });
}

async function actorFor(user) {
  return authStore.toSafeUser(await authStore.findUserById(user.id));
}

async function newProfile(actor, overrides = {}) {
  const input = createResearcherProfilePipe.transform({ managementOrganizationUnitId: orgA.id, fullName: unique("Nhà khoa học"), researchFieldIds: [field.id], ...overrides });
  const result = await profiles.createProfile(actor, input);
  assert.ok(result.profile, "profile must be created without a duplicate confirmation");
  return result.profile;
}

async function linkAccount(profileId, user) {
  const current = await profiles.getProfile(staff, profileId);
  return profiles.linkResearcherAccount(staff, profileId, researcherAccountPipe.transform({ contextVersion: contextVersion(current), userId: user.id, reason: "Liên kết kiểm thử" }));
}

function guardContext(sessionId, path) {
  const request = { headers: { cookie: `rtms_session=${sessionId}` }, path };
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

describe("Epic 2 researcher profiles and account access on real PostgreSQL", () => {
  before(async () => {
    database = await createMigratedDatabase("epic2");
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = database.url;
    db = new PrismaService();
    process.env.DATABASE_URL = originalUrl;
    await db.$connect();

    mail = createMail();
    passwords = new PasswordService();
    authStore = new AuthStore(db);
    auth = new AuthService(new AuditLogService(db), new AuthRateLimitService(), authStore, passwords);
    profiles = new ResearcherProfilesService(db, new AuditLogService(db), mail, passwords);

    orgA = await db.organizationUnit.create({ data: { code: unique("TEST-A"), name: "Đơn vị kiểm thử A" } });
    orgB = await db.organizationUnit.create({ data: { code: unique("TEST-B"), name: "Đơn vị kiểm thử B" } });
    field = await db.catalogItem.create({ data: { type: "research-field", code: unique("FIELD"), name: "Y học quân sự kiểm thử" } });
    staff = await actorFor(await createUser({ role: "SCIENTIFIC_MANAGEMENT_STAFF", orgs: [orgA] }));
    outsider = await actorFor(await createUser({ role: "SCIENTIFIC_MANAGEMENT_STAFF", orgs: [orgB] }));
  });

  after(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it("migrations enforce one current account per profile and per account, and immutable history", async () => {
    const userA = await createUser({ role: "EXTERNAL_RESEARCHER_USER" });
    const userB = await createUser({ role: "EXTERNAL_RESEARCHER_USER" });
    const first = await newProfile(staff, { profileType: "EXTERNAL" });
    const second = await newProfile(staff, { profileType: "EXTERNAL" });
    const link = (researcherProfileId, userId, status = "ACTIVE") =>
      db.researcherProfileAccountLink.create({ data: { researcherProfileId, userId, status, effectiveFrom: new Date(), reason: "constraint-test", createdById: staff.id } });

    await link(first.id, userA.id);
    await assert.rejects(() => link(second.id, userA.id), /Unique constraint/i, "one ACTIVE link per account");
    await assert.rejects(() => link(first.id, userB.id), /Unique constraint/i, "one ACTIVE link per profile");
    await link(second.id, userA.id, "ENDED");

    await db.researcherProfile.update({ where: { id: first.id }, data: { linkedUserId: userA.id } });
    await assert.rejects(() => db.researcherProfile.update({ where: { id: second.id }, data: { linkedUserId: userA.id } }), /Unique constraint/i);

    const history = await db.researcherProfileHistory.findFirstOrThrow({ where: { researcherProfileId: first.id } });
    await assert.rejects(() => db.$executeRaw`UPDATE researcher_profile_history SET action = 'TAMPERED' WHERE id = ${history.id}`);
    await assert.rejects(() => db.$executeRaw`DELETE FROM researcher_profile_history WHERE id = ${history.id}`);
    assert.equal((await db.researcherProfileHistory.findUniqueOrThrow({ where: { id: history.id } })).action, history.action);
  });

  it("provisioning an INTERNAL profile creates a pending account, link, hashed token and secret-free audit atomically", async () => {
    mail.mode = "ok";
    const email = uniqueEmail();
    const result = await profiles.createProfile(staff, createResearcherProfilePipe.transform({ managementOrganizationUnitId: orgA.id, fullName: unique("Nội bộ"), researchFieldIds: [field.id], contactEmail: email }));
    const profile = result.profile;

    assert.equal(profile.account.status, "pending_activation");
    assert.equal(profile.account.systemRole, "RESEARCHER_INTERNAL_USER");
    assert.equal(profile.account.email, email);
    const user = await db.user.findUniqueOrThrow({ where: { credentialEmail: email }, include: { organizationScopes: true } });
    assert.equal(user.username, null);
    assert.deepEqual(user.organizationScopes.map((scope) => scope.organizationUnitId), [orgA.id]);
    assert.match(user.passwordHash, /^scrypt:/);
    assert.equal(await db.researcherProfileAccountLink.count({ where: { researcherProfileId: profile.id, userId: user.id, status: "ACTIVE" } }), 1);

    const message = mail.sent.at(-1);
    assert.equal(message.to, email);
    const token = tokenFrom(message);
    const stored = await db.accountActivationToken.findMany({ where: { userId: user.id, usedAt: null } });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].tokenHash, passwords.hashResetToken(token));
    assert.notEqual(stored[0].tokenHash, token);
    const ttlHours = (stored[0].expiresAt.getTime() - Date.now()) / 3_600_000;
    assert.ok(ttlHours > 47.9 && ttlHours <= 48, `activation expires after 48 hours (got ${ttlHours})`);

    const delivery = await db.accountCredentialDelivery.findFirstOrThrow({ where: { researcherProfileId: profile.id } });
    assert.equal(delivery.status, "ACCEPTED");
    const profileAudits = await db.auditLog.findMany({ where: { targetEntityId: profile.id } });
    for (const action of ["create-researcher-profile", "provision-researcher-account", "link-researcher-account", "issue-researcher-activation"]) {
      assert.ok(profileAudits.some((record) => record.action === action && record.result === "success"), `${action} audited`);
    }
    assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: "deliver-researcher-activation", targetEntityId: delivery.id } })).result, "success");

    const everything = JSON.stringify({ result, audits: await db.auditLog.findMany(), deliveries: await db.accountCredentialDelivery.findMany() });
    assert.equal(everything.includes(token), false, "the activation token never appears in responses, audits or delivery rows");
  });

  it("missing or duplicate credential email leaves no partial profile or account; EXTERNAL profiles may stay accountless", async () => {
    mail.mode = "ok";
    const noEmailName = unique("Thiếu email");
    await assert.rejects(() => profiles.createProfile(staff, createResearcherProfilePipe.transform({ managementOrganizationUnitId: orgA.id, fullName: noEmailName, researchFieldIds: [field.id] })), BadRequestException);
    assert.equal(await db.researcherProfile.count({ where: { fullName: noEmailName } }), 0);

    const takenEmail = uniqueEmail();
    await createUser({ role: "RESEARCHER_INTERNAL_USER", email: takenEmail });
    const duplicateName = unique("Trùng email");
    await assert.rejects(() => profiles.createProfile(staff, createResearcherProfilePipe.transform({ managementOrganizationUnitId: orgA.id, fullName: duplicateName, researchFieldIds: [field.id], contactEmail: takenEmail })), ConflictException);
    assert.equal(await db.researcherProfile.count({ where: { fullName: duplicateName } }), 0, "profile insert is rolled back with the failed account creation");
    assert.equal(await db.user.count({ where: { credentialEmail: takenEmail } }), 1);

    const usersBefore = await db.user.count();
    const external = await newProfile(staff, { profileType: "EXTERNAL", contactEmail: uniqueEmail() });
    assert.equal(external.account, null);
    assert.equal(await db.user.count(), usersBefore);
  });

  it("unconfirmed mail delivery is recorded as UNKNOWN; resend issues a fresh token and invalidates the previous one", async () => {
    const email = uniqueEmail();
    mail.mode = "fail";
    const created = await newProfile(staff, { contactEmail: email });
    mail.mode = "ok";

    const failed = await db.accountCredentialDelivery.findFirstOrThrow({ where: { researcherProfileId: created.id } });
    assert.equal(failed.status, "UNKNOWN");
    assert.equal(failed.lastError, "MAIL_DELIVERY_UNCONFIRMED");
    assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: "deliver-researcher-activation", targetEntityId: failed.id } })).result, "failure");
    assert.equal(created.account.status, "pending_activation", "the pending account and link are kept for a resend");

    const resend = async (reason) => {
      const current = await profiles.getProfile(staff, created.id);
      const response = await profiles.resetResearcherAccount(staff, created.id, researcherAccountPipe.transform({ contextVersion: contextVersion(current), email, reason }));
      assert.equal(response.delivery.status, "ACCEPTED");
      assert.equal(JSON.stringify(response).includes(tokenFrom(mail.sent.at(-1))), false);
      return tokenFrom(mail.sent.at(-1));
    };
    const firstToken = await resend("Gửi lại lần 1");
    const secondToken = await resend("Gửi lại lần 2");
    assert.notEqual(firstToken, secondToken);

    await assert.rejects(() => auth.completeAccountActivation({ token: firstToken, password: NEW_PASSWORD }, REQUEST), BadRequestException);
    await auth.completeAccountActivation({ token: secondToken, password: NEW_PASSWORD }, REQUEST);
    const user = await db.user.findUniqueOrThrow({ where: { credentialEmail: email } });
    assert.equal(user.status, "active");
    assert.equal(user.credentialVersion, 1);
    const login = await auth.login({ username: email, password: NEW_PASSWORD }, REQUEST);
    assert.equal(login.user.id, user.id, "a newly activated account logs in with its email");
    await assert.rejects(() => auth.completeAccountActivation({ token: secondToken, password: "Lan-Hai-2026cc" }, REQUEST), BadRequestException);

    const active = await profiles.getProfile(staff, created.id);
    await assert.rejects(() => profiles.resetResearcherAccount(staff, created.id, researcherAccountPipe.transform({ contextVersion: contextVersion(active), email })), ForbiddenException, "resend is only for pending accounts");
  });

  it("missing mail configuration fails before any account is created", async () => {
    const profile = await newProfile(staff, { profileType: "EXTERNAL" });
    const email = uniqueEmail();
    mail.mode = "unconfigured";
    try {
      await assert.rejects(() => profiles.createResearcherAccount(staff, profile.id, researcherAccountPipe.transform({ contextVersion: contextVersion(profile), email })), ServiceUnavailableException);
    } finally {
      mail.mode = "ok";
    }
    assert.equal(await db.user.count({ where: { credentialEmail: email } }), 0);
    assert.equal((await db.researcherProfile.findUniqueOrThrow({ where: { id: profile.id } })).linkedUserId, null);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "issue-researcher-activation", targetEntityId: profile.id } });
    assert.equal(audit.result, "failure");
    assert.equal(audit.reason, "MAIL_NOT_CONFIGURED");
  });

  it("expired activation tokens fail closed and leave the account pending", async () => {
    mail.mode = "ok";
    const email = uniqueEmail();
    await newProfile(staff, { contactEmail: email });
    const token = tokenFrom(mail.sent.at(-1));
    const user = await db.user.findUniqueOrThrow({ where: { credentialEmail: email } });
    await db.accountActivationToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await assert.rejects(() => auth.completeAccountActivation({ token, password: NEW_PASSWORD }, REQUEST), BadRequestException);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status, "pending_activation");
    await assert.rejects(() => auth.login({ username: email, password: NEW_PASSWORD }, REQUEST), UnauthorizedException);
  });

  it("a temporary credential reaches only credential routes until a distinct new password is set", async () => {
    const user = await createUser({ role: "RESEARCHER_INTERNAL_USER", password: TEMP_PASSWORD, mustChangePassword: true });
    const guard = new SessionAuthGuard(auth);
    const { session } = await auth.login({ username: user.username, password: TEMP_PASSWORD }, REQUEST);

    await assert.rejects(() => guard.canActivate(guardContext(session.id, "/api/v1/researcher-profiles/my-profile")), (error) => {
      assert.ok(error instanceof ForbiddenException);
      assert.equal(error.getResponse().code, "PASSWORD_CHANGE_REQUIRED");
      return true;
    });
    assert.equal(await guard.canActivate(guardContext(session.id, "/api/v1/auth/me")), true);
    assert.equal(await guard.canActivate(guardContext(session.id, "/api/v1/auth/change-password")), true);

    await assert.rejects(() => auth.changePassword(user.id, { currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD }, REQUEST), BadRequestException);
    await assert.rejects(() => auth.changePassword(user.id, { currentPassword: "Sai-Mat-Khau-2026", newPassword: NEW_PASSWORD }, REQUEST), BadRequestException);
    await auth.changePassword(user.id, { currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD }, REQUEST);

    const changed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(changed.mustChangePassword, false);
    assert.equal(changed.credentialVersion, 1);
    assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: "first-password-change", targetEntityId: user.id } })).result, "success");
    assert.equal(await auth.getUserForSession(session.id), null, "the temporary-password session is revoked");
    await assert.rejects(() => guard.canActivate(guardContext(session.id, "/api/v1/auth/me")), UnauthorizedException);
    await assert.rejects(() => auth.login({ username: user.username, password: TEMP_PASSWORD }, REQUEST), UnauthorizedException);

    const fresh = await auth.login({ username: user.username, password: NEW_PASSWORD }, REQUEST);
    assert.equal(fresh.user.mustChangePassword, false);
    assert.equal(await guard.canActivate(guardContext(fresh.session.id, "/api/v1/researcher-profiles/my-profile")), true);

    const staleWrite = await authStore.changePassword(user.id, await passwords.hashPassword("Ghi-Cu-2026dd"), 0, { action: "change-password", username: user.username });
    assert.equal(staleWrite, false, "a writer holding an old credential version cannot overwrite the password");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, changed.passwordHash);
  });

  it("linking checks role, scope and uniqueness, never changes account authority, and unlink keeps history", async () => {
    const researcher = await createUser({ role: "EXTERNAL_RESEARCHER_USER" });
    const internalAccount = await createUser({ role: "RESEARCHER_INTERNAL_USER" });
    const otherScopeAccount = await createUser({ role: "EXTERNAL_RESEARCHER_USER", orgs: [orgB] });
    const profile = await newProfile(staff, { profileType: "EXTERNAL" });

    const { accounts } = await profiles.accountCandidates(staff, profile.id);
    const candidateIds = accounts.map((account) => account.id);
    assert.ok(candidateIds.includes(researcher.id));
    for (const excluded of [internalAccount.id, otherScopeAccount.id, staff.id]) assert.equal(candidateIds.includes(excluded), false);
    assert.deepEqual(Object.keys(accounts[0]).sort(), ["displayName", "id", "username"], "candidates expose minimum identity only");

    for (const wrong of [internalAccount, otherScopeAccount, { id: staff.id }]) await assert.rejects(() => linkAccount(profile.id, wrong), ConflictException);
    await assert.rejects(() => profiles.linkResearcherAccount(outsider, profile.id, researcherAccountPipe.transform({ contextVersion: contextVersion(profile), userId: researcher.id })), ForbiddenException);

    const scopesBefore = await db.userOrganizationScope.findMany({ where: { userId: researcher.id }, orderBy: { organizationUnitId: "asc" } });
    const { profile: linked } = await linkAccount(profile.id, researcher);
    assert.equal(linked.account.id, researcher.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: researcher.id }, include: { organizationScopes: { orderBy: { organizationUnitId: "asc" } } } });
    assert.equal(after.systemRole, "EXTERNAL_RESEARCHER_USER");
    assert.deepEqual(after.organizationScopes.map((scope) => scope.id), scopesBefore.map((scope) => scope.id));
    assert.ok(await db.researcherProfileHistory.findFirst({ where: { researcherProfileId: profile.id, action: "ACCOUNT_LINKED" } }));

    const secondProfile = await newProfile(staff, { profileType: "EXTERNAL" });
    await assert.rejects(() => linkAccount(secondProfile.id, researcher), ConflictException, "an account links to at most one profile");
    await assert.rejects(
      () => profiles.updateProfile(staff, profile.id, updateResearcherProfilePipe.transform({ contextVersion: contextVersion(linked), profileType: "INTERNAL" })),
      (error) => error instanceof ConflictException && error.getResponse().code === "PROFILE_ACCOUNT_ROLE_CONFLICT"
    );

    await assert.rejects(() => profiles.unlinkResearcherAccount(staff, profile.id, researcherAccountPipe.transform({ contextVersion: contextVersion(linked) })), BadRequestException);
    await assert.rejects(() => profiles.unlinkResearcherAccount(staff, profile.id, researcherAccountPipe.transform({ contextVersion: contextVersion(profile), reason: "Phiên bản cũ" })), ConflictException);
    const { profile: unlinked } = await profiles.unlinkResearcherAccount(staff, profile.id, researcherAccountPipe.transform({ contextVersion: contextVersion(linked), reason: "Nhầm tài khoản" }));
    assert.equal(unlinked.account, null);
    const ended = await db.researcherProfileAccountLink.findFirstOrThrow({ where: { researcherProfileId: profile.id, userId: researcher.id } });
    assert.equal(ended.status, "ENDED");
    assert.ok(ended.effectiveUntil);
    assert.equal((await db.researcherProfileHistory.findFirstOrThrow({ where: { researcherProfileId: profile.id, action: "ACCOUNT_UNLINKED" } })).reason, "Nhầm tài khoản");
    assert.equal((await db.auditLog.findFirstOrThrow({ where: { action: "unlink-researcher-account", targetEntityId: profile.id } })).reason, "Nhầm tài khoản");
  });

  it("My Profile edits only the caller's own active profile and never changes credentials or authority", async () => {
    const researcher = await createUser({ role: "EXTERNAL_RESEARCHER_USER", email: uniqueEmail() });
    const profile = await newProfile(staff, { profileType: "EXTERNAL" });
    const otherProfile = await newProfile(staff, { profileType: "EXTERNAL" });
    await linkAccount(profile.id, researcher);
    const self = await actorFor(researcher);

    const mine = await profiles.getMyProfile(self);
    assert.equal(mine.id, profile.id);
    assert.equal("credentialDelivery" in mine, false, "self view omits manager-only delivery metadata");

    const newContactEmail = uniqueEmail();
    const { profile: updated } = await profiles.updateMyProfile(self, updateMyProfilePipe.transform({ contextVersion: contextVersion(mine), contactEmail: newContactEmail, position: "Giảng viên chính" }));
    assert.equal(updated.position, "Giảng viên chính");
    assert.equal(updated.contactEmail, newContactEmail);
    const account = await db.user.findUniqueOrThrow({ where: { id: researcher.id } });
    assert.equal(account.credentialEmail, researcher.credentialEmail, "contact email edits never change the login email");
    assert.equal(account.systemRole, researcher.systemRole);
    assert.equal((await db.researcherProfile.findUniqueOrThrow({ where: { id: profile.id } })).managementOrganizationUnitId, orgA.id);

    await assert.rejects(() => profiles.updateMyProfile(self, updateMyProfilePipe.transform({ contextVersion: contextVersion(mine), position: "Bản cũ" })), ConflictException);
    for (const key of ["profileType", "status", "linkedUserId", "systemRole", "organizationScopes"]) {
      assert.throws(() => updateMyProfilePipe.transform({ contextVersion: contextVersion(updated), [key]: "x" }), BadRequestException, `${key} is rejected`);
    }
    await assert.rejects(() => profiles.getProfile(self, otherProfile.id), ForbiddenException);
    await assert.rejects(() => profiles.listProfiles(self, {}), ForbiddenException);

    const history = await profiles.listHistory(self, profile.id);
    assert.ok(history.some((entry) => entry.action === "SELF_UPDATE"));
    assert.equal(history.some((entry) => entry.action.startsWith("ACCOUNT_")), false, "account-linkage history is manager-only");
    const allowed = new Set(["fullName", "externalAffiliation", "academicRankCatalogItemId", "academicDegreeCatalogItemId", "title", "position", "militaryRank", "contactEmail", "contactPhone", "contactNote", "researchFieldIds", "expertiseKeywordKeys", "publications", "participations"]);
    for (const entry of history) {
      assert.deepEqual(Object.keys(entry).sort(), ["action", "afterFacts", "beforeFacts", "createdAt", "id"]);
      for (const facts of [entry.beforeFacts, entry.afterFacts]) for (const key of Object.keys(facts ?? {})) assert.ok(allowed.has(key), `self history hides ${key}`);
    }

    const current = await profiles.getProfile(staff, profile.id);
    await profiles.setStatus(staff, profile.id, "INACTIVE", contextVersion(current));
    await assert.rejects(() => profiles.getMyProfile(self), ForbiddenException);
    await assert.rejects(() => profiles.updateMyProfile(self, updateMyProfilePipe.transform({ contextVersion: contextVersion(updated), position: "Ngừng hoạt động" })), ForbiddenException);
  });

  it("self-service rejects a management-organization change (contract: researcher-profile-access.md)", { todo: "SOURCE CONFLICT: updateMyProfilePipe allows managementOrganizationUnitId (commit 0c46628)" }, async () => {
    const researcher = await createUser({ role: "EXTERNAL_RESEARCHER_USER" });
    const profile = await newProfile(staff, { profileType: "EXTERNAL" });
    await linkAccount(profile.id, researcher);
    const self = await actorFor(researcher);
    const mine = await profiles.getMyProfile(self);
    assert.throws(() => updateMyProfilePipe.transform({ contextVersion: contextVersion(mine), managementOrganizationUnitId: orgB.id }), BadRequestException);
  });

  it("an account without a current profile link is denied My Profile (contract: researcher-profile-access.md)", { todo: "SOURCE CONFLICT: getMyProfile auto-creates a profile with placeholder data (commit ccee0a5)" }, async () => {
    const researcher = await createUser({ role: "RESEARCHER_INTERNAL_USER" });
    const self = await actorFor(researcher);
    await assert.rejects(() => profiles.getMyProfile(self), ForbiddenException);
    assert.equal(await db.researcherProfile.count({ where: { linkedUserId: researcher.id } }), 0);
  });

  it("self-reported participation corrections keep the predecessor; unchanged rows create no revision", async () => {
    const original = { projectTitle: "Đề tài cấp Học viện A", participationRole: "Thành viên", level: "ACADEMY_INSTITUTIONAL", startsOn: "2024-01-01", endsOn: "2024-12-31" };
    const profile = await newProfile(staff, { profileType: "EXTERNAL", participations: [original], publications: [{ title: "Bài báo 1", publicationYear: 2024 }] });
    const [participation] = profile.participations;
    assert.equal(participation.sourceType, "SELF_REPORTED");
    assert.equal(participation.authority, "SELF_REPORTED_NO_AUTHORITY");
    const update = async (fields) => {
      const current = await profiles.getProfile(staff, profile.id);
      return (await profiles.updateProfile(staff, profile.id, updateResearcherProfilePipe.transform({ contextVersion: contextVersion(current), ...fields }))).profile;
    };

    await update({ participations: [{ id: participation.id, ...original }] });
    assert.equal(await db.researcherProfileParticipation.count({ where: { researcherProfileId: profile.id } }), 1, "unchanged input creates no revision");

    await update({ participations: [{ id: participation.id, ...original, participationRole: "Thư ký khoa học", status: "INACTIVE" }] });
    const rows = await db.researcherProfileParticipation.findMany({ where: { researcherProfileId: profile.id }, orderBy: { createdAt: "asc" } });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, "SUPERSEDED");
    assert.equal(rows[0].participationRole, "Thành viên", "the earlier values remain accessible");
    assert.equal(rows[1].supersedesId, rows[0].id);
    assert.equal(rows[1].status, "INACTIVE");
    await assert.rejects(() => update({ participations: [{ id: rows[0].id, ...original }] }), ConflictException);

    const foreign = await newProfile(staff, { profileType: "EXTERNAL", participations: [original] });
    await assert.rejects(() => update({ participations: [{ id: foreign.participations[0].id, ...original }] }), NotFoundException);

    const publication = profile.publications[0];
    const withPublication = await update({ publications: [{ id: publication.id, title: "Bài báo 1 (bản sửa)", publicationYear: 2024 }] });
    assert.equal(withPublication.publications.length, 1);
    assert.equal(withPublication.publications[0].id, publication.id);
    const lastUpdate = await db.researcherProfileHistory.findFirstOrThrow({ where: { researcherProfileId: profile.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    assert.equal(lastUpdate.beforeFacts.publications[0].title, "Bài báo 1");
    assert.equal(lastUpdate.afterFacts.publications[0].title, "Bài báo 1 (bản sửa)");

    const contextless = { contextVersion: contextVersion(profile) };
    for (const invalid of [{ startsOn: "2026-02-30" }, { startsOn: "2025-05-01", endsOn: "2025-04-30" }, { sourceRecordId: "proposal-1" }, { sourceType: "PROPOSAL" }, { level: "NATIONAL" }]) {
      assert.throws(() => updateResearcherProfilePipe.transform({ ...contextless, participations: [{ ...original, ...invalid }] }), BadRequestException, JSON.stringify(invalid));
    }
  });

  it("managers see, count and mutate only profiles in their current organization scope", async () => {
    const inA = await newProfile(staff, { profileType: "EXTERNAL" });
    const inB = await newProfile(outsider, { profileType: "EXTERNAL", managementOrganizationUnitId: orgB.id });

    const list = await profiles.listProfiles(staff, { pageSize: "100" });
    assert.equal(list.profiles.some((item) => item.managementOrganization.id === orgB.id), false);
    assert.equal(list.total, await db.researcherProfile.count({ where: { managementOrganizationUnitId: orgA.id } }));
    await assert.rejects(() => profiles.listProfiles(staff, { organizationUnitId: orgB.id }), ForbiddenException);
    await assert.rejects(() => profiles.getProfile(staff, inB.id), ForbiddenException);
    await assert.rejects(() => profiles.getProfile(outsider, inA.id), ForbiddenException);

    await profiles.setStatus(staff, inA.id, "INACTIVE", contextVersion(inA));
    const inactive = await profiles.listProfiles(staff, { status: "INACTIVE", pageSize: "100" });
    assert.ok(inactive.profiles.some((item) => item.id === inA.id), "inactive profiles stay visible to managers");

    const revokedUser = await createUser({ role: "SCIENTIFIC_MANAGEMENT_STAFF", orgs: [orgA] });
    const revoked = await actorFor(revokedUser);
    const target = await profiles.getProfile(revoked, inA.id);
    await db.userOrganizationScope.deleteMany({ where: { userId: revokedUser.id } });
    await assert.rejects(() => profiles.updateProfile(revoked, inA.id, updateResearcherProfilePipe.transform({ contextVersion: contextVersion(target), position: "Sau khi mất phạm vi" })), ForbiddenException, "scope is re-checked inside the transaction");
  });
});
