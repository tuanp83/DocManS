import type { Prisma } from "@prisma/client";
import type { SystemRole } from "../auth/auth.types.js";

/**
 * Vai trò có phạm vi toàn Học viện: Ban giám đốc (Giám đốc/Phó Giám đốc, Phó Giám đốc phụ trách Khoa học,
 * Phó Giám đốc theo dõi), Trưởng phòng KHQS và Trưởng ban QLKH. Các vai trò này luôn có phạm vi mọi đơn vị
 * đang hoạt động; hệ thống tự cấp khi tạo tài khoản, đổi vai trò và khi thêm hoặc kích hoạt đơn vị.
 */
export const ACADEMY_WIDE_SCOPE_ROLES = [
  "LEADERSHIP_APPROVAL_AUTHORITY",
  "SCIENCE_DEPUTY_DIRECTOR",
  "RESEARCH_OVERSIGHT_AUTHORITY",
  "RESEARCH_MANAGEMENT_HEAD",
  "RESEARCH_BOARD_HEAD"
] as const satisfies readonly SystemRole[];

export function hasAcademyWideScope(systemRole?: string | null) {
  return (ACADEMY_WIDE_SCOPE_ROLES as readonly string[]).includes(systemRole ?? "");
}

/** Đủ cho cả PrismaService lẫn client trong giao dịch. */
type ScopeClient = Pick<Prisma.TransactionClient, "organizationUnit" | "user" | "userOrganizationScope">;

/** Cấp cho một tài khoản phạm vi mọi đơn vị đang hoạt động (chỉ thêm, không gỡ). Trả về số đơn vị được thêm. */
export async function grantAcademyWideScopes(client: ScopeClient, userId: string) {
  const units = await client.organizationUnit.findMany({ where: { status: "active" }, select: { id: true } });
  if (units.length === 0) return 0;
  const hasPrimary = Boolean(await client.userOrganizationScope.findFirst({ where: { userId, isPrimary: true }, select: { id: true } }));
  const result = await client.userOrganizationScope.createMany({
    data: units.map((unit, index) => ({ userId, organizationUnitId: unit.id, isPrimary: !hasPrimary && index === 0 })),
    skipDuplicates: true
  });
  return result.count;
}

/** Cấp một đơn vị (vừa tạo hoặc vừa kích hoạt lại) cho mọi tài khoản có phạm vi toàn Học viện. */
export async function grantUnitToAcademyWideUsers(client: ScopeClient, organizationUnitId: string) {
  const users = await client.user.findMany({ where: { systemRole: { in: [...ACADEMY_WIDE_SCOPE_ROLES] } }, select: { id: true } });
  if (users.length === 0) return 0;
  const result = await client.userOrganizationScope.createMany({
    data: users.map((user) => ({ userId: user.id, organizationUnitId, isPrimary: false })),
    skipDuplicates: true
  });
  return result.count;
}
