import assert from "node:assert/strict";
import test from "node:test";
import { canCreateStudentProject, canDeleteStudentDocument, canManageStudentProject, canReadStudentProject, canRegisterStudentProject, studentProjectActions, studentProjectReadFilter } from "../dist/apps/api/student-research/student-research-access.js";
import { completeStudentProjectPipe, createStudentProjectPipe, registerStudentProjectPipe, transitionStudentProjectPipe, updateStudentProjectPipe } from "../dist/apps/api/student-research/dto/create-student-project.dto.js";
import { readStudentDocumentType } from "../dist/apps/api/student-research/dto/upload-student-document.dto.js";
import { StudentResearchService, STUDENT_RESEARCH_ENTITY_TYPE } from "../dist/apps/api/student-research/student-research.service.js";
import { FilesService } from "../dist/apps/api/modules/files/files.service.js";

// NCKH sinh viên: phân quyền, kiểm tra dữ liệu, vòng đời đăng ký → duyệt → thực hiện, tài liệu.

const actor = (id, systemRole, scopes = ["unit-a"]) => ({ id, username: id, displayName: id, systemRole, unit: "", organizationScopes: scopes.map((scope) => ({ id: scope, code: scope, name: scope })) });
const project = (overrides = {}) => ({ officerId: "officer", supervisorId: "teacher", organizationUnitId: "unit-a", status: "ACTIVE", createdById: "officer", ...overrides });

const teacher = actor("teacher", "RESEARCHER_INTERNAL_USER", []);
const otherTeacher = actor("other-teacher", "RESEARCHER_INTERNAL_USER", []);
const staff = actor("staff", "RESEARCH_MANAGEMENT_STAFF");
const staff2 = actor("staff2", "RESEARCH_MANAGEMENT_STAFF");
const head = actor("head", "RESEARCH_MANAGEMENT_HEAD");
const staffB = actor("staff-b", "RESEARCH_MANAGEMENT_STAFF", ["unit-b"]);
const leader = actor("leader", "LEADERSHIP_APPROVAL_AUTHORITY", []);
const oversight = actor("oversight", "RESEARCH_OVERSIGHT_AUTHORITY", []);
const external = actor("external", "EXTERNAL_RESEARCHER_USER", []);
const admin = actor("admin", "SYSTEM_ADMIN", []);

test("management needs the research-management staff role and the project's unit (or being its officer)", () => {
  assert.equal(canManageStudentProject(staff, project()), true);
  assert.equal(canManageStudentProject(head, project()), false, "Trưởng phòng không quản lý NCKH sinh viên");
  assert.equal(canManageStudentProject(staffB, project()), false);
  assert.equal(canManageStudentProject({ ...staffB, id: "officer" }, project({ organizationUnitId: null })), true);
  for (const user of [teacher, external, admin, leader]) assert.equal(canManageStudentProject(user, project()), false, user.systemRole);
});

test("drafts are private to the supervisor; later states are read only by managing staff and the supervisor", () => {
  const draft = project({ status: "DRAFT", officerId: null, createdById: "teacher" });
  assert.equal(canReadStudentProject(teacher, draft), true);
  for (const user of [staff, head, leader, oversight, otherTeacher, admin]) assert.equal(canReadStudentProject(user, draft), false, user.id);
  for (const status of ["SUBMITTED", "ACTIVE", "COMPLETED", "CANCELLED"]) {
    const current = project({ status, officerId: null });
    for (const user of [teacher, staff]) assert.equal(canReadStudentProject(user, current), true, `${user.id} ${status}`);
    for (const user of [head, leader, oversight, otherTeacher, external, admin, staffB]) assert.equal(canReadStudentProject(user, current), false, `${user.id} ${status}`);
  }
});

