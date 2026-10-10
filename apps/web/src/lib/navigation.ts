import {
  getNavigationItems as getRoleNavigationItems,
  getRouteDefinition,
  type UserRole
} from "@/fixtures/shell-context";

export function getNavigationItems(role: UserRole, account?: { unit?: string }) {
  let items = getRoleNavigationItems(role);
  if (role === "SYSTEM_ADMIN" && !items.some((item) => item.href === "/researcher-profiles")) {
    const profileItem = getRoleNavigationItems("RESEARCH_MANAGEMENT_STAFF").find((item) => item.href === "/researcher-profiles");
    if (profileItem) items = [...items, profileItem];
  }
  // Chuyên viên QLKH không có quyền Đánh giá hồ sơ (/reviews); thẩm quyền thuộc Trưởng phòng QLKH.
  if (role === "RESEARCH_MANAGEMENT_STAFF") {
    items = items.filter((item) => item.href !== "/reviews");
  }

  // FEATURE FLAG: "Giao việc" (/tasks) chờ Đợt 2 (docs/design/quan-ly-tien-do-nhiem-vu.md); "Việc của tôi" đã dùng dữ liệu thật.
  items = items.filter((item) => item.href !== "/tasks");

  return items;
}

export function getPageTitle(pathname: string) {
  return getRouteDefinition(pathname)?.title ?? "Dashboard";
}
