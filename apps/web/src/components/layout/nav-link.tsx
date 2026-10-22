"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { isNavigationItemActive } from "@/lib/navigation";

export function NavLink({
  href,
  label,
  icon: Icon,
  alsoActiveFor
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  alsoActiveFor?: string[];
}) {
  const pathname = usePathname();
  const isActive = isNavigationItemActive(pathname, { href, alsoActiveFor });

  return (
    <Link className={`nav-link ${isActive ? "is-active" : ""}`} href={href}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