test("actions per status, with the supervisor never approving or completing their own project", () => {
  const sorted = (user, facts) => studentProjectActions(user, facts).sort();
  assert.deepEqual(sorted(teacher, project({ status: "DRAFT", officerId: null })), ["cancel", "document.upload", "edit", "submit"]);
  assert.deepEqual(sorted(teacher, project({ status: "SUBMITTED", officerId: null })), ["cancel", "document.upload"]);
  assert.deepEqual(sorted(staff, project({ status: "SUBMITTED", officerId: null })), ["approve", "cancel", "document.upload", "edit", "return"]);
  assert.deepEqual(sorted(teacher, project()), ["document.upload"]);
  assert.deepEqual(sorted(staff, project()), ["cancel", "complete", "document.upload", "edit"]);
  assert.deepEqual(sorted(leader, project()), []);
  assert.deepEqual(sorted(staff, project({ status: "COMPLETED" })), []);
  assert.deepEqual(sorted(staff, project({ status: "CANCELLED" })), []);
  // Chuyên viên là giảng viên hướng dẫn: làm việc của giảng viên, không tự duyệt/huỷ/hoàn thành.
  const own = project({ status: "SUBMITTED", supervisorId: "staff", officerId: null });
  assert.deepEqual(sorted(staff, own), ["cancel", "document.upload", "edit"]);
  assert.deepEqual(sorted(staff, project({ supervisorId: "staff" })), ["document.upload", "edit"]);
  assert.deepEqual(sorted(staff2, own), ["approve", "cancel", "document.upload", "edit", "return"]);
  assert.equal(canDeleteStudentDocument(teacher, project(), { uploadedById: "staff" }), false);
  assert.equal(canDeleteStudentDocument(staff, project(), { uploadedById: "teacher" }), true);
  assert.equal(canDeleteStudentDocument(teacher, project({ status: "COMPLETED" }), { uploadedById: "teacher" }), false);
});

test("creation, registration and list filter", () => {
  assert.equal(canCreateStudentProject(staff, "unit-a"), true);
  assert.equal(canCreateStudentProject(staff, "unit-b"), false);
  assert.equal(canCreateStudentProject(teacher, "unit-a"), false);
  for (const user of [teacher, staff]) assert.equal(canRegisterStudentProject(user), true, user.id);
  for (const user of [head, leader, external, admin, oversight]) assert.equal(canRegisterStudentProject(user), false, user.id);
  assert.equal(canCreateStudentProject(head, "unit-a"), false);
  assert.deepEqual(studentProjectReadFilter(teacher), { OR: [{ supervisorId: "teacher" }, { createdById: "teacher" }] });
  assert.deepEqual(studentProjectReadFilter(leader), { OR: [{ supervisorId: "leader" }, { createdById: "leader" }] });
  assert.deepEqual(studentProjectReadFilter(head), { OR: [{ supervisorId: "head" }, { createdById: "head" }] });
  assert.deepEqual(studentProjectReadFilter(staff), { OR: [{ supervisorId: "staff" }, { createdById: "staff" }, { AND: [{ status: { not: "DRAFT" } }, { OR: [{ officerId: "staff" }, { organizationUnitId: { in: ["unit-a"] } }] }] }] });
});

