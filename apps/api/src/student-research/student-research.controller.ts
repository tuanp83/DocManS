import { Controller, Get, Post, Body, Param, Patch, UseGuards, Req } from "@nestjs/common";
import { StudentResearchService } from "./student-research.service.js";
import { CreateStudentProjectDto } from "./dto/create-student-project.dto.js";
import { UploadStudentDocumentDto } from "./dto/upload-student-document.dto.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";

@Controller("api/v1/student-research")
@UseGuards(SessionAuthGuard)
export class StudentResearchController {
  constructor(private readonly studentResearchService: StudentResearchService) {}

  @Post()
  create(@Body() createDto: CreateStudentProjectDto, @Req() req: any) {
    // In real app, we should add RoleGuard for RESEARCH_MANAGEMENT_STAFF
    return this.studentResearchService.create(createDto, req.user.id);
  }

  @Get()
  findAll() {
    return this.studentResearchService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.studentResearchService.findOne(id);
  }

  @Post(":id/documents")
  uploadDocument(
    @Param("id") id: string,
    @Body() uploadDto: UploadStudentDocumentDto,
    @Req() req: any
  ) {
    return this.studentResearchService.uploadDocument(id, uploadDto, req.user.id);
  }

  @Patch(":id/complete")
  completeProject(@Param("id") id: string) {
    return this.studentResearchService.completeProject(id);
  }
}
