import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { CreateStudentProjectDto } from "./dto/create-student-project.dto.js";
import { UploadStudentDocumentDto } from "./dto/upload-student-document.dto.js";

@Injectable()
export class StudentResearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateStudentProjectDto, officerId: string) {
    return this.prisma.studentResearchProject.create({
      data: {
        ...createDto,
        officerId,
        status: "ACTIVE", // Mặc định chuyển sang ACTIVE khi chuyên viên tạo
      },
    });
  }

  async findAll() {
    return this.prisma.studentResearchProject.findMany({
      include: {
        supervisor: {
          select: { displayName: true, username: true }, // wait, user model might not have email field directly. Let's use username and displayName.
        },
        officer: {
          select: { displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.studentResearchProject.findUnique({
      where: { id },
      include: {
        supervisor: { select: { id: true, displayName: true } },
        documents: {
          include: {
            file: true,
            uploadedBy: { select: { displayName: true } }
          }
        }
      },
    });
    if (!project) throw new NotFoundException("Không tìm thấy đề tài");
    return project;
  }

  async uploadDocument(id: string, uploadDto: UploadStudentDocumentDto, userId: string) {
    const project = await this.findOne(id);
    
    // Chỉ supervisor hoặc officer mới được upload
    if (project.supervisorId !== userId && project.officerId !== userId) {
      // Check if user is officer (role check happens in controller but we double check relationship here)
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.systemRole !== "RESEARCH_MANAGEMENT_STAFF") {
        throw new ForbiddenException("Chỉ Giảng viên hướng dẫn hoặc Chuyên viên mới được tải tài liệu");
      }
    }

    return this.prisma.studentResearchDocument.create({
      data: {
        projectId: id,
        documentType: uploadDto.documentType,
        fileId: uploadDto.fileId,
        uploadedById: userId,
      },
    });
  }

  async completeProject(id: string) {
    return this.prisma.studentResearchProject.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  }
}
