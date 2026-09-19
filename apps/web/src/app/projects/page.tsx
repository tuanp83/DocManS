import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectTrackingWorkspace } from "@/components/projects/project-tracking-workspace";

export default function ProjectsPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Theo dõi đề tài" }]} />
      <PageHeader
        eyebrow="Quản lý tiến độ NCKH"
        title="Theo dõi đề tài đang thực hiện"
        description="Tổng hợp trạng thái thực hiện, quản lý các mốc báo cáo định kỳ và hệ thống cảnh báo trễ hạn gửi đến Nhà quản lý cùng Chủ nhiệm đề tài."
      />
      <ProjectTrackingWorkspace />
    </>
  );
}
