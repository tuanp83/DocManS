import { BadRequestException, type PipeTransform } from "@nestjs/common";
import {
  readCode,
  readDate,
  readOptionalText,
  readRequiredPackage,
  readText
} from "../proposals-shared/proposal-validation.js";

const INTAKE_PERIOD_VALIDATION_MESSAGE = "Dữ liệu đợt tiếp nhận không hợp lệ.";

export class ListProposalIntakePeriodsQueryDto {
  [key: string]: unknown;

  status?: string;
}

export class CreateProposalIntakePeriodDto {
  [key: string]: unknown;

  code!: string;
  title!: string;
  description?: string;
  startsAt!: string;
  endsAt!: string;
  applicableOrganizationUnitId?: string;
  requiredPackage!: unknown[];
}

export class UpdateProposalIntakePeriodDto {
  [key: string]: unknown;

  code?: string;
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  applicableOrganizationUnitId?: string;
  requiredPackage?: unknown[];
}

function assertRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ message: INTAKE_PERIOD_VALIDATION_MESSAGE });
  }

  const record = value as Record<string, unknown>;
  if (typeof record.data === "string") {
    try { return assertRecord(JSON.parse(record.data)); } catch { throw new BadRequestException({ message: INTAKE_PERIOD_VALIDATION_MESSAGE }); }
  }
  return record;
}

export const listProposalIntakePeriodsQueryPipe: PipeTransform<unknown, ListProposalIntakePeriodsQueryDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    if (input.status !== undefined) {
      readOptionalText(input.status, "status", 40);
    }

    return input as ListProposalIntakePeriodsQueryDto;
  }
};

export const createProposalIntakePeriodPipe: PipeTransform<unknown, CreateProposalIntakePeriodDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    readCode(input.code, "code");
    readText(input.title, "title", 220);
    readOptionalText(input.description, "description", 1000);
    readDate(input.startsAt, "startsAt");
    readDate(input.endsAt, "endsAt");
    readOptionalText(input.applicableOrganizationUnitId, "applicableOrganizationUnitId", 80);
    readRequiredPackage(input.requiredPackage);

    return input as CreateProposalIntakePeriodDto;
  }
};

export const updateProposalIntakePeriodPipe: PipeTransform<unknown, UpdateProposalIntakePeriodDto> = {
  transform(value: unknown) {
    const input = assertRecord(value);
    if (input.code !== undefined) {
      readCode(input.code, "code");
    }
    if (input.title !== undefined) {
      readText(input.title, "title", 220);
    }
    if (input.description !== undefined) {
      readOptionalText(input.description, "description", 1000);
    }
    if (input.startsAt !== undefined) {
      readDate(input.startsAt, "startsAt");
    }
    if (input.endsAt !== undefined) {
      readDate(input.endsAt, "endsAt");
    }
    if (input.applicableOrganizationUnitId !== undefined) {
      readOptionalText(input.applicableOrganizationUnitId, "applicableOrganizationUnitId", 80);
    }
    if (input.requiredPackage !== undefined) {
      readRequiredPackage(input.requiredPackage);
    }

    return input as UpdateProposalIntakePeriodDto;
  }
};

/** Mở / đóng đợt: bắt buộc phiên bản đợt đang xem (thời điểm cập nhật) để không thao tác trên bản đã đổi. */
export const intakePeriodStatusPipe: PipeTransform<unknown, { contextVersion: string }> = {
  transform(value: unknown) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    if (typeof input.contextVersion !== "string" || !input.contextVersion.trim() || input.contextVersion.length > 64) {
      throw new BadRequestException({ code: "CONTEXT_VERSION_REQUIRED", message: "Thiếu phiên bản đợt tiếp nhận đang xem. Vui lòng tải lại trang rồi thực hiện lại." });
    }
    return { contextVersion: input.contextVersion };
  }
};