test("input validation", () => {
  const valid = { code: " SV-01 ", name: "Đề tài", studentName: "Nguyễn A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a", startDate: "2026-10-01", endDate: "2027-05-31", status: "COMPLETED", score: 10 };
  const parsed = createStudentProjectPipe.transform(valid);
  assert.equal(parsed.code, "SV-01");
  assert.equal(parsed.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal("status" in parsed || "score" in parsed, false, "no mass assignment");
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, code: " " }));
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, startDate: "01/10/2026" }));
  assert.throws(() => createStudentProjectPipe.transform({ ...valid, endDate: "2026-09-01" }));
  const registration = registerStudentProjectPipe.transform({ ...valid, code: "" });
  assert.equal("code" in registration, false, "mã do chuyên viên cấp khi duyệt");
  assert.equal("supervisorId" in registration, false, "giảng viên đăng ký luôn tự là người hướng dẫn");
  assert.throws(() => updateStudentProjectPipe.transform({ name: "x" }), /phiên bản/);
  assert.throws(() => updateStudentProjectPipe.transform({ version: "2026-10-10T00:00:00.000Z" }), /Không có thông tin/);
  assert.deepEqual(updateStudentProjectPipe.transform({ version: "2026-10-10T00:00:00.000Z", studentContact: "", endDate: "" }), { version: "2026-10-10T00:00:00.000Z", studentContact: null, endDate: null });
  assert.deepEqual(transitionStudentProjectPipe.transform({ version: "2026-10-10T00:00:00.000Z", reason: "  thiếu thuyết minh " }), { version: "2026-10-10T00:00:00.000Z", reason: "thiếu thuyết minh", code: undefined });
  const v = "2026-10-10T00:00:00.000Z";
  assert.deepEqual(completeStudentProjectPipe.transform({ score: "8.75", award: "Giải Nhất", version: v }), { score: 8.75, award: "Giải Nhất", version: v });
  assert.equal(completeStudentProjectPipe.transform({ score: 8.1, version: v }).score, 8.1, "8.1 × 100 is not exactly 810 in floating point");
  assert.throws(() => completeStudentProjectPipe.transform({ score: 85, version: v }));
  assert.throws(() => completeStudentProjectPipe.transform({ score: 8.123, version: v }));
  assert.throws(() => completeStudentProjectPipe.transform({ score: 8 }), /phiên bản/);
  assert.equal(readStudentDocumentType("final_report"), "FINAL_REPORT");
  assert.throws(() => readStudentDocumentType("Báo cáo giữa kỳ"));
});

// ---- Vòng đời đầy đủ trên cơ sở dữ liệu và kho tệp giả lập ----

