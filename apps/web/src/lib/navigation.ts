import {
  getNavigationItems as getRoleNavigationItems,
  getRouteDefinition,
  type UserRole
} from "@/fixtures/shell-context";

export function getNavigationItems(role: UserRole, account?: { unit?: string }) {
  let items = getRoleNavigationItems(role);
  if (role === "SYSTEM_ADMIN" && !items.some((item) => item.href === "/researcher-profiles")) {
    const profileItem = getRoleNavigationItems("SCIENTIFIC_MANAGEMENT_STAFF").find((item) => item.href === "/researcher-profiles");
    if (profileItem) items = [...items, profileItem];
  }
  // Chuyên viên QLKH không có quyền Đánh giá hồ sơ (/reviews)
  if (account?.unit && account.unit.toLowerCase().includes("chuyên viên")) {
    items = items.filter((item) => item.href !== "/reviews");
  }
  return items;
}

export function getPageTitle(pathname: string) {
  return getRouteDefinition(pathname)?.title ?? "Dashboard";
}
