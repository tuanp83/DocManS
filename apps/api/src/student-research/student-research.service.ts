import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import type { ObjectStorage } from "../infrastructure/minio/minio-object-storage.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { assertValidUpload, defaultFileConfig, readUploadFileName, type FileModuleConfig } from "../modules/files/file-validation.js";
import type { CompleteStudentProjectDto, CreateStudentProjectDto, RegisterStudentProjectDto, TransitionStudentProjectDto, UpdateStudentProjectDto } from "./dto/create-student-project.dto.js";
import type { StudentDocumentType } from "./dto/upload-student-document.dto.js";
import {
  canCreateStudentProject,
  canDeleteStudentDocument,
  canManageStudentProject,
  canReadStudentProject,
  canRegisterStudentProject,
  canSeeStudentContact,
  canStudentProject,
  studentProjectActions,
  studentProjectReadFilter,
  SUPERVISOR_ROLES,
  type StudentProjectAction,
  type StudentProjectFacts
} from "./student-research-access.js";

type AnyRecord = Record<string, any>;

/** Loại thực thể của tệp NCKH sinh viên. Dịch vụ tệp chung không nhận loại này, nên tệp chỉ đi qua module này. */
export const STUDENT_RESEARCH_ENTITY_TYPE = "student-research-project";

export type UploadedStudentFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

type TransitionAction = "submit" | "approve" | "return" | "cancel";

const TRANSITIONS: Record<TransitionAction, { to: string; reasonRequired: boolean; message: string }> = {
  submit: { to: "SUBMITTED", reasonRequired: false, message: "Chỉ giảng viên hướng dẫn nộp được bản nháp của mình." },
  approve: { to: "ACTIVE", reasonRequired: false, message: "Chỉ chuyên viên QLKH của đơn vị (không phải giảng viên hướng dẫn) duyệt được đề tài đã nộp." },
  return: { to: "DRAFT", reasonRequired: true, message: "Chỉ chuyên viên QLKH của đơn vị (không phải giảng viên hướng dẫn) trả lại được đề tài đã nộp." },
  cancel: { to: "CANCELLED", reasonRequired: true, message: "Không có quyền huỷ đề tài ở trạng thái hiện tại." }
};

const PROJECT_INCLUDE = {
  supervisor: { select: { id: true, displayName: true, username: true } },
  officer: { select: { id: true, displayName: true } },
  organizationUnit: { select: { id: true, code: true, name: true } }
};

