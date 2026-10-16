"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type { NavigationItem } from "@/fixtures/shell-context";

/**
 * Tìm nhanh theo mã hồ sơ, tên đề tài, chủ nhiệm: chuyển sang danh sách hồ sơ mà vai trò được xem
 * (Quản lý/Giám sát hồ sơ, nếu không thì Hồ sơ của tôi) với từ khóa điền sẵn vào bộ lọc.
 * Vai trò không có danh sách hồ sơ (Quản trị hệ thống) thì không hiện ô tìm kiếm.
 */
export function QuickSearch({ navigationItems }: { navigationItems: NavigationItem[] }) {
  const router = useRouter();
  const target = ["/proposals", "/my-proposals"].find((href) => navigationItems.some((item) => item.href === href));
  if (!target) return null;

  return (
    <form
      className="quick-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const keyword = String(new FormData(event.currentTarget).get("q") ?? "").trim();
        router.push(keyword ? `${target}?q=${encodeURIComponent(keyword)}` : target);
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input name="q" type="search" aria-label="Tìm kiếm nhanh hồ sơ đề xuất" placeholder="Tìm mã hồ sơ, đề tài, chủ nhiệm..." />
    </form>
  );
}
