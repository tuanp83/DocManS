import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { buildContentDisposition } from "../modules/files/files.controller.js";
import { streamToBuffer } from "../modules/files/files.service.js";
import { uploadInterceptorOptions } from "../modules/files/upload-limits.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { completeStudentProjectPipe, createStudentProjectPipe, registerStudentProjectPipe, transitionStudentProjectPipe, updateStudentProjectPipe } from "./dto/create-student-project.dto.js";
import { readStudentDocumentType } from "./dto/upload-student-document.dto.js";
import { StudentResearchService, type UploadedStudentFile } from "./student-research.service.js";

type DownloadResponse = { setHeader(name: string, value: string): void; send(content: Buffer): void };

@Controller("api/v1/student-research")
@UseGuards(SessionAuthGuard)
export class StudentResearchController {
  constructor(private readonly studentResearch: StudentResearchService) {}

  /** Chuyên viên tạo trực tiếp đề tài đã duyệt. */
  @Post()
  async create(@Req() req: RequestWithCurrentUser, @Body(createStudentProjectPipe) body: any) { return { project: await this.studentResearch.create(req.currentUser!, body) }; }

  /** Giảng viên đăng ký đề tài (bản nháp). */
  @Post("registrations")
  async register(@Req() req: RequestWithCurrentUser, @Body(registerStudentProjectPipe) body: any) { return { project: await this.studentResearch.register(req.currentUser!, body) }; }

  @Get()
  async findAll(@Req() req: RequestWithCurrentUser) { return { projects: await this.studentResearch.findAll(req.currentUser!) }; }

  @Get("supervisor-candidates")
  async supervisors(@Req() req: RequestWithCurrentUser) { return { users: await this.studentResearch.supervisorCandidates(req.currentUser!) }; }

  @Get("organization-units")
  async organizationUnits(@Req() req: RequestWithCurrentUser) { return { organizationUnits: await this.studentResearch.organizationUnits(req.currentUser!) }; }

  @Get(":id")
  async findOne(@Req() req: RequestWithCurrentUser, @Param("id") id: string) { return { project: await this.studentResearch.findOne(req.currentUser!, id) }; }

  @Patch(":id")
  async update(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(updateStudentProjectPipe) body: any) { return { project: await this.studentResearch.update(req.currentUser!, id, body) }; }

  @Post(":id/submit")
  async submit(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(transitionStudentProjectPipe) body: any) { return { project: await this.studentResearch.transition(req.currentUser!, id, "submit", body) }; }

  @Post(":id/approve")
  async approve(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(transitionStudentProjectPipe) body: any) { return { project: await this.studentResearch.transition(req.currentUser!, id, "approve", body) }; }

  @Post(":id/return")
  async returnToDraft(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(transitionStudentProjectPipe) body: any) { return { project: await this.studentResearch.transition(req.currentUser!, id, "return", body) }; }

  @Post(":id/cancel")
  async cancel(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(transitionStudentProjectPipe) body: any) { return { project: await this.studentResearch.transition(req.currentUser!, id, "cancel", body) }; }

  @Patch(":id/complete")
  async complete(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(completeStudentProjectPipe) body: any) { return { project: await this.studentResearch.complete(req.currentUser!, id, body) }; }

  /** Tải tài liệu lên (multipart: file + documentType). */
  @Post(":id/documents")
  @UseInterceptors(FileInterceptor("file", uploadInterceptorOptions()))
  async upload(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body() body: Record<string, unknown>, @UploadedFile() file?: UploadedStudentFile) {
    return { document: await this.studentResearch.uploadDocument(req.currentUser!, id, readStudentDocumentType(body?.documentType), file) };
  }

  @Get(":id/documents/:documentId/download")
  async download(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Param("documentId") documentId: string, @Res() response: DownloadResponse) {
    const download = await this.studentResearch.downloadDocument(req.currentUser!, id, documentId);
    const content = await streamToBuffer(download.content);
    response.setHeader("Content-Type", download.mimeType);
    response.setHeader("Content-Length", String(content.length));
    response.setHeader("Content-Disposition", buildContentDisposition(download.fileName));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(content);
  }

  @Delete(":id/documents/:documentId")
  async deleteDocument(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Param("documentId") documentId: string) {
    return { document: await this.studentResearch.deleteDocument(req.currentUser!, id, documentId) };
  }
}
