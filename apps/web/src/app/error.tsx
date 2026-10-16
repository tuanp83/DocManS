"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Lỗi khi hiển thị một trang: báo bằng tiếng Việt, cho thử lại thay vì để trang trắng. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Breadcrumb items={[{ label: "Có lỗi xảy ra" }]} />
      <PageHeader eyebrow="Lỗi hệ thống" title="Không hiển thị được trang này" description="Trang gặp lỗi trong lúc tải. Dữ liệu đã lưu không bị ảnh hưởng." />
      <EmptyState
        title="Vui lòng thử lại"
        message={`Nếu lỗi lặp lại, hãy báo quản trị hệ thống${error.digest ? ` kèm mã lỗi ${error.digest}` : ""}.`}
      />
      <p className="button-row" style={{ justifyContent: "flex-start", marginTop: 16 }}>
        <button type="button" className="button primary" onClick={reset}>
          Thử lại
        </button>
        <Link className="button" href="/">
          Về trang đầu
        </Link>
      </p>
    </>
  );
}
