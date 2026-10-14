import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedDatabase } from './helpers/disposable-database.mjs';
import { PrismaService } from '../dist/apps/api/infrastructure/prisma/prisma.service.js';
import { AuditLogService } from '../dist/apps/api/auth/audit-log.service.js';
import { EvaluationCoordinationService } from '../dist/apps/api/proposal-evaluations/evaluation-coordination.service.js';

// Trang điều phối đánh giá trên PostgreSQL thật: Trưởng phòng giao mảng cho chuyên viên, giao bù hồ sơ chưa có
// người phụ trách theo mảng, và mỗi người chỉ thấy đúng phần mình điều phối.
let database;
let db;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase('evaluation_coordination');
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

test('head assigns portfolios, unassigned proposals are assigned by portfolio, and each role sees only what it coordinates', async () => {
  const org = await db.organizationUnit.create({ data: { code: 'PHONG-KHQS', name: 'Phòng KHQS' } });
  for (const [code, name] of [['grassroots-level', 'Đề tài cấp Cơ sở'], ['ministry-level', 'Đề tài cấp Bộ Quốc phòng'], ['national-level', 'Đề tài cấp Quốc gia']]) {
    await db.catalogItem.create({ data: { type: 'proposal-type', code, name } });
  }
  const head = await createUser('truongphong', 'RESEARCH_MANAGEMENT_HEAD', org);
  const cvCoSo = await createUser('cv-coso', 'RESEARCH_MANAGEMENT_STAFF', org);
  const cvDanSu = await createUser('cv-dansu', 'RESEARCH_MANAGEMENT_STAFF', org);
  const cvDanSu2 = await createUser('cv-dansu2', 'RESEARCH_MANAGEMENT_STAFF', org);
  const pi = await createUser('chunhiem', 'RESEARCHER_INTERNAL_USER', org);
  const intake = await db.proposalIntakePeriod.create({ data: { code: 'DOT-C', title: 'Đợt C', startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), requiredPackage: [] } });
  const newProposal = (title, proposalTypeCode, militaryScope) =>
    db.researchProposal.create({ data: { intakePeriodId: intake.id, ownerId: pi.id, hostOrganizationUnitId: org.id, title, status: 'submitted', submittedAt: new Date(), proposalTypeCode, militaryScope } });
  const coSoQuanSu = await newProposal('Cơ sở – Quân sự', 'grassroots-level', 'military');
  const boDanSu = await newProposal('Bộ – Dân sự', 'ministry-level', 'civilian');
  const nhaNuocDanSu = await newProposal('Nhà nước – Dân sự', 'national-level', 'civilian');
  const boQuanSu = await newProposal('Bộ – Quân sự', 'ministry-level', 'military');

  const service = new EvaluationCoordinationService(db, new AuditLogService(db));
  const headActor = actorFor(head, org);

  await assert.rejects(() => service.setPortfolio(actorFor(cvCoSo, org), cvCoSo.id, { rules: [] }), { status: 403 });
  await assert.rejects(() => service.setPortfolio(headActor, cvCoSo.id, { rules: [{}] }), /cấp đề tài, tính chất/);
  await assert.rejects(() => service.setPortfolio(headActor, cvCoSo.id, { rules: [{ proposalLevel: 'khong-co' }] }), /danh mục/);
  await service.setPortfolio(headActor, cvCoSo.id, { rules: [{ proposalLevel: 'grassroots-level' }, { proposalLevel: 'grassroots-level' }] });
  await service.setPortfolio(headActor, cvDanSu.id, { rules: [{ militaryScope: 'civilian' }] });
  const listed = await service.setPortfolio(headActor, cvDanSu2.id, { rules: [{ militaryScope: 'civilian' }] });
  const coSoRules = listed.officers.find((officer) => officer.id === cvCoSo.id).rules;
  assert.deepEqual(coSoRules.map((rule) => rule.label), ['Đề tài cấp Cơ sở'], 'quy tắc trùng chỉ lưu một lần');

  const result = await service.autoAssignUnassigned(headActor);
  assert.deepEqual(result, { assigned: 3, unmatched: 1 }, 'Bộ – Quân sự không khớp mảng nào');
  const officerOf = async (proposal) => (await db.proposalManagementOfficer.findFirst({ where: { proposalId: proposal.id, status: 'ACTIVE' } }))?.officerUserId ?? null;
  assert.equal(await officerOf(coSoQuanSu), cvCoSo.id);
  assert.equal(await officerOf(boQuanSu), null);
  // Hai chuyên viên cùng mảng Dân sự: hồ sơ được chia cho người đang phụ trách ít hơn.
  assert.deepEqual([await officerOf(boDanSu), await officerOf(nhaNuocDanSu)].sort(), [cvDanSu.id, cvDanSu2.id].sort());

  const headView = await service.overview(headActor);
  assert.equal(headView.viewerRole, 'head');
  assert.equal(headView.proposals.length, 4);
  const unassignedRow = headView.proposals.find((row) => row.id === boQuanSu.id);
  assert.equal(unassignedRow.officer, null);
  assert.equal(unassignedRow.militaryScopeLabel, 'Quân sự');
  assert.equal(unassignedRow.proposalLevelLabel, 'Đề tài cấp Bộ Quốc phòng');

  const staffView = await service.overview(actorFor(cvCoSo, org));
  assert.equal(staffView.viewerRole, 'officer');
  assert.deepEqual(staffView.proposals.map((row) => row.id), [coSoQuanSu.id]);
  await assert.rejects(() => service.overview(actorFor(pi, org)), { status: 403 });

  const portfolios = await service.listPortfolios(headActor);
  assert.equal(portfolios.officers.find((officer) => officer.id === cvCoSo.id).activeProposalCount, 1);
});