function createFakes() {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 10, 0, 0, 0) + ++tick * 1000);
  const users = [teacher, otherTeacher, staff, staff2, head, staffB, leader, oversight, external, admin].map((user) => ({ id: user.id, displayName: user.displayName, username: user.username, systemRole: user.systemRole, status: "active", unit: "" }));
  let store = {
    projects: [], files: [], documents: [], events: [],
    units: [{ id: "unit-a", code: "A", name: "Khoa A", status: "active" }, { id: "unit-b", code: "B", name: "Khoa B", status: "active" }, { id: "unit-old", code: "O", name: "Cũ", status: "inactive" }]
  };
  const failures = { documentCreate: false };
  let ids = 0;
  const id = (prefix) => `${prefix}-${++ids}`;
  const user = (userId) => users.find((item) => item.id === userId) ?? null;
  const pick = (record, select) => record && select ? Object.fromEntries(Object.keys(select).map((key) => [key, record[key]])) : record;
  const join = (record, include = {}) => {
    if (!record) return null;
    const result = { ...record };
    if (include.supervisor) result.supervisor = pick(user(record.supervisorId), include.supervisor.select);
    if (include.officer) result.officer = record.officerId ? pick(user(record.officerId), include.officer.select) : null;
    if (include.organizationUnit) result.organizationUnit = pick(store.units.find((unit) => unit.id === record.organizationUnitId) ?? null, include.organizationUnit.select);
    if (include.documents) result.documents = store.documents.filter((doc) => doc.projectId === record.id).sort((a, b) => b.uploadedAt - a.uploadedAt).map((doc) => ({ ...doc, file: pick(store.files.find((file) => file.id === doc.fileId), include.documents.include.file.select), uploadedBy: pick(user(doc.uploadedById), { displayName: true }) }));
    if (include.events) result.events = store.events.filter((event) => event.projectId === record.id).sort((a, b) => b.createdAt - a.createdAt).map((event) => ({ ...event, actor: pick(user(event.actorId), { displayName: true }) }));
    return result;
  };
  const prisma = {
    get store() { return store; },
    failures,
    user: { findUnique: async ({ where }) => user(where.id), findMany: async () => users },
    organizationUnit: { findUnique: async ({ where }) => store.units.find((unit) => unit.id === where.id) ?? null, findMany: async () => store.units.filter((unit) => unit.status === "active") },
    studentResearchProject: {
      findUnique: async ({ where, include }) => join(store.projects.find((item) => item.id === where.id), include),
      findMany: async ({ include }) => store.projects.map((item) => join(item, include)),
      create: async ({ data }) => {
        if (data.code && store.projects.some((item) => item.code === data.code)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const created = { id: id("project"), score: null, award: null, ...data, createdAt: now(), updatedAt: now() };
        store.projects.push(created);
        return { ...created };
      },
      updateMany: async ({ where, data }) => {
        const target = store.projects.find((item) => item.id === where.id && item.status === where.status && (!where.updatedAt || item.updatedAt.getTime() === where.updatedAt.getTime()));
        if (!target) return { count: 0 };
        if (data.code && store.projects.some((item) => item.id !== target.id && item.code === data.code)) throw Object.assign(new Error("unique"), { code: "P2002" });
        Object.assign(target, data, { updatedAt: now() });
        return { count: 1 };
      }
    },
    fileRecord: {
      create: async ({ data }) => { const created = { ...data, deletedAt: null, createdAt: now(), updatedAt: now() }; store.files.push(created); return created; },
      update: async ({ where, data }) => Object.assign(store.files.find((file) => file.id === where.id), data),
      findUnique: async ({ where }) => store.files.find((file) => file.id === where.id) ?? null
    },
    studentResearchDocument: {
      create: async ({ data }) => { if (failures.documentCreate) throw new Error("db down"); const created = { id: id("doc"), ...data, uploadedAt: now() }; store.documents.push(created); return created; },
      findFirst: async ({ where }) => { const doc = store.documents.find((item) => item.id === where.id && item.projectId === where.projectId); return doc ? { ...doc, file: store.files.find((file) => file.id === doc.fileId) } : null; },
      delete: async ({ where }) => { store.documents = store.documents.filter((doc) => doc.id !== where.id); }
    },
    studentResearchEvent: { create: async ({ data }) => { store.events.push({ id: id("event"), ...data, createdAt: now() }); } },
    $queryRaw: async () => [],
    // Giao dịch: khôi phục toàn bộ dữ liệu nếu có lỗi.
    $transaction: async (work) => {
      const snapshot = structuredClone(store);
      try { return await work(prisma); } catch (error) { store = snapshot; throw error; }
    }
  };
  const objects = new Map();
  const storage = {
    objects,
    putObject: async ({ objectKey, content }) => { objects.set(objectKey, Buffer.from(content)); },
    getObject: async (objectKey) => { if (!objects.has(objectKey)) throw new Error("missing"); return objects.get(objectKey); },
    deleteObject: async (objectKey) => { objects.delete(objectKey); }
  };
  const audits = [];
  const auditLog = { record: async (entry) => { audits.push(entry); } };
  const service = new StudentResearchService(prisma, auditLog, storage, { allowedExtensions: [".pdf", ".docx"], maxFileSizeBytes: 1024 });
  return { service, prisma, storage, audits };
}

const pdf = (name = "phieu-dang-ky.pdf", content = "%PDF-1.4 test") => ({ originalname: name, mimetype: "application/pdf", size: Buffer.byteLength(content), buffer: Buffer.from(content) });
const registration = { name: "Khảo sát kháng sinh", studentName: "Nguyễn Văn A", studentClass: "Y6", studentContact: "0900000000", organizationUnitId: "unit-a" };

