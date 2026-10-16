import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../auth/audit-log.service.js";
import { PasswordService } from "../auth/password.service.js";
import { AuthService } from "../auth/auth.service.js";
import { SYSTEM_ROLES, type SafeUserContext, type SystemRole } from "../auth/auth.types.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { readCode, readText } from "./admin-access.js";
import { validateNewPassword } from "../auth/password-request.pipe.js";
import { grantAcademyWideScopes, grantUnitToAcademyWideUsers, hasAcademyWideScope } from "../organization/academy-scope.js";
import { findPosition, inferUnitType, isUnitType, positionDisplay, UNIT_POSITIONS, UNIT_TYPE_LABELS, UNIT_TYPES } from "../organization/unit-positions.js";

const MAX_POSITIONS_PER_USER = 10;
const POSITION_INCLUDE = { unitPositions: { include: { organizationUnit: { select: { id: true, name: true, unitType: true, status: true } } }, orderBy: { createdAt: "asc" as const } } };

type CreateUserInput = {
  username?: unknown;
  displayName?: unknown;
  password?: unknown;
  systemRole?: unknown;
  organizationUnitId?: unknown;
};

type UpdateUserInput = {
  displayName?: unknown;
  systemRole?: unknown;
  organizationUnitId?: unknown;
  status?: unknown;
};

type ListUsersInput = {
  keyword?: unknown;
  search?: unknown;
  systemRole?: unknown;
  organizationId?: unknown;
  organization?: unknown;
  status?: unknown;
};

