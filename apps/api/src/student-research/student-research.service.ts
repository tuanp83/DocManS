import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import type { CompleteStudentProjectDto, CreateStudentProjectDto } from "./dto/create-student-project.dto.js";
import type { UploadStudentDocumentDto } from "./dto/upload-student-document.dto.js";
import { canAttachStudentDocument, canCreateStudentProject, canManageStudentProject, canReadStudentProject, studentProjectReadFilter, type StudentProjectFacts } from "./student-research-access.js";

type AnyRecord = Record<string, any>;

/** Vai trò được chọn làm giảng viên hướng dẫn: tài khoản nội bộ đang hoạt động (không phải tài khoản ngoài, quản trị). */
const SUPERVISOR_ROLES = ["RESEARCHER_INTERNAL_USER", "RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD", "LEADERSHIP_APPROVAL_AUTHORITY"];

const PROJECT_INCLUDE = {
  supervisor: { select: { id: true, displayName: true, username: true } },
  officer: { select: { id: true, displayName: true } },
  organizationUnit: { select: { id: true, code: true, name: true } }
};

@Injectable()
export class StudentResearchService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  /** Bỏ thông tin liên lạc của sinh viên với người không quản lý đề tài. */
  private present(actor: SafeUserContext, project: AnyRecord) {
    const canManage = canManageStudentProject(actor, project as StudentProjectFacts);
    return { ...project, studentContact: canManage ? project.studentContact : null, viewer: { canManage, canAttach: canAttachStudentDocument(actor, project as StudentProjectFacts) } };
  }

  private async load(actor: SafeUserContext, id: string, include: AnyRecord = PROJECT_INCLUDE) {
    const project = await (this.prisma as any).studentResearchProject.findUnique({ where: { id }, include });
    // Không phân biệt "không tồn tại" và "không có quyền" để không lộ sự tồn tại của đề tài.
    if (!project || !canReadStudentProject(actor, project)) throw new NotFoundException({ message: "Không tìm thấy đề tài." });
    return project;
  }

  async create(actor: SafeUserContext, input: CreateStudentProjectDto) {
    if (!canCreateStudentProject(actor, input.organizationUnitId)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chuyên viên QLKH có phạm vi đơn vị được tạo đề tài NCKH sinh viên." });
    const supervisor = await (this.prisma as any).user.findUnique({ where: { id: input.supervisorId } });
    if (!supervisor || supervisor.status !== "active" || !SUPERVISOR_ROLES.includes(supervisor.systemRole)) throw new BadRequestException({ message: "Giảng viên hướng dẫn phải là tài khoản nội bộ đang hoạt động." });
    try {
      const project = await (this.prisma as any).studentResearchProject.create({
        data: {
          code: input.code, name: input.name, studentName: input.studentName, studentClass: input.studentClass, studentContact: input.studentContact ?? null,
          supervisorId: supervisor.id, organizationUnitId: input.organizationUnitId, officerId: actor.id, startDate: input.startDate ?? null, endDate: input.endDate ?? null,
          status: "ACTIVE"
        },
        include: PROJECT_INCLUDE
      });
      await this.auditLog.record({ action: "create-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, afterFacts: { code: project.code, supervisorId: supervisor.id, organizationUnitId: input.organizationUnitId } });
      return this.present(actor, project);
    } catch (error) {
      if ((error as AnyRecord)?.code === "P2002") throw new ConflictException({ message: `Mã đề tài ${input.code} đã tồn tại.` });
      throw error;
    }
  }

  async findAll(actor: SafeUserContext) {
    const projects = await (this.prisma as any).studentResearchProject.findMany({ where: studentProjectReadFilter(actor), include: PROJECT_INCLUDE, orderBy: { createdAt: "desc" } });
    return projects.filter((project: AnyRecord) => canReadStudentProject(actor, project as StudentProjectFacts)).map((project: AnyRecord) => this.present(actor, project));
  }

  async findOne(actor: SafeUserContext, id: string) {
    const project = await this.load(actor, id, {
      ...PROJECT_INCLUDE,
      documents: {
        include: {
          // Chỉ thông tin hiển thị của tệp; không trả khoá lưu trữ hay thực thể liên kết.
          file: { select: { id: true, originalFileName: true, mimeType: true, sizeBytes: true, status: true } },
          uploadedBy: { select: { displayName: true } }
        },
        orderBy: { uploadedAt: "desc" }
      }
    });
    return this.present(actor, project);
  }

  /** Danh sách giảng viên có thể hướng dẫn (cho biểu mẫu tạo đề tài); chỉ người quản lý được xem. */
  async supervisorCandidates(actor: SafeUserContext) {
    if (!actor.organizationScopes?.length || !["RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_HEAD"].includes(actor.systemRole)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED" });
    const users = await (this.prisma as any).user.findMany({ where: { status: "active", systemRole: { in: SUPERVISOR_ROLES } }, select: { id: true, displayName: true, username: true, unit: true }, orderBy: { displayName: "asc" }, take: 500 });
    return users;
  }

  async attachDocument(actor: SafeUserContext, id: string, input: UploadStudentDocumentDto) {
    const project = await this.load(actor, id);
    if (!canAttachStudentDocument(actor, project)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ giảng viên hướng dẫn hoặc chuyên viên quản lý được gắn tài liệu." });
    if (project.status !== "ACTIVE") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ gắn tài liệu khi đề tài đang thực hiện." });
    // Chỉ gắn tệp do chính người dùng tải lên: không thể "mượn" tệp của hồ sơ khác để xem thông tin của nó.
    const file = await (this.prisma as any).fileRecord.findUnique({ where: { id: input.fileId } });
    if (!file || file.status !== "active" || file.deletedAt || file.uploadedById !== actor.id) throw new BadRequestException({ message: "Chỉ gắn được tệp do chính bạn tải lên và còn hiệu lực." });
    const document = await (this.prisma as any).studentResearchDocument.create({ data: { projectId: project.id, documentType: input.documentType, fileId: file.id, uploadedById: actor.id } });
    await this.auditLog.record({ action: "attach-student-research-document", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, afterFacts: { documentId: document.id, documentType: input.documentType, fileId: file.id } });
    return document;
  }

  async complete(actor: SafeUserContext, id: string, input: CompleteStudentProjectDto) {
    const project = await this.load(actor, id);
    if (!canManageStudentProject(actor, project)) throw new ForbiddenException({ code: "ACTION_NOT_GRANTED", message: "Chỉ chuyên viên quản lý đề tài được ghi nhận hoàn thành." });
    if (project.status !== "ACTIVE") throw new BadRequestException({ code: "WORKFLOW_STATE_DENIED", message: "Chỉ đề tài đang thực hiện mới được ghi nhận hoàn thành." });
    // updateMany có điều kiện trạng thái: hai người bấm cùng lúc thì chỉ một lần thành công.
    let result: { count: number };
    try {
      result = await (this.prisma as any).studentResearchProject.updateMany({ where: { id: project.id, status: "ACTIVE" }, data: { status: "COMPLETED", score: input.score ?? null, award: input.award ?? null } });
    } catch (error) {
      // Dữ liệu cũ vi phạm ràng buộc mới (NOT VALID vẫn kiểm tra khi cập nhật), ví dụ ngày kết thúc trước ngày bắt đầu.
      if (/23514|check constraint/i.test(String((error as AnyRecord)?.code ?? "") + String((error as AnyRecord)?.message ?? ""))) throw new BadRequestException({ message: "Dữ liệu đề tài (ngày, điểm hoặc mã) chưa hợp lệ theo quy định mới; cần sửa trước khi ghi nhận hoàn thành." });
      throw error;
    }
    if (result.count !== 1) throw new ConflictException({ code: "CONTEXT_VERSION_MISMATCH", message: "Đề tài vừa được cập nhật. Vui lòng tải lại." });
    await this.auditLog.record({ action: "complete-student-research-project", result: "success", actorId: actor.id, targetEntity: "student-research-project", targetEntityId: project.id, username: actor.username, beforeFacts: { status: project.status }, afterFacts: { status: "COMPLETED", score: input.score ?? null, award: input.award ?? null } });
    return this.findOne(actor, project.id);
  }
}
