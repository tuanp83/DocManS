import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import type { SafeUserContext } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { readCode, readText } from "./admin-access.js";

type SystemParameterInput = {
  key?: unknown;
  value?: unknown;
  label?: unknown;
};

type NotificationTemplateInput = {
  key?: unknown;
  subject?: unknown;
  body?: unknown;
};

const SYSTEM_PARAMETER_RULES = {
  session_timeout_minutes: {
    label: "Thời gian phiên đăng nhập (phút)",
    hint: "Từ 15 đến 1440 phút; áp dụng cho các lần đăng nhập sau khi lưu.",
    validate(value: string) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 15 || parsed > 1440) {
        throw new BadRequestException({ message: "value phải là số phút từ 15 đến 1440." });
      }

      return String(parsed);
    }
  }
} as const;

// Chỉ các mẫu thật sự được gửi. Admin tạo tài khoản thì trao mật khẩu tạm trực tiếp, không gửi email,
// nên không còn mẫu "user_created".
const NOTIFICATION_TEMPLATE_RULES = {
  researcher_account_activation: {
    label: "Email kích hoạt tài khoản nhà khoa học",
    placeholders: new Set(["displayName", "activationUrl", "expiresAt"])
  }
} as const;

@Injectable()
export class AdminConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  /** Tham số và mẫu được hỗ trợ, để giao diện chọn từ danh sách thay vì gõ mã. */
  definitions() {
    return {
      parameters: Object.entries(SYSTEM_PARAMETER_RULES).map(([key, rule]) => ({ key, label: rule.label, hint: rule.hint })),
      templates: Object.entries(NOTIFICATION_TEMPLATE_RULES).map(([key, rule]) => ({ key, label: rule.label, placeholders: [...rule.placeholders] }))
    };
  }

  async listSystemParameters() {
    return this.prisma.systemParameter.findMany({
      orderBy: { key: "asc" }
    });
  }

  async updateSystemParameter(actor: SafeUserContext, input: SystemParameterInput) {
    const key = readCode(input.key, "key");
    const value = this.readSystemParameterValue(key, input.value);
    const label = readText(input.label, "label");

    return this.prisma.$transaction(async (tx) => {
      const parameter = await tx.systemParameter.upsert({
        where: { key },
        update: { value, label },
        create: { key, value, label }
      });

      await this.auditLog.record(
        {
          action: "update-system-parameter",
          result: "success",
          actorId: actor.id,
          targetEntity: "system-parameter",
          targetEntityId: parameter.id,
          username: actor.username
        },
        tx
      );

      return parameter;
    });
  }

  async listNotificationTemplates() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: { key: "asc" }
    });
  }

  async updateNotificationTemplate(actor: SafeUserContext, input: NotificationTemplateInput) {
    const key = readCode(input.key, "key");
    const subject = readText(input.subject, "subject", 200);
    const body = readText(input.body, "body", 4000);
    this.validateTemplatePlaceholders(key, subject, body);

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.notificationTemplate.upsert({
        where: { key },
        update: { subject, body },
        create: { key, subject, body, status: "active" }
      });

      await this.auditLog.record(
        {
          action: "update-notification-template",
          result: "success",
          actorId: actor.id,
          targetEntity: "notification-template",
          targetEntityId: template.id,
          username: actor.username
        },
        tx
      );

      return template;
    });
  }

  private readSystemParameterValue(key: string, value: unknown) {
    const rule = SYSTEM_PARAMETER_RULES[key as keyof typeof SYSTEM_PARAMETER_RULES];
    if (!rule) {
      throw new BadRequestException({ message: "key không thuộc tham số phase 1 được hỗ trợ." });
    }

    return rule.validate(readText(value, "value", 1000));
  }

  private validateTemplatePlaceholders(key: string, subject: string, body: string) {
    const rule = NOTIFICATION_TEMPLATE_RULES[key as keyof typeof NOTIFICATION_TEMPLATE_RULES];
    if (!rule) {
      throw new BadRequestException({ message: "key không thuộc mẫu thông báo phase 1 được hỗ trợ." });
    }

    for (const field of [
      ["subject", subject],
      ["body", body]
    ] as const) {
      const invalid = findUnsupportedPlaceholders(field[1], rule.placeholders);
      if (invalid.length > 0) {
        throw new BadRequestException({ message: `${field[0]} chứa placeholder không hỗ trợ: ${invalid.join(", ")}.` });
      }
    }
  }
}

function findUnsupportedPlaceholders(value: string, allowed: ReadonlySet<string>) {
  const invalid = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  for (const match of value.matchAll(pattern)) {
    const placeholder = match[1];
    if (!allowed.has(placeholder)) {
      invalid.add(placeholder);
    }
  }

  return [...invalid];
}
