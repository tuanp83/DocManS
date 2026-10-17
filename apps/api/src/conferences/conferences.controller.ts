import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { buildContentDisposition } from "../modules/files/files.controller.js";
import { sendObjectContent } from "../modules/files/send-object-content.js";
import { uploadInterceptorOptions } from "../modules/files/upload-limits.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import { ConferenceInvitationsService, type UploadedSheet } from "./conference-invitations.service.js";
import { ConferencePapersService, type UploadedPaperFile } from "./conference-papers.service.js";
import {
  assignOfficerPipe,
  createConferencePipe,
  createInvitationsPipe,
  invitationResponsePipe,
  invitationTokenPipe,
  publicInvitationResponsePipe,
  reasonPipe,
  readSubmitPaper,
  revisionRequestPipe,
  sendMailingPipe,
  updateConferencePipe,
  updateInvitationPipe,
  versionedReasonPipe,
  type AssignOfficerDto,
  type ConferenceInfoDto,
  type InvitationInputDto,
  type InvitationResponseDto,
  type PublicInvitationResponseDto,
  type RevisionRequestDto,
  type SendMailingDto,
  type UpdateConferenceDto,
  type UpdateInvitationDto,
  type VersionedReasonDto
} from "./conferences.dto.js";
import { ConferencesService } from "./conferences.service.js";

type DownloadResponse = { setHeader(name: string, value: string): void; send(content: Buffer): void };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sendXlsx(response: DownloadResponse, fileName: string, content: Buffer) {
  response.setHeader("Content-Type", XLSX_MIME);
  response.setHeader("Content-Disposition", buildContentDisposition(fileName));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.send(content);
}

function requestContext(request: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, unknown> }) {
  return { ip: request.ip ?? request.socket?.remoteAddress, userAgent: typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : undefined };
}

@Controller("api/v1/conferences")
@UseGuards(SessionAuthGuard)
export class ConferencesController {
  constructor(
    private readonly conferences: ConferencesService,
    private readonly invitations: ConferenceInvitationsService
  ) {}

  @Get()
  async list(@Req() req: RequestWithCurrentUser) { return { conferences: await this.conferences.list(req.currentUser!) }; }

  @Post()
  async create(@Req() req: RequestWithCurrentUser, @Body(createConferencePipe) body: ConferenceInfoDto) { return this.conferences.create(req.currentUser!, body); }

  @Get("host-units")
  async hostUnits(@Req() req: RequestWithCurrentUser) { return { organizationUnits: await this.conferences.hostUnits(req.currentUser!) }; }

  @Get("officer-candidates")
  async officerCandidates(@Req() req: RequestWithCurrentUser) { return { users: await this.conferences.officerCandidates(req.currentUser!) }; }

  @Get("invitation-template.xlsx")
  async template(@Res() response: DownloadResponse) { sendXlsx(response, "Mau_khach_moi_hoi_nghi.xlsx", await this.invitations.importTemplate()); }

  @Get(":id")
  async detail(@Req() req: RequestWithCurrentUser, @Param("id") id: string) { return this.conferences.detail(req.currentUser!, id); }

  @Patch(":id")
  async update(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(updateConferencePipe) body: UpdateConferenceDto) { return this.conferences.update(req.currentUser!, id, body); }

  @Post(":id/officer")
  async assignOfficer(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(assignOfficerPipe) body: AssignOfficerDto) { return this.conferences.assignOfficer(req.currentUser!, id, body); }

  @Post(":id/officer/revoke")
  async revokeOfficer(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(versionedReasonPipe) body: VersionedReasonDto) { return this.conferences.revokeOfficer(req.currentUser!, id, body); }

  @Post(":id/close-submission")
  async closeSubmission(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(versionedReasonPipe) body: VersionedReasonDto) { return this.conferences.transition(req.currentUser!, id, "close-submission", body); }

  @Post(":id/complete")
  async complete(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(versionedReasonPipe) body: VersionedReasonDto) { return this.conferences.transition(req.currentUser!, id, "complete", body); }

  @Post(":id/cancel")
  async cancel(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(versionedReasonPipe) body: VersionedReasonDto) { return this.conferences.transition(req.currentUser!, id, "cancel", body); }

  @Get(":id/export.xlsx")
  async export(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Res() response: DownloadResponse) {
    const result = await this.conferences.exportXlsx(req.currentUser!, id);
    sendXlsx(response, result.fileName, result.content);
  }

