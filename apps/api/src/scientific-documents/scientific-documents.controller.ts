import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Readable } from "node:stream";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { RequestWithCurrentUser } from "../proposals-shared/proposal-types.js";
import type {
  CreateScientificDocumentDto,
  QueryScientificDocumentsDto,
  UpdateScientificDocumentDto,
  UploadedDocumentFile
} from "./scientific-documents.dto.js";
import { ScientificDocumentsService } from "./scientific-documents.service.js";

type DownloadResponse = {
  setHeader(name: string, value: string): void;
  send(content: Buffer): void;
};

function encodeRfc5987Value(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function toAsciiFilename(value: string) {
  const fallback = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (fallback || "document").replace(/"/g, "");
}

function buildContentDisposition(fileName: string) {
  return `attachment; filename="${toAsciiFilename(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`;
}

async function streamToBuffer(stream: Readable | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

@Controller("api/v1/scientific-documents")
@UseGuards(SessionAuthGuard)
export class ScientificDocumentsController {
  constructor(private readonly service: ScientificDocumentsService) {}

  @Get()
  async listDocuments(
    @Req() request: RequestWithCurrentUser,
    @Query() query: QueryScientificDocumentsDto
  ) {
    const documents = await this.service.listDocuments(request.currentUser!, query);
    return { documents };
  }

  @Get(":id")
  async getDocument(
    @Req() request: RequestWithCurrentUser,
    @Param("id") id: string
  ) {
    const document = await this.service.getDocument(request.currentUser!, id);
    return { document };
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async createDocument(
    @Req() request: RequestWithCurrentUser,
    @Body() body: CreateScientificDocumentDto,
    @UploadedFile() file?: UploadedDocumentFile
  ) {
    const document = await this.service.createDocument(request.currentUser!, body, file);
    return { document };
  }

  @Patch(":id")
  @UseInterceptors(FileInterceptor("file"))
  async updateDocument(
    @Req() request: RequestWithCurrentUser,
    @Param("id") id: string,
    @Body() body: UpdateScientificDocumentDto,
    @UploadedFile() file?: UploadedDocumentFile
  ) {
    const document = await this.service.updateDocument(request.currentUser!, id, body, file);
    return { document };
  }

  @Delete(":id")
  async deleteDocument(
    @Req() request: RequestWithCurrentUser,
    @Param("id") id: string
  ) {
    return await this.service.deleteDocument(request.currentUser!, id);
  }

  @Get(":id/download")
  async downloadDocument(
    @Req() request: RequestWithCurrentUser,
    @Param("id") id: string,
    @Res() response: DownloadResponse
  ) {
    const file = await this.service.downloadDocument(request.currentUser!, id);
    const content = await streamToBuffer(file.stream);

    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Length", String(content.length));
    response.setHeader("Content-Disposition", buildContentDisposition(file.fileName));
    response.send(content);
  }
}
