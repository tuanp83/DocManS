import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { MinioObjectStorageService } from "../infrastructure/minio/minio-object-storage.service.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import type {
  CreateScientificDocumentDto,
  QueryScientificDocumentsDto,
  UpdateScientificDocumentDto,
  UploadedDocumentFile
} from "./scientific-documents.dto.js";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream"
]);

@Injectable()
export class ScientificDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: MinioObjectStorageService = new MinioObjectStorageService()
  ) {}

  assertCanManage(actor: SafeUserContext) {
    const allowedRoles = ["SCIENTIFIC_MANAGEMENT_STAFF", "SYSTEM_ADMIN"];
    if (!allowedRoles.includes(actor.systemRole)) {
      throw new ForbiddenException({
        message: "Chỉ nhà quản lý khoa học hoặc quản trị hệ thống mới có quyền quản lý văn bản, biểu mẫu."
      });
    }
  }

  async listDocuments(actor: SafeUserContext, query: QueryScientificDocumentsDto) {
    const where: Record<string, unknown> = {
      deletedAt: null
    };

    if (query.category && query.category !== "ALL") {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    } else {
      where.status = "ACTIVE";
    }

    if (query.search?.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { documentNumber: { contains: searchTerm, mode: "insensitive" } },
        { issuingAuthority: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } }
      ];
    }

    const documents = await this.prisma.scientificDocument.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            username: true,
            unit: true
          }
        }
      },
      orderBy: [
        { issuedDate: "desc" },
        { createdAt: "desc" }
      ]
    });

    return documents;
  }

  async getDocument(actor: SafeUserContext, id: string) {
    const doc = await this.prisma.scientificDocument.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            username: true,
            unit: true
          }
        }
      }
    });

    if (!doc) {
      throw new NotFoundException({ message: "Không tìm thấy văn bản hoặc biểu mẫu." });
    }

    return doc;
  }

  async createDocument(
    actor: SafeUserContext,
    dto: CreateScientificDocumentDto,
    file?: UploadedDocumentFile
  ) {
    this.assertCanManage(actor);

    if (!dto.title?.trim()) {
      throw new BadRequestException({ message: "Tiêu đề văn bản không được để trống." });
    }
    if (!dto.documentNumber?.trim()) {
      throw new BadRequestException({ message: "Số hiệu văn bản không được để trống." });
    }
    if (!dto.category?.trim()) {
      throw new BadRequestException({ message: "Phân loại văn bản không được để trống." });
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ message: "Vui lòng đính kèm tệp văn bản / biểu mẫu." });
    }

    const docId = randomUUID();
    const safeOriginalName = file.originalname || "document.pdf";
    const objectKey = `scientific-documents/${docId}/${safeOriginalName}`;

    await this.storage.putObject({
      objectKey,
      content: file.buffer,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size
    });

    const issuedDate = dto.issuedDate ? new Date(dto.issuedDate) : null;
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : null;

    const created = await this.prisma.scientificDocument.create({
      data: {
        id: docId,
        documentNumber: dto.documentNumber.trim(),
        title: dto.title.trim(),
        category: dto.category.trim(),
        issuingAuthority: dto.issuingAuthority?.trim() || null,
        issuedDate,
        effectiveDate,
        description: dto.description?.trim() || null,
        status: "ACTIVE",
        fileName: safeOriginalName,
        fileSize: file.size,
        mimeType: file.mimetype || "application/octet-stream",
        storageObjectKey: objectKey,
        createdById: actor.id
      },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            username: true,
            unit: true
          }
        }
      }
    });

    await this.auditLog.record({
      action: "create-scientific-document",
      result: "success",
      actorId: actor.id,
      targetEntity: "scientific-document",
      targetEntityId: created.id,
      username: actor.username,
      reason: `Uploaded ${created.category}: ${created.documentNumber}`
    });

    return created;
  }

  async updateDocument(
    actor: SafeUserContext,
    id: string,
    dto: UpdateScientificDocumentDto,
    file?: UploadedDocumentFile
  ) {
    this.assertCanManage(actor);

    const existing = await this.prisma.scientificDocument.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) {
      throw new NotFoundException({ message: "Không tìm thấy văn bản để cập nhật." });
    }

    const data: Record<string, unknown> = {};
    if (dto.documentNumber !== undefined) data.documentNumber = dto.documentNumber.trim();
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.issuingAuthority !== undefined) data.issuingAuthority = dto.issuingAuthority.trim() || null;
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.status !== undefined) data.status = dto.status.trim();
    if (dto.issuedDate !== undefined) data.issuedDate = dto.issuedDate ? new Date(dto.issuedDate) : null;
    if (dto.effectiveDate !== undefined) data.effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : null;

    if (file && file.buffer && file.buffer.length > 0) {
      const safeOriginalName = file.originalname || "document.pdf";
      const objectKey = `scientific-documents/${existing.id}/${safeOriginalName}`;

      await this.storage.putObject({
        objectKey,
        content: file.buffer,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size
      });

      data.fileName = safeOriginalName;
      data.fileSize = file.size;
      data.mimeType = file.mimetype || "application/octet-stream";
      data.storageObjectKey = objectKey;
    }

    const updated = await this.prisma.scientificDocument.update({
      where: { id },
      data: data as never,
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            username: true,
            unit: true
          }
        }
      }
    });

    await this.auditLog.record({
      action: "update-scientific-document",
      result: "success",
      actorId: actor.id,
      targetEntity: "scientific-document",
      targetEntityId: updated.id,
      username: actor.username,
      reason: `Updated ${updated.category}: ${updated.documentNumber}`
    });

    return updated;
  }

  async deleteDocument(actor: SafeUserContext, id: string) {
    this.assertCanManage(actor);

    const existing = await this.prisma.scientificDocument.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) {
      throw new NotFoundException({ message: "Không tìm thấy văn bản để xóa." });
    }

    const deleted = await this.prisma.scientificDocument.update({
      where: { id },
      data: {
        status: "DELETED",
        deletedAt: new Date()
      }
    });

    await this.auditLog.record({
      action: "delete-scientific-document",
      result: "success",
      actorId: actor.id,
      targetEntity: "scientific-document",
      targetEntityId: deleted.id,
      username: actor.username,
      reason: `Deleted ${deleted.category}: ${deleted.documentNumber}`
    });

    return { success: true, id: deleted.id };
  }

  async downloadDocument(actor: SafeUserContext, id: string) {
    const doc = await this.prisma.scientificDocument.findFirst({
      where: { id, deletedAt: null }
    });

    if (!doc) {
      throw new NotFoundException({ message: "Không tìm thấy tệp văn bản." });
    }

    const content = await this.storage.getObject(doc.storageObjectKey);

    await this.auditLog.record({
      action: "download-scientific-document",
      result: "success",
      actorId: actor.id,
      targetEntity: "scientific-document",
      targetEntityId: doc.id,
      username: actor.username,
      reason: `Downloaded ${doc.fileName}`
    });

    return {
      stream: content,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      size: doc.fileSize
    };
  }
}
