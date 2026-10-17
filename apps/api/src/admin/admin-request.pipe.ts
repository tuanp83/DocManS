import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { MAX_POSITIONS_PER_USER } from "./admin-users.service.js";

type FieldRule = {
  maxLength?: number;
  optional?: boolean;
};

const ADMIN_VALIDATION_MESSAGE = "Dữ liệu quản trị không hợp lệ.";

export function adminRequestPipe(fields: Record<string, FieldRule>): PipeTransform<unknown, Record<string, unknown>> {
  return {
    transform(value: unknown) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new BadRequestException({ message: ADMIN_VALIDATION_MESSAGE });
      }

      const input = value as Record<string, unknown>;

      for (const [field, rule] of Object.entries(fields)) {
        const fieldValue = input[field];

        if (fieldValue === undefined) {
          if (rule.optional) {
            continue;
          }
          throw new BadRequestException({ message: ADMIN_VALIDATION_MESSAGE });
        }

        if (typeof fieldValue !== "string" || !fieldValue.trim()) {
          throw new BadRequestException({ message: ADMIN_VALIDATION_MESSAGE });
        }

        if (rule.maxLength && fieldValue.length > rule.maxLength) {
          throw new BadRequestException({ message: ADMIN_VALIDATION_MESSAGE });
        }
      }

      return input;
    }
  };
}

/** Chức danh của tài khoản: thay toàn bộ danh sách; từng phần tử được kiểm tra chặt ở service. */
export const userPositionsPipe: PipeTransform<unknown, { positions: unknown[] }> = {
  transform(value: unknown) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (!input || !Array.isArray(input.positions) || input.positions.length > MAX_POSITIONS_PER_USER) {
      throw new BadRequestException({ message: `Danh sách chức danh không hợp lệ (tối đa ${MAX_POSITIONS_PER_USER}).` });
    }
    return { positions: input.positions };
  }
};
