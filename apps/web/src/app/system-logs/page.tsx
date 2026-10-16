import { SystemLogsPanel } from "@/components/admin/system-logs-panel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";

export default function SystemLogsPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Quản trị" }, { label: "Nhật ký hệ thống" }]} />
      <PageHeader
        eyebrow="Quản trị"
        title="Nhật ký hệ thống"
        description="Tra cứu các thao tác quan trọng gần đây: đăng nhập, mật khẩu, tài khoản, tệp, tờ trình và phê duyệt."
      />
      <SystemLogsPanel />
    </>
  );
}
