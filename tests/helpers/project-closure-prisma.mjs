// CSDL giả lập trong bộ nhớ cho kiểm thử nghiệm thu / kinh phí / thanh lý / đóng đề tài và thông báo.
// Chỉ hỗ trợ đúng các truy vấn các service này dùng; mọi truy vấn lạ đều ném lỗi để test không "đậu nhầm".
import { randomUUID } from "node:crypto";

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function matchValue(actual, condition) {
  if (condition === undefined) return true;
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    if (actual instanceof Date && condition instanceof Date) return actual.getTime() === condition.getTime();
    return actual === condition;
  }
  if ("in" in condition) return condition.in.includes(actual);
  if ("not" in condition) return !matchValue(actual, condition.not);
  if ("lte" in condition) return actual <= condition.lte;
  throw new Error(`Unsupported condition ${JSON.stringify(condition)}`);
}

function matches(row, where = {}, related = {}) {
  for (const [key, condition] of Object.entries(where)) {
    if (key === "NOT") { if (matches(row, condition, related)) return false; continue; }
    if (key === "OR") { if (!condition.some((item) => matches(row, item, related))) return false; continue; }
    if (condition && typeof condition === "object" && "some" in condition) {
      const rows = related[key]?.(row) ?? [];
      if (!rows.some((item) => matches(item, condition.some))) return false;
      continue;
    }
    if (!matchValue(row[key], condition)) return false;
  }
  return true;
}

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = (row[key] ?? 0) + value.increment;
    else row[key] = value;
  }
  row.updatedAt = new Date();
  return row;
}

