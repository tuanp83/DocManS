import type { SystemRole } from "@rtms/permissions";

export const AUTH_SESSION_COOKIE = "rtms_session";

export type CurrentUser = {
  mustChangePassword?: boolean;
  researcherProfileId?: string;
  /** Chức danh tại đơn vị, ví dụ "Trưởng khoa – Khoa Nội" (chỉ để hiển thị). */
  positions?: string[];
  id: string;
  username: string;
  displayName: string;
  systemRole: SystemRole;
  unit: string;
  organizationScopes?: Array<{
    id: string;
    code: string;
    name: string;
  }>;
};

export type ShellAccount = {
  mustChangePassword?: boolean;
  researcherProfileId?: string;
  id: string;
  username: string;
  name: string;
  /** Account-level system role. Drives navigation only — never a record-scoped capability. */
  systemRole: CurrentUser["systemRole"];
  systemRoleLabel: string;
  unit: string;
  /** Chức danh tại đơn vị (chỉ để hiển thị). */
  positions: string[];
  initials: string;
  organizationScopes?: CurrentUser["organizationScopes"];
};

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
}

export function toShellAccount(user: CurrentUser): ShellAccount {
  return {
    mustChangePassword: user.mustChangePassword,
    researcherProfileId: user.researcherProfileId,
    id: user.id,
    username: user.username,
    name: user.displayName,
    systemRole: user.systemRole,
    systemRoleLabel: getSystemRoleLabel(user.systemRole),
    unit: user.unit,
    positions: user.positions ?? [],
    initials: user.displayName.trim().charAt(0).toUpperCase() || "U",
    organizationScopes: user.organizationScopes
  };
}

const SYSTEM_ROLE_LABELS: Record<string, string> = {
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

export function getSystemRoleLabel(systemRole: CurrentUser["systemRole"]) {
  return SYSTEM_ROLE_LABELS[systemRole] ?? "Nhà nghiên cứu bên ngoài";
}
