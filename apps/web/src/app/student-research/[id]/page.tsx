import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { StudentProjectDetail } from "@/components/student-research/student-project-detail";

export default async function StudentResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "NCKH Sinh viên", href: "/student-research" }, { label: "Chi tiết đề tài" }]} /><PageHeader eyebrow="NCKH" title="Chi tiết đề tài NCKH Sinh viên" description="Thông tin, tài liệu và kết quả của đề tài." /><StudentProjectDetail id={id} /></>;
}
