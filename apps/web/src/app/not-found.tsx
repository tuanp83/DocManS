import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Đường dẫn không tồn tại: báo rõ thay vì hiện một trang nghiệp vụ giả. */
export default function NotFound() {
  return (
    <>
      <Breadcrumb items={[{ label: "Không tìm thấy trang" }]} />
      <PageHeader eyebrow="Lỗi 404" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã được thay đổi." />
      <EmptyState title="Trang bạn tìm không có trong hệ thống" message="Kiểm tra lại đường dẫn, hoặc chọn chức năng trong thanh điều hướng." />
      <p style={{ marginTop: 16 }}>
        <Link className="button" href="/">
          Về trang đầu
        </Link>
      </p>
    </>
  );
}
