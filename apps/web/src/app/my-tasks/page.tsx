import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkQueueList } from "@/components/work-queue/work-queue-list";

export default function MyTasksPage() {
  return <><Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Việc của tôi" }]} /><PageHeader eyebrow="Nhiệm vụ" title="Việc của tôi" description="Mọi việc đang chờ bạn trên các đề tài và hồ sơ bạn tham gia hoặc phụ trách, xếp theo hạn." /><WorkQueueList /></>;
}
