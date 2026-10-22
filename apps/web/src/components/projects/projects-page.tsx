"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectList } from "@/components/projects/project-list";
import { hasProjectTrackingInProposals } from "@/lib/navigation";

/**
 * /projects: vai trò có "Quản lý đề tài" xem Theo dõi đề tài ở tab trong /proposals (chuyển hướng, giữ được liên kết
 * cũ); nhà khoa học, người ngoài Học viện xem đề tài của mình tại đây.
 */
export function ProjectsPage() {
  const router = useRouter();
  const { account } = useSession();
  const inProposals = account ? hasProjectTrackingInProposals(account.systemRole) : false;
  useEffect(() => { if (inProposals) router.replace("/proposals?tab=projects"); }, [inProposals, router]);
  if (!account || inProposals) return null;
  return <><Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Theo dõi đề tài" }]} /><PageHeader eyebrow="Đề tài" title="Theo dõi đề tài" description="Tiến độ, mốc thực hiện và yêu cầu theo thẩm quyền trên từng đề tài." /><ProjectList /></>;
}
