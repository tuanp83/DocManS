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
  // Quy định 10/2026: chuyên viên QLKH cũng điều phối đánh giá (phân công, tổng hợp), nên thấy /reviews.

  // FEATURE FLAG: "Giao việc" (/tasks) chờ Đợt 2 (docs/design/quan-ly-tien-do-nhiem-vu.md); "Việc của tôi" đã dùng dữ liệu thật.
  items = items.filter((item) => item.href !== "/tasks");

  return items;
}

export function getPageTitle(pathname: string) {
  return getRouteDefinition(pathname)?.title ?? "Dashboard";
}
