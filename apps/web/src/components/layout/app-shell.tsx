"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { useSession } from "@/components/auth/session-provider";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { QuickSearch } from "@/components/layout/quick-search";
import { getHomeRoute, getNavigationItems } from "@/lib/navigation";
import { isPublicRoute } from "@/lib/session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account, isLoading } = useSession();

  if (isPublicRoute(pathname)) {
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
          <Link className="topbar-brand" href={getHomeRoute(account.systemRole)} aria-label="Hệ thống quản lý nghiên cứu khoa học">
            <BrandMark />
            <div>
              <strong>HỆ THỐNG QUẢN LÝ NGHIÊN CỨU KHOA HỌC, CÔNG NGHỆ VÀ ĐỔI MỚI SÁNG TẠO</strong>
              <span>Học viện Quân y</span>
            </div>
          </Link>
          <QuickSearch navigationItems={navigationItems} />
          <div className="topbar-actions">
            <NotificationBell />
            <details className="user-menu">
              <summary className="user-chip" aria-label="Người dùng hiện tại">
                <span className="avatar">{account.initials}</span>
                <div>
                  <span className="user-name">{account.name}</span>
                  <span className="user-role">
                    {account.positions.length
                      ? `${account.positions[0]}${account.positions.length > 1 ? ` (+${account.positions.length - 1})` : ""}`
                      : account.unit && !account.systemRoleLabel.toLowerCase().includes(account.unit.toLowerCase())
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
                {account.positions.map((position) => (
                  <p key={position} className="user-menu-meta" style={{ fontWeight: 600 }}>
                    {position}
                  </p>
                ))}
                {account.systemRole !== "SYSTEM_ADMIN" ? <a className="button" href="/my-profile">Lý lịch khoa học</a> : null}
                {account.systemRole === "RESEARCHER_INTERNAL_USER" || account.systemRole === "EXTERNAL_RESEARCHER_USER" ? (
                  <>
                    <a className="button" href="/invitation-to-review">Được mời phản biện</a>
                    <a className="button" href="/my-tasks">Việc của tôi</a>
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