test("lifecycle: register → upload → submit → return → resubmit → approve → active, with draft privacy and stale-version protection", async () => {
  const { service, prisma, storage } = createFakes();
  const draft = await service.register(teacher, registration);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.code, null);
  assert.equal(draft.supervisorId, "teacher");
  assert.equal(draft.studentContact, "0900000000");
  await assert.rejects(() => service.register(external, registration), /nội bộ/);
  await assert.rejects(() => service.register(teacher, { ...registration, organizationUnitId: "unit-old" }), /ngừng hoạt động/);

  // Bản nháp chỉ giảng viên thấy.
  for (const user of [staff, leader, head, otherTeacher]) {
    assert.equal((await service.findAll(user)).length, 0, user.id);
    await assert.rejects(() => service.findOne(user, draft.id), /Không tìm thấy/);
  }

  // Tài liệu: tải lên, kiểm tra định dạng.
  await service.uploadDocument(teacher, draft.id, "REGISTRATION", pdf());
  await assert.rejects(() => service.uploadDocument(teacher, draft.id, "OTHER", { ...pdf("virus.exe"), mimetype: "application/octet-stream" }), /Định dạng/);
  await assert.rejects(() => service.uploadDocument(teacher, draft.id, "OTHER", { ...pdf("a.pdf"), mimetype: "text/html" }), /MIME/);
  await assert.rejects(() => service.uploadDocument(teacher, draft.id, "OTHER", pdf("big.pdf", "x".repeat(2000))), /Dung lượng/);
  await assert.rejects(() => service.uploadDocument(teacher, draft.id, "OTHER", undefined), /Chưa chọn tệp/);
  assert.equal(storage.objects.size, 1);
  assert.equal(prisma.store.files[0].relatedEntityType, STUDENT_RESEARCH_ENTITY_TYPE);

  // Sửa bản nháp; phiên bản cũ bị từ chối.
  const edited = await service.update(teacher, draft.id, { version: draft.version, name: "Khảo sát kháng sinh 2026" });
  assert.equal(edited.name, "Khảo sát kháng sinh 2026");
  await assert.rejects(() => service.update(teacher, draft.id, { version: draft.version, studentClass: "Y5" }), /người khác cập nhật/);
  await assert.rejects(() => service.update(teacher, draft.id, { version: edited.version, supervisorId: "other-teacher" }), /đổi giảng viên/);
  await assert.rejects(() => service.update(teacher, draft.id, { version: edited.version, code: "SV-SELF" }), /chuyên viên QLKH cấp/);

  // Nộp: giảng viên không sửa được nữa; chuyên viên đơn vị thấy, đơn vị khác không.
  const submitted = await service.transition(teacher, draft.id, "submit", { version: edited.version });
  assert.equal(submitted.status, "SUBMITTED");
  await assert.rejects(() => service.update(teacher, draft.id, { version: submitted.version, name: "x" }), /quyền sửa/);
  assert.equal((await service.findAll(staff)).length, 1);
  assert.equal((await service.findAll(staffB)).length, 0);
  assert.equal((await service.findAll(leader)).length, 0);
  assert.equal((await service.findAll(head)).length, 0);
  assert.deepEqual((await service.findOne(staff, draft.id)).viewer.actions.sort(), ["approve", "cancel", "document.upload", "edit", "return"]);

  // Trả lại cần lý do; sau khi trả lại, bản nháp lại riêng tư.
  await assert.rejects(() => service.transition(staff, draft.id, "return", { version: submitted.version }), /lý do/);
  await assert.rejects(() => service.transition(teacher, draft.id, "approve", { version: submitted.version, code: "SV-01" }), /Chỉ chuyên viên/);
  const returned = await service.transition(staff, draft.id, "return", { version: submitted.version, reason: "Bổ sung thuyết minh" });
  assert.deepEqual(returned, { id: draft.id, status: "DRAFT", visible: false });
  await assert.rejects(() => service.findOne(staff, draft.id), /Không tìm thấy/);
  const teacherView = await service.findOne(teacher, draft.id);
  assert.equal(teacherView.events.find((event) => event.action === "return").reason, "Bổ sung thuyết minh");

  await service.uploadDocument(teacher, draft.id, "PROPOSAL", pdf("thuyet-minh.pdf"));
  const resubmitted = await service.transition(teacher, draft.id, "submit", { version: (await service.findOne(teacher, draft.id)).version });

  // Duyệt cần mã, mã không trùng; người duyệt thành chuyên viên quản lý.
  await assert.rejects(() => service.transition(staff, draft.id, "approve", { version: resubmitted.version }), /cấp mã/);
  await service.create(staff2, { code: "SV-TAKEN", name: "Khác", studentName: "B", studentClass: "Y4", supervisorId: "other-teacher", organizationUnitId: "unit-a" });
  await assert.rejects(() => service.transition(staff, draft.id, "approve", { version: resubmitted.version, code: "SV-TAKEN" }), /đã được dùng/);
  const active = await service.transition(staff, draft.id, "approve", { version: resubmitted.version, code: "SV-2026-01" });
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.code, "SV-2026-01");
  assert.equal(active.officer.id, "staff");
  assert.deepEqual(active.events.map((event) => event.action).reverse(), ["register", "document.upload", "update", "submit", "return", "document.upload", "submit", "approve"]);

  // Đang thực hiện: giảng viên chỉ tải tài liệu; không huỷ, không sửa.
  assert.deepEqual(active.viewer.actions, ["edit", "cancel", "complete", "document.upload"]);
  const teacherActive = await service.findOne(teacher, draft.id);
  assert.deepEqual(teacherActive.viewer.actions, ["document.upload"]);
  await assert.rejects(() => service.transition(teacher, draft.id, "cancel", { version: active.version, reason: "x" }), /quyền huỷ/);
  assert.equal((await service.findOne(staff, draft.id)).studentContact, "0900000000");
  await assert.rejects(() => service.findOne(leader, draft.id), /Không tìm thấy/);
});

