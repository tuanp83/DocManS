import { describe, expect, it } from "vitest";
import { getNavigationItems, hasProjectTrackingInProposals, isNavigationItemActive } from "@/lib/navigation";

// "Theo dõi đề tài" nằm trong "Quản lý đề tài" (tab /proposals?tab=projects).

const MERGED = ["LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_BOARD_HEAD", "RESEARCH_MANAGEMENT_STAFF", "RESEARCH_OVERSIGHT_AUTHORITY"] as const;

describe("menu Quản lý đề tài", () => {
  it("vai trò có Quản lý đề tài không còn mục Theo dõi đề tài riêng; trang chi tiết đề tài đánh dấu Quản lý đề tài", () => {
    for (const role of MERGED) {
      const items = getNavigationItems(role);
      expect(items.some((item) => item.href === "/projects"), role).toBe(false);
      const proposals = items.find((item) => item.href === "/proposals")!;
      expect(isNavigationItemActive("/projects/abc", proposals), role).toBe(true);
      expect(isNavigationItemActive("/proposals", proposals), role).toBe(true);
      expect(hasProjectTrackingInProposals(role), role).toBe(true);
    }
  });

  it("nhà khoa học, người ngoài Học viện giữ mục Theo dõi đề tài (đề tài của mình)", () => {
    for (const role of ["RESEARCHER_INTERNAL_USER", "EXTERNAL_RESEARCHER_USER"] as const) {
      expect(getNavigationItems(role).some((item) => item.href === "/projects"), role).toBe(true);
      expect(hasProjectTrackingInProposals(role), role).toBe(false);
    }
    expect(isNavigationItemActive("/projects-x", { href: "/projects" })).toBe(false);
  });
});