type OrganizationUnitInput = {
  code?: unknown;
  name?: unknown;
  parentId?: unknown;
  status?: unknown;
  unitType?: unknown;
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly passwordService: PasswordService,
    private readonly authService?: AuthService
  ) {}

  async listUsers(input: ListUsersInput = {}) {
    const keyword = readOptionalDescription(input.keyword ?? input.search, 120);
    const systemRole = input.systemRole === undefined ? undefined : this.readSystemRole(input.systemRole);
    const organizationId = readOptionalDescription(input.organizationId, 80);
    const organization = readOptionalDescription(input.organization, 160);
    const status = readOptionalDescription(input.status, 40);
    const where: {
      OR?: Array<{ username: { contains: string; mode: "insensitive" } } | { displayName: { contains: string; mode: "insensitive" } }>;
      systemRole?: SystemRole;
      unit?: string;
      organizationScopes?: { some: { organizationUnitId: string } };
      status?: string;
    } = {};

    if (keyword) {
      where.OR = [
        { username: { contains: keyword, mode: "insensitive" } },
        { displayName: { contains: keyword, mode: "insensitive" } }
      ];
    }
    if (systemRole) {
      where.systemRole = systemRole;
    }
    if (organization) {
      where.unit = organization;
    }
    if (organizationId) {
      where.organizationScopes = { some: { organizationUnitId: organizationId } };
    }
    if (status) {
      where.status = this.readUserStatus(status);
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        organizationScopes: { include: { organizationUnit: true } },
        ...POSITION_INCLUDE
      },
      orderBy: { displayName: "asc" }
    });

    return users.map((user) => this.toUserResponse(user));
  }

  async listRoles() {
    return SYSTEM_ROLES.map((systemRole) => ({
      id: systemRole,
      code: systemRole,
      label: this.toRoleLabel(systemRole),
      status: "active"
    }));
  }

  /** Mặc định chỉ đơn vị đang hoạt động (dùng khi gán phạm vi); trang quản trị đơn vị lấy cả đơn vị đã tắt để bật lại. */
  async listOrganizationUnits(options: { includeInactive?: boolean } = {}) {
    const units = (await this.prisma.organizationUnit.findMany({
      where: options.includeInactive ? {} : { status: "active" },
      include: { unitPositions: { include: { user: { select: { id: true, displayName: true, status: true } } }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ status: "asc" }, { name: "asc" }]
    })) as Array<{ unitType: string; unitPositions: Array<{ userId: string; positionCode: string; user: { displayName: string; status: string } }> } & Record<string, unknown>>;
    return units.map(({ unitPositions, ...unit }) => ({
      ...unit,
      unitTypeLabel: isUnitType(unit.unitType) ? UNIT_TYPE_LABELS[unit.unitType] : unit.unitType,
      positions: (unitPositions ?? []).map((position) => ({
        userId: position.userId,
        displayName: position.user.displayName,
        userStatus: position.user.status,
        positionCode: position.positionCode,
        label: findPosition(unit.unitType, position.positionCode)?.label ?? position.positionCode
      }))
    }));
  }

  /** Danh mục loại đơn vị và chức danh của từng loại (cho giao diện quản trị). */
  listPositionCatalog() {
    return UNIT_TYPES.map((type) => ({ code: type, label: UNIT_TYPE_LABELS[type], positions: UNIT_POSITIONS[type] }));
  }

  /**
   * Gán chức danh cho tài khoản (thay toàn bộ danh sách). Mỗi đơn vị một chức danh; được kiêm nhiệm nhiều đơn
   * vị; chức danh phải đúng loại đơn vị và còn chỗ (Viện: 1 Giám đốc, 5 Phó Giám đốc; Phòng/Khoa/Bộ môn: 1 trưởng,
   * 2 phó). Đơn vị được khoá trong giao dịch nên hai lần gán đồng thời không vượt số lượng.
   */
  async setUserPositions(actor: SafeUserContext, userId: string, input: { positions?: unknown }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ message: "Không tìm thấy người dùng." });
    if (!Array.isArray(input.positions) || input.positions.length > MAX_POSITIONS_PER_USER) {
      throw new BadRequestException({ message: `Danh sách chức danh không hợp lệ (tối đa ${MAX_POSITIONS_PER_USER}).` });
    }
    const requested = new Map<string, string>();
    for (const raw of input.positions as unknown[]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException({ message: "Chức danh không hợp lệ." });
      const item = raw as Record<string, unknown>;
      const organizationUnitId = readText(item.organizationUnitId, "organizationUnitId", 80);
      const positionCode = readText(item.positionCode, "positionCode", 40);
      if (requested.has(organizationUnitId)) throw new BadRequestException({ message: "Mỗi đơn vị chỉ giữ một chức danh." });
      requested.set(organizationUnitId, positionCode);
    }

    const before = (await this.prisma.unitPosition.findMany({ where: { userId }, select: { organizationUnitId: true, positionCode: true } })) as Array<{ organizationUnitId: string; positionCode: string }>;
    await this.prisma.$transaction(async (tx) => {
      for (const [organizationUnitId, positionCode] of requested) {
        await tx.$queryRaw`SELECT id FROM organization_units WHERE id = ${organizationUnitId} FOR UPDATE`;
        const unit = await tx.organizationUnit.findUnique({ where: { id: organizationUnitId } });
        if (!unit || unit.status !== "active") throw new BadRequestException({ message: "Đơn vị không hợp lệ hoặc đã ngừng hoạt động." });
        const position = findPosition(unit.unitType, positionCode);
        if (!position) {
          throw new BadRequestException({ message: `Chức danh không áp dụng cho ${isUnitType(unit.unitType) ? UNIT_TYPE_LABELS[unit.unitType] : "đơn vị"} "${unit.name}".` });
        }
        const holders = await tx.unitPosition.count({ where: { organizationUnitId, positionCode, userId: { not: userId } } });
        if (holders >= position.max) {
          throw new ConflictException({ code: "POSITION_FULL", message: `${unit.name} đã đủ ${position.max} ${position.label}.` });
        }
      }
      await tx.unitPosition.deleteMany({ where: { userId } });
      for (const [organizationUnitId, positionCode] of requested) {
        await tx.unitPosition.create({ data: { organizationUnitId, userId, positionCode, assignedById: actor.id } });
      }
    });

    await this.auditLog.record({
      action: "set-user-unit-positions",
      result: "success",
      actorId: actor.id,
      targetEntity: "user",
      targetEntityId: userId,
      username: actor.username,
      reason: safeAuditContext({ before, after: [...requested].map(([organizationUnitId, positionCode]) => ({ organizationUnitId, positionCode })) })
    });

    const updated = await this.prisma.user.findUnique({ where: { id: userId }, include: { organizationScopes: { include: { organizationUnit: true } }, ...POSITION_INCLUDE } });
    return this.toUserResponse(updated!);
  }

  /**
   * Ảnh hưởng của việc tắt đơn vị: tài khoản đang hoạt động có phạm vi ở đơn vị này, và số tài khoản sẽ không
   * còn phạm vi hoạt động nào khác (phiên của họ bị từ chối ngay khi đơn vị tắt).
   */
  async organizationUnitImpact(unitId: string) {
    const unit = await this.prisma.organizationUnit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException({ message: "Không tìm thấy đơn vị." });
    const users = (await this.prisma.user.findMany({
      where: { status: "active", organizationScopes: { some: { organizationUnitId: unitId } } },
      select: { id: true, organizationScopes: { select: { organizationUnitId: true, organizationUnit: { select: { status: true } } } } }
    })) as Array<{ id: string; organizationScopes: Array<{ organizationUnitId: string; organizationUnit: { status: string } }> }>;
    const usersLosingAccess = users.filter((user) => !user.organizationScopes.some((scope) => scope.organizationUnitId !== unitId && scope.organizationUnit.status === "active")).length;
    return { unitId, scopedUsers: users.length, usersLosingAccess };
  }

  async createOrganizationUnit(actor: SafeUserContext, input: OrganizationUnitInput) {
    const parentId = input.parentId === undefined ? undefined : await this.readParentId(input.parentId);
    const unit = await this.writeOrganizationUnit(() => this.prisma.organizationUnit.create({
      data: {
        code: readCode(input.code, "code"),
        name: readText(input.name, "name"),
        parentId: parentId ?? undefined,
        status: input.status === undefined ? "active" : this.readActiveStatus(input.status),
        unitType: input.unitType === undefined ? inferUnitType(readText(input.name, "name")) : this.readUnitType(input.unitType)
      }
    }));
    if (unit.status === "active") await grantUnitToAcademyWideUsers(this.prisma as never, unit.id);

    await this.auditLog.record({
      action: "create-organization-unit",
      result: "success",
      actorId: actor.id,
      targetEntity: "organization-unit",
      targetEntityId: unit.id,
      username: actor.username
    });

    return unit;
  }

  async updateOrganizationUnit(actor: SafeUserContext, unitId: string, input: OrganizationUnitInput) {
    const data: {
      code?: string;
      name?: string;
      parentId?: string | null;
      status?: string;
      unitType?: string;
    } = {};

    if (input.code !== undefined) {
      data.code = readCode(input.code, "code");
    }
    if (input.name !== undefined) {
      data.name = readText(input.name, "name");
    }
    if (input.parentId !== undefined) {
      data.parentId = await this.readParentId(input.parentId, unitId);
    }
    if (input.status !== undefined) {
      data.status = this.readActiveStatus(input.status);
    }
    if (input.unitType !== undefined) {
      data.unitType = this.readUnitType(input.unitType);
      // Đổi loại đơn vị không được làm chức danh đang có mất nghĩa (ví dụ Viện → Khoa khi đang có Giám đốc).
      const held = (await this.prisma.unitPosition.findMany({ where: { organizationUnitId: unitId }, select: { positionCode: true } })) as Array<{ positionCode: string }>;
      if (held.some((position) => !findPosition(data.unitType!, position.positionCode))) {
        throw new BadRequestException({ message: "Đơn vị đang có người giữ chức danh không thuộc loại mới. Gỡ các chức danh đó trước khi đổi loại đơn vị." });
      }
    }

    const unit = await this.writeOrganizationUnit(() => this.prisma.organizationUnit.update({
      where: { id: unitId },
      data
    }));
    if (unit.status === "active") await grantUnitToAcademyWideUsers(this.prisma as never, unit.id);

    await this.auditLog.record({
      action: "update-organization-unit",
      result: "success",
      actorId: actor.id,
      targetEntity: "organization-unit",
      targetEntityId: unit.id,
      username: actor.username
    });

    return unit;
  }

  private writeOrganizationUnit<T>(write: () => Promise<T>) {
    return mapOrganizationUnitWriteError(write);
  }

  /** Cấp cha phải tồn tại, khác chính nó và không tạo vòng lặp trong cây đơn vị. Rỗng = không có cấp cha. */
  private async readParentId(value: unknown, unitId?: string) {
    const parentId = readOptionalDescription(value, 80) ?? null;
    if (!parentId) return null;
    const seen = new Set<string>();
    for (let cursor: string | null = parentId; cursor; ) {
      if (cursor === unitId || seen.has(cursor)) {
        throw new BadRequestException({ message: "Cấp cha này tạo thành vòng lặp trong cây đơn vị." });
      }
      seen.add(cursor);
      const parent = (await this.prisma.organizationUnit.findUnique({ where: { id: cursor } })) as { parentId?: string | null } | null;
      if (!parent) throw new BadRequestException({ message: "Đơn vị cấp cha không tồn tại." });
      cursor = parent.parentId ?? null;
    }
    return parentId;
  }

  async createUser(actor: SafeUserContext, input: CreateUserInput) {
    const username = readCode(input.username, "username").toLowerCase();
    const displayName = readText(input.displayName, "displayName");
    const passwordRaw = readText(input.password, "password", 256);
    const password = validateNewPassword(passwordRaw) as string;
    const systemRole = this.readSystemRole(input.systemRole);
    const organizationUnitId = readText(input.organizationUnitId, "organizationUnitId");

    const existing = await this.prisma.user.findUnique({ where: { usernameKey: username } });
    if (existing) {
      throw new BadRequestException({ message: "Tên đăng nhập đã tồn tại." });
    }

    const organizationUnit = await this.findActiveOrganizationUnit(organizationUnitId);
    const passwordHash = await this.passwordService.hashPassword(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          usernameKey: username,
          displayName,
          passwordHash,
          status: "active",
          systemRole,
          mustChangePassword: true,
          unit: organizationUnit.name
        }
      });

      await tx.userOrganizationScope.create({
        data: {
          userId: created.id,
          organizationUnitId: organizationUnit.id,
          isPrimary: true
        }
      });
      if (hasAcademyWideScope(systemRole)) await grantAcademyWideScopes(tx as never, created.id);

      return created;
    });

    await this.auditLog.record({
      action: "AUD-ST-1.3-01",
      result: "success",
      actorId: actor.id,
      targetEntity: "user",
      targetEntityId: user.id,
      username: actor.username,
      reason: safeAuditContext({
        username: user.username,
        systemRole,
        organizationUnitId: organizationUnit.id,
        organizationUnitName: organizationUnit.name
      })
    });

    return this.toUserResponse(user);
  }

  async updateUser(actor: SafeUserContext, userId: string, input: UpdateUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException({ message: "Không tìm thấy người dùng." });
    }

    const data: {
      displayName?: string;
      status?: string;
      systemRole?: string;
      unit?: string;
    } = {};

    if (input.displayName !== undefined) {
      data.displayName = readText(input.displayName, "displayName");
    }

    const auditEvents: Array<{ action: string; before: unknown; after: unknown }> = [];

    if (input.status !== undefined) {
      const status = this.readUserStatus(input.status);
      data.status = status;
      auditEvents.push({
        action: status === "active" ? "AUD-ST-1.3-06" : "AUD-ST-1.3-05",
        before: { status: existing.status },
        after: { status }
      });
    }

    if (input.systemRole !== undefined) {
      const systemRole = this.readSystemRole(input.systemRole);
      data.systemRole = systemRole;
      auditEvents.push({
        action: "AUD-ST-1.3-03",
        before: { systemRole: existing.systemRole },
        after: { systemRole }
      });
    }

    const organizationUnit =
      input.organizationUnitId === undefined
        ? undefined
        : await this.findActiveOrganizationUnit(readText(input.organizationUnitId, "organizationUnitId"));

    if (organizationUnit) {
      data.unit = organizationUnit.name;
      auditEvents.push({
        action: "AUD-ST-1.3-04",
        before: { unit: existing.unit },
        after: { organizationUnitId: organizationUnit.id, unit: organizationUnit.name }
      });
    }

    if (input.displayName !== undefined) {
      auditEvents.unshift({
        action: "AUD-ST-1.3-02",
        before: { displayName: existing.displayName },
        after: { displayName: data.displayName }
      });
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data
      });

      if (organizationUnit) {
        // Đổi đơn vị chính là chuyển công tác: gỡ phạm vi của đơn vị chính cũ để người dùng không còn xem được
        // dữ liệu đơn vị đó. Phạm vi phụ đã cấp riêng (nhiều đơn vị) được giữ nguyên.
        await tx.userOrganizationScope.deleteMany({
          where: { userId, isPrimary: true, organizationUnitId: { not: organizationUnit.id } }
        });
        await tx.userOrganizationScope.upsert({
          where: { userId_organizationUnitId: { userId, organizationUnitId: organizationUnit.id } },
          update: { isPrimary: true },
          create: { userId, organizationUnitId: organizationUnit.id, isPrimary: true }
        });
      }
      // Vai trò toàn Học viện luôn có đủ mọi đơn vị, kể cả sau khi đổi vai trò hoặc đổi đơn vị chính.
      if (hasAcademyWideScope((data.systemRole as string | undefined) ?? existing.systemRole)) await grantAcademyWideScopes(tx as never, userId);

      return updated;
    });

    for (const event of auditEvents) {
      await this.auditLog.record({
        action: event.action,
        result: "success",
        actorId: actor.id,
        targetEntity: "user",
        targetEntityId: user.id,
        username: actor.username,
        reason: safeAuditContext({ before: event.before, after: event.after })
      });
    }

    return this.toUserResponse(user);
  }

  async setUserStatus(actor: SafeUserContext, userId: string, statusInput: unknown) {
    return this.updateUser(actor, userId, { status: statusInput });
  }

  async initiatePasswordReset(actor: SafeUserContext, userId: string, context: { ip?: string; userAgent?: string }) {
    if (!this.authService) {
      throw new BadRequestException({ message: "Dịch vụ đặt lại mật khẩu chưa sẵn sàng." });
    }
    return this.authService.initiatePasswordReset(actor, userId, context);
  }

  private readSystemRole(value: unknown): SystemRole {
    const systemRole = readText(value, "systemRole", 80);
    if (!SYSTEM_ROLES.includes(systemRole as SystemRole)) {
      throw new BadRequestException({ message: "Vai trò hệ thống không hợp lệ." });
    }

    return systemRole as SystemRole;
  }

  private toRoleLabel(systemRole: SystemRole) {
    const labels: Record<string, string> = {
      SYSTEM_ADMIN: "Quản trị hệ thống",
      LEADERSHIP_APPROVAL_AUTHORITY: "Giám đốc Học viện",
      SCIENCE_DEPUTY_DIRECTOR: "Phó Giám đốc phụ trách Khoa học",
      RESEARCH_OVERSIGHT_AUTHORITY: "Phó Giám đốc",
      RESEARCH_MANAGEMENT_HEAD: "Trưởng phòng KHQS",
      RESEARCH_MANAGEMENT_DEPUTY_HEAD: "Phó phòng KHQS",
      RESEARCH_BOARD_HEAD: "Trưởng ban QLKH",
      RESEARCH_MANAGEMENT_STAFF: "Chuyên viên quản lý khoa học",
      RESEARCHER_INTERNAL_USER: "Người dùng nghiên cứu nội bộ",
      EXTERNAL_RESEARCHER_USER: "Nhà nghiên cứu bên ngoài"
    };
    return labels[systemRole] ?? systemRole;
  }


  private async findActiveOrganizationUnit(id: string) {
    const organizationUnit = await this.prisma.organizationUnit.findUnique({ where: { id } });
    if (!organizationUnit || organizationUnit.status !== "active") {
      throw new BadRequestException({ message: "Đơn vị không hợp lệ." });
    }

    return organizationUnit;
  }

  private readUnitType(value: unknown) {
    if (!isUnitType(value)) throw new BadRequestException({ message: "Loại đơn vị không hợp lệ." });
    return value;
  }

  private readActiveStatus(value: unknown) {
    const status = readText(value, "status", 40);
    if (status !== "active" && status !== "inactive") {
      throw new BadRequestException({ message: "Trạng thái không hợp lệ." });
    }

    return status;
  }

  private readUserStatus(value: unknown) {
    const status = readText(value, "status", 40);
    if (status !== "active" && status !== "disabled" && status !== "locked") {
      throw new BadRequestException({ message: "Trạng thái người dùng không hợp lệ." });
    }

    return status;
  }

  private toUserResponse(user: {
    id: string;
    username: string | null;
    displayName: string;
    status: string;
    systemRole: string | null;
    unit: string;
    organizationScopes?: Array<{
      isPrimary: boolean;
      organizationUnit: {
        id: string;
        name: string;
      };
    }>;
    unitPositions?: Array<{ organizationUnitId: string; positionCode: string; organizationUnit: { name: string; unitType: string } }>;
  }) {
    const organizationScope = user.organizationScopes?.find((scope) => scope.isPrimary) ?? user.organizationScopes?.[0];

    return {
      id: user.id,
      username: user.username ?? "",
      displayName: user.displayName,
      status: user.status,
      systemRole: user.systemRole,
      unit: user.unit,
      organizationUnitId: organizationScope?.organizationUnit.id,
      positions: (user.unitPositions ?? []).map((position) => ({
        organizationUnitId: position.organizationUnitId,
        unitName: position.organizationUnit.name,
        positionCode: position.positionCode,
        label: positionDisplay(position.organizationUnit.unitType, position.positionCode, position.organizationUnit.name)
      }))
    };
  }
}

/** Lỗi ràng buộc của Prisma khi ghi đơn vị → thông báo rõ ràng thay vì lỗi 500. */
async function mapOrganizationUnitWriteError<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") throw new ConflictException({ code: "ORGANIZATION_UNIT_CODE_TAKEN", message: "Mã đơn vị đã tồn tại." });
    if (code === "P2025") throw new NotFoundException({ message: "Không tìm thấy đơn vị." });
    throw error;
  }
}

function readOptionalDescription(value: unknown, maxLength = 500) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return readText(value, "description", maxLength);
}

function safeAuditContext(value: unknown) {
  return JSON.stringify(value);
}
