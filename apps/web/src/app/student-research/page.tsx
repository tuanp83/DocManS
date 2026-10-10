import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { StudentProjectList } from "@/components/student-research/student-project-list";

export default function StudentResearchPage() {
  return <><Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "NCKH Sinh viên" }]} /><PageHeader eyebrow="NCKH" title="Đề tài NCKH Sinh viên" description="Quản lý và giám sát các đề tài nghiên cứu khoa học của sinh viên." /><StudentProjectList /></>;
}
