"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSession } from "@/components/auth/session-provider";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getNavigationItems } from "@/lib/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account, isLoading } = useSession();

  if (pathname === "/login" || pathname === "/password-reset") {
    return <>{children}</>;
  }

  if (isLoading || !account) {
    return (
      <main className="content auth-loading" id="main-content" aria-live="polite">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (account.mustChangePassword) {
    return (
      <main className="content" id="main-content">
        <p role="status">Bạn phải đổi mật khẩu tạm thời trước khi tiếp tục.</p>
        {pathname === "/change-password" ? children : <a href="/change-password">Đổi mật khẩu</a>}
        <LogoutButton />
      </main>
    );
  }

  const navigationItems = getNavigationItems(account.systemRole, account);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-row topbar-row-main">
          <Link className="topbar-brand" href="/dashboard" aria-label="Hệ thống quản lý nghiên cứu khoa học">
            <BrandMark />
            <div>
              <strong>HỆ THỐNG QUẢN LÝ NGHIÊN CỨU KHOA HỌC, CÔNG NGHỆ VÀ ĐỔI MỚI SÁNG TẠO</strong>
              <span>Học viện Quân y</span>
            </div>
          </Link>
          <div className="quick-search">
            <Search size={18} aria-hidden="true" />
            <input aria-label="Tìm kiếm nhanh" placeholder="Tìm mã hồ sơ, đề tài, chủ nhiệm..." />
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <details className="user-menu">
              <summary className="user-chip" aria-label="Người dùng hiện tại">
                <span className="avatar">{account.initials}</span>
                <div>
                  <span className="user-name">{account.name}</span>
                  <span className="user-role">
                    {account.unit && !account.systemRoleLabel.toLowerCase().includes(account.unit.toLowerCase())
                      ? `${account.systemRoleLabel} - ${account.unit}`
                      : account.systemRoleLabel}
                  </span>
                </div>
                <ChevronDown className="user-caret" size={16} aria-hidden="true" />
              </summary>
              <div className="user-menu-panel">
                <p className="user-menu-heading">{account.name}</p>
                <p className="user-menu-meta">
                  {account.unit && !account.systemRoleLabel.toLowerCase().includes(account.unit.toLowerCase())
                    ? `${account.systemRoleLabel} - ${account.unit}`
                    : account.systemRoleLabel}
                </p>
                {account.systemRole === "RESEARCHER_INTERNAL_USER" || account.systemRole === "EXTERNAL_RESEARCHER_USER" || account.researcherProfileId ? (
                  <>
                    <a className="button" href="/my-profile">Lý lịch khoa học</a>
                    <a className="button" href="/invitation-to-review">Được mời phản biện</a>
                    <a className="button" href="/my-tasks">Nhiệm vụ</a>
                  </>
                ) : null}
                <a className="button" href="/change-password">Đổi mật khẩu</a>
                <LogoutButton />
              </div>
            </details>
            <MobileNav />
          </div>
        </div>
        <nav className="topbar-row topbar-nav" aria-label="Điều hướng chính">
          {navigationItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>
      </header>
      <main className="content" id="main-content">
        {children}
      </main>
    </div>
  );
}

export function BrandMark() {
  return (
    <div className="brand-mark">
      <Image src="/logo.png" alt="Học viện Quân y" width={42} height={43} priority />
    </div>
  );
}