  @Get(":id/user-candidates")
  async userCandidates(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Query("q") q: string) { return { users: await this.invitations.userCandidates(req.currentUser!, id, q) }; }

  @Get(":id/organization-units")
  async organizationUnits(@Req() req: RequestWithCurrentUser, @Param("id") id: string) { return { organizationUnits: await this.invitations.organizationUnits(req.currentUser!, id) }; }

  @Post(":id/invitations")
  async addInvitations(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(createInvitationsPipe) body: InvitationInputDto[]) { return this.invitations.addInvitations(req.currentUser!, id, body); }

  @Post(":id/invitations/import")
  @UseInterceptors(FileInterceptor("file", uploadInterceptorOptions()))
  async importInvitations(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @UploadedFile() file?: UploadedSheet) { return this.invitations.importInvitations(req.currentUser!, id, file); }

  @Patch(":id/invitations/:invitationId")
  async updateInvitation(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Param("invitationId") invitationId: string, @Body(updateInvitationPipe) body: UpdateInvitationDto) { return this.invitations.updateInvitation(req.currentUser!, id, invitationId, body); }

  @Post(":id/invitations/:invitationId/revoke")
  async revokeInvitation(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Param("invitationId") invitationId: string, @Body(reasonPipe) body: { reason: string }) { return this.invitations.revokeInvitation(req.currentUser!, id, invitationId, body.reason); }

  @Post(":id/mailings")
  async sendMailing(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(sendMailingPipe) body: SendMailingDto) { return this.invitations.sendMailing(req.currentUser!, id, body); }
}

@Controller("api/v1/my-conferences")
@UseGuards(SessionAuthGuard)
export class MyConferencesController {
  constructor(
    private readonly papers: ConferencePapersService,
    private readonly invitations: ConferenceInvitationsService
  ) {}

  @Get()
  async list(@Req() req: RequestWithCurrentUser) { return { items: await this.papers.myConferences(req.currentUser!) }; }

  @Post("invitations/:id/respond")
  async respond(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(invitationResponsePipe) body: InvitationResponseDto) { return this.invitations.respondInApp(req.currentUser!, id, body); }
}

@Controller("api/v1/conference-papers")
@UseGuards(SessionAuthGuard)
export class ConferencePapersController {
  constructor(private readonly papers: ConferencePapersService) {}

  /** Nộp tóm tắt hoặc toàn văn (multipart: kind, version, title, abstractText, authors, file). */
  @Post(":id/submissions")
  @UseInterceptors(FileInterceptor("file", uploadInterceptorOptions()))
  async submit(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body() body: Record<string, unknown>, @UploadedFile() file?: UploadedPaperFile) {
    return this.papers.submit(req.currentUser!, id, readSubmitPaper(body), file);
  }

  @Post(":id/withdraw")
  async withdraw(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(versionedReasonPipe) body: VersionedReasonDto) { return this.papers.withdraw(req.currentUser!, id, body); }

  @Post(":id/revision-requests")
  async requestRevision(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Body(revisionRequestPipe) body: RevisionRequestDto) { return this.papers.requestRevision(req.currentUser!, id, body); }

  @Get(":id/versions/:versionId/download")
  async download(@Req() req: RequestWithCurrentUser, @Param("id") id: string, @Param("versionId") versionId: string, @Res() response: DownloadResponse) {
    const download = await this.papers.download(req.currentUser!, id, versionId);
    response.setHeader("Content-Type", download.mimeType);
    response.setHeader("Content-Disposition", buildContentDisposition(download.fileName));
    response.setHeader("X-Content-Type-Options", "nosniff");
    await sendObjectContent(response, download.content, download.sizeBytes);
  }
}

/** Đường link trong thư mời: không cần đăng nhập. Mã đi trong thân yêu cầu để không nằm trong nhật ký truy cập. */
@Controller("api/v1/public/conference-invitations")
export class PublicConferenceInvitationsController {
  constructor(private readonly invitations: ConferenceInvitationsService) {}

  @Post("lookup")
  async lookup(@Req() req: Parameters<typeof requestContext>[0], @Body(invitationTokenPipe) body: { token: string }) { return this.invitations.publicLookup(body.token, requestContext(req)); }

  @Post("respond")
  async respond(@Req() req: Parameters<typeof requestContext>[0], @Body(publicInvitationResponsePipe) body: PublicInvitationResponseDto) { return this.invitations.publicRespond(body, requestContext(req)); }
}