function pick(row, select) {
  if (!select || !row) return row;
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

export function createClosureDb(options = {}) {
  const now = options.now ?? new Date();
  const t = {
    users: [], scopes: [], units: [{ id: "unit-1", code: "U1", name: "Khoa Nội", status: "active" }],
    proposals: [], projects: [], members: [], officers: [], milestones: [], checkpoints: [], reports: [], requests: [],
    history: [], acceptances: [], finances: [], disbursements: [], costItems: [], liquidations: [], files: [], profiles: [],
    auditLogs: [], notifications: [], counters: new Map(), supplementRequests: [], products: [], productReviews: [], superiors: []
  };
  const userName = (id) => t.users.find((user) => user.id === id) ?? null;
  const displayOf = (id) => (id ? { displayName: userName(id)?.displayName ?? id } : null);

  const projectView = (project, include) => {
    if (!project) return null;
    const view = clone(project);
    if (!include) return view;
    view.proposal = clone(t.proposals.find((proposal) => proposal.id === project.proposalId));
    view.hostOrganizationUnit = clone(t.units.find((unit) => unit.id === project.hostOrganizationUnitId));
    view.members = clone(t.members.filter((row) => row.projectId === project.id)).map((row) => ({ ...row, user: clone(userName(row.userId)) }));
    view.managementOfficers = clone(t.officers.filter((row) => row.projectId === project.id)).map((row) => ({ ...row, officer: clone(userName(row.officerUserId)) }));
    view.milestones = clone(t.milestones.filter((row) => row.projectId === project.id));
    view.checkpoints = clone(t.checkpoints.filter((row) => row.projectId === project.id));
    view.reports = clone(t.reports.filter((row) => row.projectId === project.id)).map((row) => ({ ...row, evidence: [] }));
    view.requests = clone(t.requests.filter((row) => row.projectId === project.id)).map((row) => ({ ...row, revisions: [], evidence: [] }));
    view.history = clone(t.history.filter((row) => row.projectId === project.id));
    view.baselines = [];
    view.healthAssessments = [];
    view.acceptances = clone(t.acceptances.filter((row) => row.projectId === project.id)).sort((a, b) => b.round - a.round).map((row) => ({ ...row, submittedBy: displayOf(row.submittedById), establishedBy: displayOf(row.establishedById), minutesRecordedBy: displayOf(row.minutesRecordedById) }));
    view.finance = clone(t.finances.find((row) => row.projectId === project.id) ?? null);
    const liquidation = t.liquidations.find((row) => row.projectId === project.id);
    view.liquidation = liquidation ? { ...clone(liquidation), preparedBy: displayOf(liquidation.preparedById), approvedBy: displayOf(liquidation.approvedById) } : null;
    view.products = clone(t.products.filter((row) => row.projectId === project.id)).sort((a, b) => a.position - b.position).map((row) => ({ ...row, reviews: clone(t.productReviews.filter((review) => review.productId === row.id)).sort((a, b) => b.round - a.round).map((review) => ({ ...review, formedBy: displayOf(review.formedById), recordedBy: displayOf(review.recordedById) })) }));
    const superior = t.superiors.find((row) => row.projectId === project.id);
    view.superiorAcceptance = superior ? { ...clone(superior), sentBy: displayOf(superior.sentById), resultRecordedBy: displayOf(superior.resultRecordedById) } : null;
    return view;
  };

  const table = (rows, extra = {}) => ({
    findMany: async ({ where, select, orderBy } = {}) => {
      let result = rows.filter((row) => matches(row, where));
      if (orderBy?.position) result = [...result].sort((a, b) => a.position - b.position);
      return clone(result.map((row) => pick(row, select)));
    },
    findFirst: async ({ where, select } = {}) => clone(pick(rows.find((row) => matches(row, where)) ?? null, select)),
    findUnique: async ({ where, include }) => {
      const row = rows.find((item) => matches(item, where)) ?? null;
      if (!row) return null;
      return include?.updatedBy ? { ...clone(row), updatedBy: displayOf(row.updatedById) } : clone(row);
    },
    create: async ({ data }) => { const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...clone(data) }; rows.push(row); return clone(row); },
    createMany: async ({ data }) => { for (const item of data) rows.push({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...clone(item) }); return { count: data.length }; },
    update: async ({ where, data }) => { const row = rows.find((item) => matches(item, where)); if (!row) throw new Error("update: not found"); return clone(applyData(row, clone(data))); },
    deleteMany: async ({ where }) => { let count = 0; for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index], where)) { rows.splice(index, 1); count += 1; } return { count }; },
    upsert: async ({ where, create, update }) => {
      const row = rows.find((item) => matches(item, where));
      if (row) return clone(applyData(row, clone(update)));
      const created = { createdAt: new Date(), updatedAt: new Date(), ...clone(create) };
      rows.push(created);
      return clone(created);
    },
    count: async ({ where } = {}) => rows.filter((row) => matches(row, where)).length,
    ...extra
  });

  const db = {
    tables: t,
    user: {
      ...table(t.users),
      findUnique: async ({ where, include }) => {
        const user = t.users.find((row) => row.id === where.id);
        if (!user) return null;
        return include?.organizationScopes ? { ...clone(user), organizationScopes: t.scopes.filter((scope) => scope.userId === user.id).map((scope) => ({ ...scope, organizationUnit: clone(t.units.find((unit) => unit.id === scope.organizationUnitId)) })) } : clone(user);
      },
      findMany: async ({ where, select } = {}) => clone(t.users.filter((user) => matches(user, where, { organizationScopes: (row) => t.scopes.filter((scope) => scope.userId === row.id) })).map((row) => pick(row, select)))
    },
    approvedProject: {
      findUnique: async ({ where, include }) => projectView(t.projects.find((row) => row.id === where.id || (where.proposalId && row.proposalId === where.proposalId)), include),
      findMany: async ({ where, include } = {}) => t.projects.filter((row) => matches(row, where)).map((row) => projectView(row, include)),
      update: async ({ where, data }) => { const row = t.projects.find((item) => item.id === where.id); return clone(applyData(row, clone(data))); }
    },
    researchProposal: table(t.proposals),
    projectManagementOfficer: table(t.officers),
    projectMilestone: table(t.milestones),
    projectHistory: table(t.history),
    projectAcceptance: table(t.acceptances),
    projectFinance: table(t.finances, { findUnique: async ({ where, include }) => { const row = t.finances.find((item) => item.projectId === where.projectId); return row ? (include?.updatedBy ? { ...clone(row), updatedBy: displayOf(row.updatedById) } : clone(row)) : null; } }),
    projectDisbursement: table(t.disbursements),
    projectCostItem: table(t.costItems),
    projectLiquidation: table(t.liquidations),
    projectProduct: table(t.products),
    projectProductReview: table(t.productReviews),
    projectSuperiorAcceptance: {
      ...table(t.superiors),
      findMany: async ({ where } = {}) => clone(t.superiors.filter((row) => matches(row, where)).map((row) => {
        const project = t.projects.find((item) => item.id === row.projectId);
        return { ...row, project: { code: project.code, title: project.title, managementOfficers: t.officers.filter((officer) => officer.projectId === project.id && officer.status === "ACTIVE") } };
      }))
    },
    fileRecord: table(t.files),
    researcherProfile: table(t.profiles),
    auditLog: { ...table(t.auditLogs), create: async ({ data }) => { const row = { id: randomUUID(), timestamp: new Date(), ...clone(data) }; t.auditLogs.push(row); return clone(row); } },
    userNotification: table(t.notifications),
    proposalSupplementRequest: table(t.supplementRequests),
    proposalReviewAssignment: { findMany: async () => [] },
    proposalReview: { findFirst: async () => null },
    async $transaction(work) { return work(db); },
    async $executeRaw() { return 1; },
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?");
      if (sql.includes("CURRENT_TIMESTAMP")) return [{ asOf: options.clock?.() ?? new Date() }];
      if (sql.includes("FOR UPDATE") || sql.includes("FOR SHARE")) return [];
      if (sql.includes("document_number_counters")) {
        const key = `${values[0]}:${values[1]}`;
        const next = (t.counters.get(key) ?? 0) + 1;
        t.counters.set(key, next);
        return [{ value: next }];
      }
      if (sql.includes("acceptance_council_metadata")) return [];
      throw new Error(`Unsupported raw query: ${sql}`);
    }
  };
  db.now = now;
  return db;
}