const DETAIL_INCLUDE = {
  ...PROJECT_INCLUDE,
  documents: {
    include: {
      // Chỉ thông tin hiển thị của tệp; không trả khoá lưu trữ.
      file: { select: { id: true, originalFileName: true, mimeType: true, sizeBytes: true, status: true, relatedEntityType: true, relatedEntityId: true } },
      uploadedBy: { select: { displayName: true } }
    },
    orderBy: { uploadedAt: "desc" }
  },
  events: { include: { actor: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }
};

/** Tệp do module này lưu cho đúng đề tài này (không phải tệp của hồ sơ đề xuất/đề tài khác gắn theo cách cũ). */
function isOwnFile(file: AnyRecord | null | undefined, projectId: string) {
  return !!file && file.relatedEntityType === STUDENT_RESEARCH_ENTITY_TYPE && file.relatedEntityId === projectId;
}

/** Khoá dòng đề tài trong giao dịch để thao tác tài liệu không chen giữa lúc đề tài đổi trạng thái. */
async function lockProject(client: any, projectId: string) {
  await client.$queryRaw`SELECT id FROM student_research_projects WHERE id = ${projectId} FOR UPDATE`;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

@Injectable()
export class StudentResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: ObjectStorage,
    private readonly fileConfig: FileModuleConfig = defaultFileConfig()
  ) {}

  private get db() {
    return this.prisma as any;
  }

  /** Bản trình bày theo người xem: ẩn liên lạc của sinh viên, kèm thao tác được phép. */
  private present(actor: SafeUserContext, project: AnyRecord) {
    const facts = project as StudentProjectFacts;
    const actions = studentProjectActions(actor, facts);
    const canManage = project.status !== "DRAFT" && canManageStudentProject(actor, facts);
    const documents = project.documents?.filter((document: AnyRecord) => !document.file || document.file.status === "active").map((document: AnyRecord) => {
      // Tài liệu gắn theo cách cũ (tệp thuộc hồ sơ/đề tài khác): chỉ hiện tên, không tải về hay xoá qua module này.
      const own = isOwnFile(document.file, project.id);
      return {
        id: document.id,
        documentType: document.documentType,
        uploadedAt: document.uploadedAt,
        uploadedById: document.uploadedById,
        uploadedBy: document.uploadedBy ?? null,
        file: document.file ? { id: document.file.id, originalFileName: document.file.originalFileName, mimeType: document.file.mimeType, sizeBytes: document.file.sizeBytes } : null,
        legacy: !own,
        canDelete: own && canDeleteStudentDocument(actor, facts, document as { uploadedById: string })
      };
    });
    const events = project.events?.map((event: AnyRecord) => ({ id: event.id, action: event.action, fromStatus: event.fromStatus, toStatus: event.toStatus, reason: event.reason, actor: event.actor ?? null, createdAt: event.createdAt }));
    const { documents: _documents, events: _events, ...rest } = project;
    return {
      ...rest,
      studentContact: canSeeStudentContact(actor, facts) ? project.studentContact : null,
      version: iso(project.updatedAt),
      ...(documents ? { documents } : {}),
      ...(events ? { events } : {}),
      viewer: { canManage, canAttach: actions.includes("document.upload"), actions }
    };
  }

  private async load(actor: SafeUserContext, id: string, include: AnyRecord = PROJECT_INCLUDE) {
    const project = await this.db.studentResearchProject.findUnique({ where: { id }, include });
    // Không phân biệt "không tồn tại" và "không có quyền" để không lộ sự tồn tại của đề tài.
    if (!project || !canReadStudentProject(actor, project)) throw new NotFoundException({ message: "Không tìm thấy đề tài." });
    return project;
  }

  private async assertSupervisor(supervisorId: string) {
    const supervisor = await this.db.user.findUnique({ where: { id: supervisorId } });
    if (!supervisor || supervisor.status !== "active" || !SUPERVISOR_ROLES.includes(supervisor.systemRole)) throw new BadRequestException({ message: "Giảng viên hướng dẫn phải là tài khoản nội bộ đang hoạt động." });
    return supervisor;
  }

  private async assertActiveUnit(organizationUnitId: string) {
    const unit = await this.db.organizationUnit.findUnique({ where: { id: organizationUnitId } });
    if (!unit || unit.status !== "active") throw new BadRequestException({ message: "Đơn vị quản lý không tồn tại hoặc đã ngừng hoạt động." });
    return unit;
  }

  private async recordEvent(client: any, projectId: string, actor: SafeUserContext, action: string, extra: { fromStatus?: string | null; toStatus?: string | null; reason?: string | null; facts?: AnyRecord } = {}) {
    await client.studentResearchEvent.create({ data: { projectId, actorId: actor.id, action, fromStatus: extra.fromStatus ?? null, toStatus: extra.toStatus ?? null, reason: extra.reason ?? null, facts: extra.facts ?? undefined } });
  }

  /**
   * Cập nhật có điều kiện: chỉ ghi khi trạng thái và phiên bản (updatedAt) vẫn như lúc người dùng xem, để hai người
   * thao tác cùng lúc không ghi đè nhau. Trả về false nếu đề tài đã đổi.
   */
  private async guardedUpdate(client: any, project: AnyRecord, version: string | undefined, data: AnyRecord) {
    const where: AnyRecord = { id: project.id, status: project.status };
    if (version) where.updatedAt = new Date(version);
    try {
      const result = await client.studentResearchProject.updateMany({ where, data: { ...data, updatedAt: new Date() } });
      return result.count === 1;
    } catch (error) {
      const code = String((error as AnyRecord)?.code ?? "");
      if (code === "P2002") throw new ConflictException({ message: "Mã đề tài đã được dùng cho đề tài khác." });
      // Dữ liệu cũ vi phạm ràng buộc (NOT VALID vẫn kiểm tra khi cập nhật), ví dụ ngày kết thúc trước ngày bắt đầu.
      if (/23514|check constraint/i.test(code + String((error as AnyRecord)?.message ?? ""))) throw new BadRequestException({ message: "Dữ liệu đề tài (mã, ngày hoặc điểm) chưa hợp lệ; cần sửa trước khi thực hiện thao tác này." });
      throw error;
    }
  }

  private stale(): never {
    throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài vừa được người khác cập nhật. Vui lòng tải lại trang." });
  }

  private assertVersion(project: AnyRecord, version: string | undefined) {
    if (version && iso(project.updatedAt) !== version) this.stale();
  }

  // ---- Tạo và đăng ký ----

  /** Chuyên viên tạo trực tiếp đề tài đã được duyệt (đang thực hiện). */
  async create(actor: SafeUserContext, input: CreateStudentProjectDto) {
    if (!canCreateStudentProject(actor, input.organizationUnitId)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chuyên viên QLKH có phạm vi đơn vị được tạo đề tài NCKH sinh viên." });
    const supervisor = await this.assertSupervisor(input.supervisorId);
    await this.assertActiveUnit(input.organizationUnitId);
    let project: AnyRecord;
    try {
      project = await this.db.$transaction(async (tx: any) => {
        const created = await tx.studentResearchProject.create({
          data: {
            code: input.code, name: input.name, studentName: input.studentName, studentClass: input.studentClass, studentContact: input.studentContact ?? null,
            supervisorId: supervisor.id, organizationUnitId: input.organizationUnitId, officerId: actor.id, createdById: actor.id,
            startDate: input.startDate ?? null, endDate: input.endDate ?? null, status: "ACTIVE"
          }
        });
        await this.recordEvent(tx, created.id, actor, "create", { toStatus: "ACTIVE" });
        return created;
      });
    } catch (error) {
      if ((error as AnyRecord)?.code === "P2002") throw new ConflictException({ message: `Mã đề tài ${input.code} đã tồn tại.` });
      throw error;
    }
    await this.auditLog.record({ action: "create-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, afterFacts: { code: project.code, supervisorId: supervisor.id, organizationUnitId: input.organizationUnitId } });
    return this.findOne(actor, project.id);
  }

  /** Giảng viên đăng ký đề tài: bản nháp, tự là giảng viên hướng dẫn. */
  async register(actor: SafeUserContext, input: RegisterStudentProjectDto) {
    if (!canRegisterStudentProject(actor)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ nghiên cứu viên nội bộ hoặc chuyên viên QLKH được đăng ký hướng dẫn đề tài NCKH sinh viên." });
    await this.assertSupervisor(actor.id);
    await this.assertActiveUnit(input.organizationUnitId);
    const project: AnyRecord = await this.db.$transaction(async (tx: any) => {
        const created = await tx.studentResearchProject.create({
          data: {
            code: null, name: input.name, studentName: input.studentName, studentClass: input.studentClass, studentContact: input.studentContact ?? null,
            supervisorId: actor.id, organizationUnitId: input.organizationUnitId, officerId: null, createdById: actor.id,
            startDate: input.startDate ?? null, endDate: input.endDate ?? null, status: "DRAFT"
          }
        });
        await this.recordEvent(tx, created.id, actor, "register", { toStatus: "DRAFT" });
        return created;
    });
    await this.auditLog.record({ action: "register-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, afterFacts: { organizationUnitId: input.organizationUnitId } });
    return this.findOne(actor, project.id);
  }

  // ---- Đọc ----

  async findAll(actor: SafeUserContext) {
    const projects = await this.db.studentResearchProject.findMany({ where: studentProjectReadFilter(actor), include: PROJECT_INCLUDE, orderBy: { createdAt: "desc" } });
    return projects.filter((project: AnyRecord) => canReadStudentProject(actor, project as StudentProjectFacts)).map((project: AnyRecord) => this.present(actor, project));
  }

  async findOne(actor: SafeUserContext, id: string) {
    return this.present(actor, await this.load(actor, id, DETAIL_INCLUDE));
  }

  /** Danh sách giảng viên có thể hướng dẫn (cho biểu mẫu của người quản lý). */
  async supervisorCandidates(actor: SafeUserContext) {
    if (!actor.organizationScopes?.length || actor.systemRole !== "RESEARCH_MANAGEMENT_STAFF") throw new ForbiddenException({ code: "ACTION_NOT_GRANTED" });
    return this.db.user.findMany({ where: { status: "active", systemRole: { in: SUPERVISOR_ROLES } }, select: { id: true, displayName: true, username: true, unit: true }, orderBy: { displayName: "asc" }, take: 500 });
  }

  /** Đơn vị quản lý để giảng viên chọn khi đăng ký. */
  async organizationUnits(actor: SafeUserContext) {
    if (!canRegisterStudentProject(actor)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED" });
    return this.db.organizationUnit.findMany({ where: { status: "active" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
  }

  // ---- Sửa ----

  async update(actor: SafeUserContext, id: string, input: UpdateStudentProjectDto) {
    const project = await this.load(actor, id);
    if (!canStudentProject(actor, project, "edit")) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Không có quyền sửa đề tài ở trạng thái hiện tại." });
    this.assertVersion(project, input.version);
    const manager = project.status !== "DRAFT" && canManageStudentProject(actor, project);

    const data: AnyRecord = {};
    for (const key of ["code", "name", "studentName", "studentClass", "studentContact", "startDate", "endDate"] as const) if (key in input) data[key] = (input as AnyRecord)[key];
    // Mã đề tài do người quản lý cấp; giảng viên không tự đặt mã cho bản nháp.
    if ("code" in data && data.code !== project.code && !manager) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Mã đề tài do chuyên viên QLKH cấp khi duyệt." });
    if (input.supervisorId !== undefined && input.supervisorId !== project.supervisorId) {
      // Đổi giảng viên hướng dẫn là việc của người quản lý độc lập: người đang hướng dẫn không tự chuyển đề tài đi
      // (rồi tự duyệt), và không ai tự đặt mình làm người hướng dẫn của đề tài mình quản lý.
      if (!manager || project.supervisorId === actor.id || input.supervisorId === actor.id) throw new ForbiddenException({ code: "CONFLICT_DENIED", message: "Chỉ chuyên viên quản lý không phải giảng viên hướng dẫn (cũ hoặc mới) được đổi giảng viên hướng dẫn." });
      await this.assertSupervisor(input.supervisorId);
      data.supervisorId = input.supervisorId;
    }
    if (input.organizationUnitId !== undefined && input.organizationUnitId !== project.organizationUnitId) {
      await this.assertActiveUnit(input.organizationUnitId);
      // Người quản lý chỉ chuyển đề tài sang đơn vị trong phạm vi của mình.
      if (manager && !canCreateStudentProject(actor, input.organizationUnitId)) throw new ForbiddenException({ code: "ORG_SCOPE_DENIED", message: "Chỉ chuyển được sang đơn vị trong phạm vi quản lý của bạn." });
      data.organizationUnitId = input.organizationUnitId;
    }
    if (project.status === "ACTIVE" && "code" in data && !data.code) throw new BadRequestException({ message: "Đề tài đang thực hiện phải có mã." });
    const startDate = "startDate" in data ? data.startDate : project.startDate;
    const endDate = "endDate" in data ? data.endDate : project.endDate;
    if (startDate && endDate && endDate < startDate) throw new BadRequestException({ message: "Ngày kết thúc phải sau ngày bắt đầu." });

    const changed = Object.keys(data).filter((key) => iso(data[key]) !== iso(project[key]));
    if (!changed.length) return this.findOne(actor, project.id);
    const updateData = Object.fromEntries(changed.map((key) => [key, data[key]]));
    await this.db.$transaction(async (tx: any) => {
      if (!await this.guardedUpdate(tx, project, input.version, updateData)) this.stale();
      await this.recordEvent(tx, project.id, actor, "update", { fromStatus: project.status, toStatus: project.status, facts: { fields: changed } });
    });
    await this.auditLog.record({ action: "update-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, beforeFacts: Object.fromEntries(changed.map((key) => [key, key === "studentContact" ? "(ẩn)" : project[key] ?? null])), afterFacts: Object.fromEntries(changed.map((key) => [key, key === "studentContact" ? "(ẩn)" : updateData[key] ?? null])) });
    return this.findOne(actor, project.id);
  }

  // ---- Chuyển trạng thái ----

  async transition(actor: SafeUserContext, id: string, action: TransitionAction, input: TransitionStudentProjectDto) {
    const rule = TRANSITIONS[action];
    if (!rule) throw new BadRequestException({ message: "Thao tác không hợp lệ." });
    const project = await this.load(actor, id);
    if (!canStudentProject(actor, project, action as StudentProjectAction)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: rule.message });
    this.assertVersion(project, input.version);
    if (rule.reasonRequired && !input.reason) throw new BadRequestException({ message: "Cần nêu lý do." });

    const data: AnyRecord = { status: rule.to };
    if (action === "approve") {
      const code = input.code ?? project.code;
      if (!code) throw new BadRequestException({ message: "Cần cấp mã đề tài khi duyệt." });
      data.code = code;
      data.officerId = actor.id;
    }
    await this.db.$transaction(async (tx: any) => {
      if (!await this.guardedUpdate(tx, project, input.version, data)) this.stale();
      await this.recordEvent(tx, project.id, actor, action, { fromStatus: project.status, toStatus: rule.to, reason: input.reason ?? null, facts: action === "approve" ? { code: data.code } : undefined });
    });
    await this.auditLog.record({ action: `${action}-student-research-project`, result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, reason: input.reason ?? undefined, beforeFacts: { status: project.status }, afterFacts: { status: rule.to, ...(action === "approve" ? { code: data.code } : {}) } });
    // Đề tài bị trả lại trở về bản nháp riêng của giảng viên: người trả lại không còn xem được.
    const after = await this.db.studentResearchProject.findUnique({ where: { id: project.id } });
    if (!after || !canReadStudentProject(actor, after)) return { id: project.id, status: rule.to, visible: false };
    return this.findOne(actor, project.id);
  }

  async complete(actor: SafeUserContext, id: string, input: CompleteStudentProjectDto) {
    const project = await this.load(actor, id);
    if (!canStudentProject(actor, project, "complete")) {
      if (project.status !== "ACTIVE") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ đề tài đang thực hiện mới được ghi nhận hoàn thành." });
      throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chuyên viên quản lý đề tài (không phải giảng viên hướng dẫn) được ghi nhận hoàn thành." });
    }
    this.assertVersion(project, input.version);
    await this.db.$transaction(async (tx: any) => {
      // Cập nhật có điều kiện trạng thái: hai người bấm cùng lúc thì chỉ một lần thành công.
      if (!await this.guardedUpdate(tx, project, input.version, { status: "COMPLETED", score: input.score ?? null, award: input.award ?? null })) this.stale();
      await this.recordEvent(tx, project.id, actor, "complete", { fromStatus: "ACTIVE", toStatus: "COMPLETED", facts: { score: input.score ?? null, award: input.award ?? null } });
    });
    await this.auditLog.record({ action: "complete-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, beforeFacts: { status: project.status }, afterFacts: { status: "COMPLETED", score: input.score ?? null, award: input.award ?? null } });
    return this.findOne(actor, project.id);
  }

  // ---- Tài liệu ----

  async uploadDocument(actor: SafeUserContext, id: string, documentType: StudentDocumentType, file: UploadedStudentFile | undefined) {
    if (!file) throw new BadRequestException({ message: "Chưa chọn tệp tải lên." });
    const project = await this.load(actor, id);
    if (!canStudentProject(actor, project, "document.upload")) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ giảng viên hướng dẫn hoặc chuyên viên quản lý được tải tài liệu khi đề tài chưa kết thúc." });
    const originalFileName = readUploadFileName(file.originalname);
    assertValidUpload({ fileName: originalFileName, mimeType: file.mimetype, sizeBytes: file.size, content: file.buffer }, this.fileConfig);

    const fileId = randomUUID();
    const objectKey = `student-research/${project.id}/${fileId}/${randomUUID()}${path.extname(originalFileName).toLowerCase()}`;
    await this.storage.putObject({ objectKey, content: file.buffer, mimeType: file.mimetype, sizeBytes: file.size });
    let document: AnyRecord;
    try {
      document = await this.db.$transaction(async (tx: any) => {
        // Kho tệp không chung giao dịch với cơ sở dữ liệu: khoá đề tài rồi kiểm tra lại trạng thái trước khi ghi bản ghi tệp.
        await lockProject(tx, project.id);
        const current = await tx.studentResearchProject.findUnique({ where: { id: project.id } });
        if (!current || !canStudentProject(actor, current, "document.upload")) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài vừa đổi trạng thái. Vui lòng tải lại trang." });
        await tx.fileRecord.create({
          data: {
            id: fileId, relatedEntityType: STUDENT_RESEARCH_ENTITY_TYPE, relatedEntityId: project.id, filePurpose: `STUDENT_${documentType}`,
            originalFileName, version: 1, mimeType: file.mimetype, sizeBytes: file.size,
            storageBucket: this.fileConfig.bucketName ?? "rtms-files", storageObjectKey: objectKey, uploadedById: actor.id, status: "active"
          }
        });
        const created = await tx.studentResearchDocument.create({ data: { projectId: project.id, documentType, fileId, uploadedById: actor.id } });
        await this.recordEvent(tx, project.id, actor, "document.upload", { facts: { documentId: created.id, documentType, fileName: originalFileName } });
        return created;
      });
    } catch (error) {
      await this.storage.deleteObject?.(objectKey);
      throw error;
    }
    await this.auditLog.record({ action: "upload-student-research-document", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, afterFacts: { documentId: document.id, documentType, fileId } });
    return { id: document.id, documentType, fileName: originalFileName };
  }

  private async findDocument(projectId: string, documentId: string) {
    const document = await this.db.studentResearchDocument.findFirst({ where: { id: documentId, projectId }, include: { file: true } });
    // Chỉ tệp do module lưu cho chính đề tài: tệp của hồ sơ/đề tài khác (gắn theo cách cũ) đi qua quyền của nơi sở hữu.
    if (!document || !isOwnFile(document.file, projectId) || document.file.status !== "active" || document.file.deletedAt) throw new NotFoundException({ message: "Không tìm thấy tài liệu." });
    return document;
  }

  async downloadDocument(actor: SafeUserContext, id: string, documentId: string) {
    const project = await this.load(actor, id);
    const document = await this.findDocument(project.id, documentId);
    let content: Awaited<ReturnType<ObjectStorage["getObject"]>>;
    try {
      content = await this.storage.getObject(document.file.storageObjectKey);
    } catch {
      throw new NotFoundException({ message: "Không tìm thấy nội dung tệp." });
    }
    await this.auditLog.record({ action: "download-student-research-document", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, reason: `document:${document.id}` });
    return { fileName: document.file.originalFileName as string, mimeType: document.file.mimeType as string, sizeBytes: document.file.sizeBytes as number, content };
  }

  async deleteDocument(actor: SafeUserContext, id: string, documentId: string) {
    const project = await this.load(actor, id);
    const document = await this.findDocument(project.id, documentId);
    if (!canDeleteStudentDocument(actor, project, document)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ người tải lên hoặc chuyên viên quản lý được xoá tài liệu khi đề tài chưa kết thúc." });
    await this.db.$transaction(async (tx: any) => {
      await lockProject(tx, project.id);
      const current = await tx.studentResearchProject.findUnique({ where: { id: project.id } });
      if (!current || !canDeleteStudentDocument(actor, current, document)) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài vừa đổi trạng thái. Vui lòng tải lại trang." });
      await tx.studentResearchDocument.delete({ where: { id: document.id } });
      // Giữ bản ghi tệp ở trạng thái đã xoá để tra cứu nhật ký; nội dung không còn tải được.
      await tx.fileRecord.update({ where: { id: document.file.id }, data: { status: "deleted", deletedAt: new Date() } });
      await this.recordEvent(tx, project.id, actor, "document.delete", { facts: { documentId: document.id, documentType: document.documentType, fileName: document.file.originalFileName } });
    });
    await this.auditLog.record({ action: "delete-student-research-document", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, beforeFacts: { documentId: document.id, fileId: document.file.id } });
    return { id: document.id, deleted: true };
  }
}
