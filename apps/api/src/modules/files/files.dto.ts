import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { readCode, readText } from "../../proposals-shared/proposal-validation.js";

export const APPROVED_PROJECT_ENTITY_TYPE = "approved_project";
/** Chứng từ giải ngân gắn với đề tài; nhiều tệp cùng mục đích, không thay thế nhau. */
export const DISBURSEMENT_VOUCHER_PURPOSE = "disbursement_voucher";
/** Tệp hồ sơ nghiệm thu (báo cáo tổng kết, bản hoàn thiện) do chủ nhiệm tải lên. */
export const ACCEPTANCE_DOSSIER_PURPOSE = "acceptance_dossier";
/** Biên bản thanh lý và tài liệu kèm theo do chuyên viên phụ trách tải lên. */
export const LIQUIDATION_RECORD_PURPOSE = "liquidation_record";
/** Minh chứng sản phẩm (nội dung công việc) do chủ nhiệm nộp để tổ chuyên gia nghiệm thu. */
export const PRODUCT_EVIDENCE_PURPOSE = "product_evidence";
/** Biên bản nghiệm thu sản phẩm của tổ chuyên gia (chuyên viên tải lên). */
export const PRODUCT_REVIEW_MINUTES_PURPOSE = "product_review_minutes";
/** Hồ sơ, công văn đề nghị và quyết định nghiệm thu của cấp trên (chuyên viên tải lên). */
export const SUPERIOR_DOSSIER_PURPOSE = "superior_dossier";
export const RESEARCH_PROPOSAL_ENTITY_TYPE = "research_proposal";

export class ListFilesDto {
  relatedEntityType!: string;
  relatedEntityId!: string;
}

export class UploadFileDto extends ListFilesDto {
  contextVersion?: unknown;
  filePurpose!: string;
  originalFileName?: string;
  description?: string | null;
}

export class UpdateFileDto {
  contextVersion?: unknown;
  description!: string | null;
}

function assertRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ message: "Dữ liệu tệp không hợp lệ." });
  }
  return value as Record<string, unknown>;
}

function validateRelatedEntity(input: Record<string, unknown>) {
  const relatedEntityType = readCode(input.relatedEntityType, "relatedEntityType");
  if (![RESEARCH_PROPOSAL_ENTITY_TYPE, APPROVED_PROJECT_ENTITY_TYPE].includes(relatedEntityType)) {
    throw new BadRequestException({ message: "Loại thực thể liên kết chưa được hỗ trợ." });
  }
  readText(input.relatedEntityId, "relatedEntityId", 80);
}

function readOptionalDescription(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  return readText(value, "description", 500);
}

export const uploadFilePipe: PipeTransform<unknown, UploadFileDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    validateRelatedEntity(input);
    if (typeof input.contextVersion === "string") { try { input.contextVersion = JSON.parse(input.contextVersion); } catch { throw new BadRequestException({ message: "Ngữ cảnh tệp không hợp lệ." }); } }
    readCode(input.filePurpose, "filePurpose");
    return {
      ...input,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      filePurpose: input.filePurpose,
      originalFileName: input.originalFileName === undefined ? undefined : readText(input.originalFileName, "originalFileName", 255),
      description: readOptionalDescription(input.description)
    } as UploadFileDto;
  }
};

export const listFilesPipe: PipeTransform<unknown, ListFilesDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    validateRelatedEntity(input);
    return input as unknown as ListFilesDto;
  }
};

export const updateFilePipe: PipeTransform<unknown, UpdateFileDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    if (!Object.hasOwn(input, "description")) {
      throw new BadRequestException({ message: "Chưa có metadata tệp cần cập nhật." });
    }
    return {
      contextVersion: input.contextVersion,
      description: readOptionalDescription(input.description) ?? null
    };
  }
};