test("documents: download by readers only, delete by uploader or manager, file rows kept as deleted", async () => {
  const { service, prisma, storage, audits } = createFakes();
  const created = await service.create(staff, { code: "SV-1", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  await service.uploadDocument(teacher, created.id, "PROGRESS_REPORT", pdf("tien-do.pdf", "%PDF tien do"));
  await service.uploadDocument(staff, created.id, "EVALUATION", pdf("danh-gia.pdf"));
  const [evaluation, progress] = (await service.findOne(teacher, created.id)).documents;
  assert.equal(evaluation.canDelete, false, "giảng viên không xoá tài liệu của chuyên viên");
  assert.equal(progress.canDelete, true);

  const download = await service.downloadDocument(staff2, created.id, progress.id);
  assert.equal(download.fileName, "tien-do.pdf");
  assert.equal(download.content.toString(), "%PDF tien do");
  assert.ok(audits.some((entry) => entry.action === "download-student-research-document" && entry.actorId === "staff2"));
  for (const user of [otherTeacher, staffB, admin, leader, head]) await assert.rejects(() => service.downloadDocument(user, created.id, progress.id), /Không tìm thấy/);
  // Tài liệu phải thuộc đúng đề tài trong đường dẫn.
  const other = await service.create(staff, { code: "SV-2", name: "Khác", studentName: "B", studentClass: "Y6", supervisorId: "other-teacher", organizationUnitId: "unit-a" });
  await assert.rejects(() => service.downloadDocument(staff, other.id, progress.id), /Không tìm thấy tài liệu/);

  await assert.rejects(() => service.deleteDocument(teacher, created.id, evaluation.id), /người tải lên/);
  await service.deleteDocument(teacher, created.id, progress.id);
  assert.equal(prisma.store.files.find((file) => file.id === progress.file.id).status, "deleted");
  await assert.rejects(() => service.downloadDocument(staff, created.id, progress.id), /Không tìm thấy tài liệu/);
  await service.deleteDocument(staff, created.id, evaluation.id);
  assert.equal((await service.findOne(staff, created.id)).documents.length, 0);
  assert.equal(storage.objects.size, 2, "nội dung giữ trong kho để đối chiếu nhật ký");

  // Đề tài đã kết thúc không nhận tài liệu mới.
  const current = await service.findOne(staff, created.id);
  await service.complete(staff, created.id, { score: 9, version: current.version });
  await assert.rejects(() => service.uploadDocument(teacher, created.id, "OTHER", pdf()), /chưa kết thúc/);
});

test("upload failure after storing the object rolls back the database and removes the object", async () => {
  const { service, prisma, storage } = createFakes();
  const created = await service.create(staff, { code: "SV-1", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  prisma.failures.documentCreate = true;
  await assert.rejects(() => service.uploadDocument(teacher, created.id, "OTHER", pdf()), /db down/);
  assert.equal(storage.objects.size, 0);
  assert.equal(prisma.store.files.length, 0);
  assert.equal(prisma.store.events.filter((event) => event.action === "document.upload").length, 0);
});

test("conflict of interest, cancellation and completion", async () => {
  const { service } = createFakes();
  // Chuyên viên tự đăng ký hướng dẫn: không tự duyệt; chuyên viên khác duyệt.
  const own = await service.register(staff, { ...registration, name: "Đề tài chuyên viên hướng dẫn" });
  const ownSubmitted = await service.transition(staff, own.id, "submit", { version: own.version });
  await assert.rejects(() => service.transition(staff, own.id, "approve", { version: ownSubmitted.version, code: "SV-9" }), /không phải giảng viên hướng dẫn/);
  const approved = await service.transition(staff2, own.id, "approve", { version: ownSubmitted.version, code: "SV-9" });
  await assert.rejects(() => service.complete(staff, own.id, { version: approved.version }), /không phải giảng viên hướng dẫn/);
  await assert.rejects(() => service.transition(staff, own.id, "cancel", { version: approved.version, reason: "x" }), /quyền huỷ/);

  // Huỷ cần lý do; đề tài huỷ không thao tác thêm được.
  await assert.rejects(() => service.transition(head, own.id, "cancel", { version: approved.version, reason: "x" }), /Không tìm thấy/);
  await assert.rejects(() => service.transition(staff2, own.id, "cancel", { version: approved.version }), /lý do/);
  const cancelled = await service.transition(staff2, own.id, "cancel", { version: approved.version, reason: "Sinh viên thôi học" });
  assert.equal(cancelled.status, "CANCELLED");
  assert.deepEqual(cancelled.viewer.actions, []);
  await assert.rejects(() => service.complete(staff2, own.id, { version: cancelled.version }), /đang thực hiện/);

  // Giảng viên rút đăng ký đã nộp.
  const draft = await service.register(teacher, registration);
  const submitted = await service.transition(teacher, draft.id, "submit", { version: draft.version });
  const withdrawn = await service.transition(teacher, draft.id, "cancel", { version: submitted.version, reason: "Đổi hướng nghiên cứu" });
  assert.equal(withdrawn.status, "CANCELLED");

  // Hoàn thành: hai người bấm cùng lúc thì một người nhận lỗi phiên bản.
  const active = await service.create(staff, { code: "SV-10", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  const done = await service.complete(staff, active.id, { score: 8.5, award: "Giải Nhì", version: active.version });
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.score, 8.5);
  await assert.rejects(() => service.complete(staff2, active.id, { version: active.version }), /đang thực hiện/);
});

test("managers edit active projects within their scope; moving a project out of scope is refused", async () => {
  const { service } = createFakes();
  const active = await service.create(staff, { code: "SV-1", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  const edited = await service.update(staff, active.id, { version: active.version, supervisorId: "other-teacher", endDate: new Date("2027-06-30T00:00:00.000Z") });
  assert.equal(edited.supervisor.id, "other-teacher");
  await assert.rejects(() => service.update(staff, active.id, { version: edited.version, organizationUnitId: "unit-b" }), /phạm vi/);
  await assert.rejects(() => service.update(staff, active.id, { version: edited.version, startDate: new Date("2027-07-01T00:00:00.000Z") }), /Ngày kết thúc/);
  await assert.rejects(() => service.update(teacher, active.id, { version: edited.version, name: "x" }), /Không tìm thấy|quyền sửa/);
  const unchanged = await service.update(staff, active.id, { version: edited.version, name: "Đề tài" });
  assert.equal(unchanged.version, edited.version, "không ghi khi không có gì thay đổi");
});

test("the generic file endpoints refuse student-research files (they are served only through this module)", async () => {
  const record = { id: "f1", relatedEntityType: STUDENT_RESEARCH_ENTITY_TYPE, relatedEntityId: "p1", filePurpose: "STUDENT_OTHER", originalFileName: "a.pdf", status: "active", deletedAt: null, storageObjectKey: "k", uploadedById: "teacher" };
  const prisma = { fileRecord: { findUnique: async () => record } };
  const files = new FilesService(prisma, { getObject: async () => Buffer.from("x"), putObject: async () => {} }, { record: async () => {} }, {}, {});
  await assert.rejects(() => files.downloadFile(teacher, "f1"), /chưa được hỗ trợ/);
  await assert.rejects(() => files.listFiles(teacher, { relatedEntityType: STUDENT_RESEARCH_ENTITY_TYPE, relatedEntityId: "p1" }), /chưa được hỗ trợ/);
});

test("review fixes: a supervising officer cannot hand the project away to approve it, nor make themselves supervisor", async () => {
  const { service } = createFakes();
  const own = await service.register(staff, { ...registration, name: "Đề tài do chuyên viên hướng dẫn" });
  const submitted = await service.transition(staff, own.id, "submit", { version: own.version });
  await assert.rejects(() => service.update(staff, own.id, { version: submitted.version, supervisorId: "teacher" }), /không phải giảng viên hướng dẫn/);
  await assert.rejects(() => service.transition(staff, own.id, "approve", { version: submitted.version, code: "SV-X" }), /không phải giảng viên hướng dẫn/);
  const active = await service.create(staff, { code: "SV-2", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  await assert.rejects(() => service.update(staff, active.id, { version: active.version, supervisorId: "staff" }), /không phải giảng viên hướng dẫn/);
  // Người quản lý độc lập vẫn đổi được.
  const moved = await service.update(staff2, active.id, { version: active.version, supervisorId: "other-teacher" });
  assert.equal(moved.supervisor.id, "other-teacher");
});

test("review fixes: legacy links to other records' files are listed but never served or deleted here; supervisor cleans own draft", async () => {
  const { service, prisma } = createFakes();
  const active = await service.create(staff, { code: "SV-1", name: "Đề tài", studentName: "A", studentClass: "Y6", supervisorId: "teacher", organizationUnitId: "unit-a" });
  // Bản ghi cũ: tài liệu trỏ tới tệp của một hồ sơ đề xuất.
  prisma.store.files.push({ id: "proposal-file", relatedEntityType: "research_proposal", relatedEntityId: "proposal-1", originalFileName: "thuyet-minh-de-xuat.pdf", mimeType: "application/pdf", sizeBytes: 10, status: "active", deletedAt: null, storageObjectKey: "research-proposals/proposal-1/x.pdf", uploadedById: "staff" });
  prisma.store.documents.push({ id: "legacy-doc", projectId: active.id, documentType: "OTHER", fileId: "proposal-file", uploadedById: "staff", uploadedAt: new Date() });
  const view = await service.findOne(staff, active.id);
  const legacy = view.documents.find((doc) => doc.id === "legacy-doc");
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.canDelete, false);
  await assert.rejects(() => service.downloadDocument(staff, active.id, "legacy-doc"), /Không tìm thấy tài liệu/);
  await assert.rejects(() => service.deleteDocument(staff, active.id, "legacy-doc"), /Không tìm thấy tài liệu/);
  assert.equal(prisma.store.files.find((file) => file.id === "proposal-file").status, "active");

  // Tài liệu chuyên viên tải lúc chờ duyệt: sau khi trả lại, giảng viên xoá được trong bản nháp của mình.
  const draft = await service.register(teacher, registration);
  const submitted = await service.transition(teacher, draft.id, "submit", { version: draft.version });
  await service.uploadDocument(staff, draft.id, "EVALUATION", pdf("gop-y.pdf"));
  await service.transition(staff, draft.id, "return", { version: (await service.findOne(staff, draft.id)).version, reason: "Xem góp ý" });
  const back = await service.findOne(teacher, draft.id);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(back.documents[0].canDelete, true);
  await service.deleteDocument(teacher, draft.id, back.documents[0].id);
});
