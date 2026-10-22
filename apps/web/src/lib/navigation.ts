import {
  getNavigationItems as getRoleNavigationItems,
  getRouteDefinition,
  type NavigationItem,
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

  // "Theo dõi đề tài" nằm trong "Quản lý đề tài" (tab trên /proposals): vai trò có trang Quản lý đề tài không còn mục
  // /projects riêng; trang chi tiết đề tài (/projects/...) vẫn đánh dấu mục Quản lý đề tài. Nhà khoa học, người ngoài
  // Học viện không có /proposals nên giữ mục "Theo dõi đề tài" (đề tài của mình).
  if (items.some((item) => item.href === "/proposals")) {
    items = items.filter((item) => item.href !== "/projects").map((item) => (item.href === "/proposals" ? { ...item, alsoActiveFor: ["/projects"] } : item));
  }

  return items;
}

/** Mục menu đang mở: đúng đường dẫn, trang con của nó, hoặc trang thuộc mục (alsoActiveFor). */
export function isNavigationItemActive(pathname: string, item: Pick<NavigationItem, "href" | "alsoActiveFor">) {
  return [item.href, ...(item.alsoActiveFor ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

/** Vai trò xem "Theo dõi đề tài" bên trong "Quản lý đề tài" (/proposals?tab=projects). */
export function hasProjectTrackingInProposals(role: UserRole) {
  return getRoleNavigationItems(role).some((item) => item.href === "/proposals");
}

/** Trang đầu của từng vai trò: Quản trị hệ thống không có dashboard nghiệp vụ nên vào trang Người dùng. */
export function getHomeRoute(role?: string | null) {
  return role === "SYSTEM_ADMIN" ? "/users" : "/dashboard";
}

export function getPageTitle(pathname: string) {
  return getRouteDefinition(pathname)?.title ?? "Dashboard";
}
