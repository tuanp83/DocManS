import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { completeStudentProjectPipe, createStudentProjectPipe } from "./dto/create-student-project.dto.js";
import { uploadStudentDocumentPipe } from "./dto/upload-student-document.dto.js";
import { StudentResearchService } from "./student-research.service.js";

@Controller("api/v1/student-research")
@UseGuards(SessionAuthGuard)
export class StudentResearchController {
  constructor(private readonly studentResearch: StudentResearchService) {}

  @Post()
  async create(@Req() req: RequestWithCurrentUser, @Body(createStudentProjectPipe) body: any) { return { project: await this.studentResearch.create(req.currentUser!, body) }; }

  @Get()
  async findAll(@Req() req: RequestWithCurrentUser) { return { projects: await this.studentResearch.findAll(req.currentUser!) }; }

  @Get("supervisor-candidates")
  async supervisors(@Req() req: RequestWithCurrentUser) { return { users: await this.studentResearch.supervisorCandidates(req.currentUser!) }; }

  @Get(":id")
  async findOne(@Req() req: RequestWithCurrentUser, @Param("id") id: string) { return { project: await this.studentResearch.findOne(req.currentUser!, id) }; }

  @Post(":id/documents")
  async attach(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(uploadStudentDocumentPipe) body: any) { return { document: await this.studentResearch.attachDocument(req.currentUser!, id, body) }; }

  @Patch(":id/complete")
  async complete(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(completeStudentProjectPipe) body: any) { return { project: await this.studentResearch.complete(req.currentUser!, id, body) }; }
}
