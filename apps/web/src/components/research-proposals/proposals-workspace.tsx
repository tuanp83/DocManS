"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Files } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectList } from "@/components/projects/project-list";
import { ResearchProposalsPanel } from "@/components/research-proposals/research-proposals-panel";

type WorkspaceTab = "proposals" | "projects";

const TABS: Record<WorkspaceTab, { label: string; eyebrow: string; title: string; description: string }> = {
  proposals: {
    label: "Hồ sơ đề xuất",
    eyebrow: "Quản lý đề tài",
    title: "Danh sách hồ sơ đề tài",
    description: "Theo dõi hồ sơ theo đợt tiếp nhận, trạng thái, thời gian thực hiện và lịch sử nộp."
  },
  projects: {
    label: "Theo dõi đề tài",
    eyebrow: "Quản lý đề tài",
    title: "Theo dõi đề tài",
    description: "Tiến độ, mốc thực hiện, sức khoẻ và hạn gần nhất của đề tài đang thực hiện, theo thẩm quyền trên từng đề tài."
  }
};

/** Quản lý đề tài: hồ sơ đề xuất và theo dõi đề tài đang thực hiện trên cùng một trang (/proposals?tab=projects). */
export function ProposalsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab: WorkspaceTab = searchParams.get("tab") === "projects" ? "projects" : "proposals";
  const current = TABS[tab];

  const select = (next: WorkspaceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "projects") params.set("tab", "projects");
    else params.delete("tab");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Quản lý đề tài", href: tab === "projects" ? "/proposals" : undefined }, ...(tab === "projects" ? [{ label: current.label }] : [])]} />
      <PageHeader eyebrow={current.eyebrow} title={current.title} description={current.description} />
      <nav className="tabs-nav" aria-label="Quản lý đề tài" style={{ marginBottom: "20px" }}>
        {(Object.keys(TABS) as WorkspaceTab[]).map((key) => (
          <button key={key} type="button" className={`tab-btn ${tab === key ? "active" : ""}`} aria-pressed={tab === key} onClick={() => select(key)}>
            {key === "proposals" ? <Files size={16} aria-hidden="true" /> : <FolderKanban size={16} aria-hidden="true" />}
            <span>{TABS[key].label}</span>
          </button>
        ))}
      </nav>
      {tab === "projects" ? <ProjectList /> : <ResearchProposalsPanel allowCreate={false} />}
    </>
  );
}