/** Đề tài mẫu đang thực hiện: chủ nhiệm, thành viên, chuyên viên phụ trách, chuyên viên khác, lãnh đạo, mốc đã hoàn thành. */
export function seedExecutingProject(db, overrides = {}) {
  const t = db.tables;
  const past = new Date(Date.now() - 86_400_000 * 30);
  const user = (id, systemRole, scoped = false, extra = {}) => { t.users.push({ id, username: id, displayName: `Người ${id}`, systemRole, status: "active", unit: "Khoa Nội", credentialEmail: `${id}@example.test`, ...extra }); if (scoped) t.scopes.push({ id: `scope-${id}`, userId: id, organizationUnitId: "unit-1" }); };
  user("pi", "RESEARCHER_INTERNAL_USER", true);
  user("member", "RESEARCHER_INTERNAL_USER", true);
  user("officer", "RESEARCH_MANAGEMENT_STAFF", true);
  user("staff2", "RESEARCH_MANAGEMENT_STAFF", true);
  user("head", "RESEARCH_MANAGEMENT_HEAD", true);
  user("leader", "LEADERSHIP_APPROVAL_AUTHORITY");
  user("outsider", "RESEARCH_MANAGEMENT_STAFF");
  t.proposals.push({ id: "proposal-1", code: "DT-01", title: "Đề tài thử nghiệm", ownerId: "pi", hostOrganizationUnitId: "unit-1", status: "approved", budgetMetadata: { amount: 120_000_000, approvedAmount: 100_000_000 } });
  t.projects.push({ id: "project-1", code: "DT-01", proposalId: "proposal-1", sourceSubmissionEventId: "e1", sourceDecisionId: "d1", hostOrganizationUnitId: "unit-1", title: "Đề tài thử nghiệm", scopeSnapshot: { budgetMetadata: { amount: 120_000_000 }, proposalTypeCode: overrides.level ?? "academy-level" }, planSnapshot: null, status: "executing", startDate: past, endDate: new Date(Date.now() + 86_400_000 * 60), aggregateVersion: 3, relationshipVersion: 1, conflictVersion: 0, delegationVersion: 0, authorizationContextUpdatedAt: past, createdById: "officer", createdAt: past, updatedAt: past, ...overrides.project });
  t.members.push({ id: "m-pi", projectId: "project-1", userId: "pi", name: "Chủ nhiệm", role: "TOPIC_PI", participationRole: "TOPIC_PI", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.members.push({ id: "m-member", projectId: "project-1", userId: "member", name: "Thành viên", role: "TOPIC_MEMBER", participationRole: "TOPIC_MEMBER", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.officers.push({ id: "o-1", projectId: "project-1", officerUserId: "officer", assignedById: "head", status: "ACTIVE", effectiveFrom: past, effectiveUntil: null, createdAt: past });
  t.milestones.push({ id: "ms-1", projectId: "project-1", title: "Thu thập số liệu", dueDate: past, status: overrides.milestoneStatus ?? "completed", position: 0, weightPercent: 100, progressPercent: 100 });
  if (overrides.productStatus !== null) t.products.push({ id: "prod-1", projectId: "project-1", position: 0, title: "Nội dung 1: Khảo sát thực trạng", productForm: 1, requirements: null, milestoneId: null, status: overrides.productStatus ?? "PASSED", submission: null, createdById: "officer", createdAt: past, updatedAt: past });
  for (const [id, fullName, linkedUserId] of [["prof-a", "GS. A", "ext-a"], ["prof-b", "PGS. B", null], ["prof-c", "TS. C", null], ["prof-d", "TS. D", null], ["prof-pi", "Chủ nhiệm", "pi"]]) {
    t.profiles.push({ id, fullName, title: "TS", status: "ACTIVE", linkedUserId, managementOrganizationUnitId: "unit-2", managementOrganizationUnit: { name: "Khoa khác" } });
  }
  t.users.push({ id: "ext-a", username: "ext-a", displayName: "GS. A", systemRole: "RESEARCHER_INTERNAL_USER", status: "active", unit: "Khoa khác", credentialEmail: null });
  const file = (id, purpose, uploadedById, projectId = "project-1") => t.files.push({ id, relatedEntityType: "approved_project", relatedEntityId: projectId, filePurpose: purpose, originalFileName: `${id}.pdf`, sizeBytes: 1000, uploadedById, status: "active", deletedAt: null });
  file("file-report", "acceptance_dossier", "pi");
  file("file-revision", "acceptance_dossier", "pi");
  file("file-voucher", "disbursement_voucher", "staff2");
  file("file-liquidation", "liquidation_record", "officer");
  file("file-other-project", "disbursement_voucher", "staff2", "project-2");
  file("file-product", "product_evidence", "pi");
  file("file-product-2", "product_evidence", "pi");
  file("file-panel-minutes", "product_review_minutes", "officer");
  file("file-superior-1", "superior_dossier", "officer");
  file("file-superior-letter", "superior_dossier", "officer");
  file("file-superior-result", "superior_dossier", "officer");
  return db;
}

export function actor(db, id) {
  const user = db.tables.users.find((row) => row.id === id);
  return { id: user.id, username: user.username, displayName: user.displayName, systemRole: user.systemRole, unit: user.unit, organizationScopes: db.tables.scopes.filter((scope) => scope.userId === id).map((scope) => ({ id: scope.organizationUnitId, code: "U1", name: "Khoa Nội" })) };
}
