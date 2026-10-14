import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionsInbox } from "@/components/approvals/submissions-inbox";

export default function SubmissionsPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tờ trình" }]} />
      <PageHeader
        eyebrow="Phòng Khoa học quân sự"
        title="Tờ trình qua Phòng KHQS"
        description="Chuyên viên lập → Trưởng ban QLKH rà soát, trình → Trưởng phòng KHQS duyệt → Ban giám đốc ký. Trả lại ở bước nào cũng về chuyên viên."
      />
      <SubmissionsInbox />
    </>
  );
}
