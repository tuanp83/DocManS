"use client";

import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardAnalytics } from "@/components/dashboard/dashboard-analytics";
import { getApiBaseUrl } from "@/lib/session";
import { DASHBOARD_FILTER_KEYS } from "@/lib/dashboard-api";
import { useNotice } from "@/components/ui/confirm-dialog";

export default function DashboardPage() {
  const notice = useNotice();
  const handleExport = async () => {
    try {
      // Xuất đúng danh sách theo bộ lọc đang chọn (bộ lọc của Dashboard nằm trên URL).
      const current = new URLSearchParams(window.location.search);
      const query = new URLSearchParams();
      for (const key of DASHBOARD_FILTER_KEYS) if (current.get(key)) query.set(key, current.get(key)!);
      const response = await fetch(`${getApiBaseUrl()}/dashboard/export-proposals${query.size ? `?${query}` : ""}`, { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Danh_sach_de_tai.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      await notice("Không tải được tệp Excel danh sách đề tài. Vui lòng thử lại.", "Lỗi xuất Excel");
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard" }]} />
      <PageHeader
        eyebrow="Tổng quan hệ thống"
        title="Dashboard — Quản lý Nghiên cứu Khoa học"
        description="Theo dõi tiến độ, kinh phí, sản phẩm của đề tài và tình hình hồ sơ đề xuất tại Học viện Quân Y. Bấm vào số liệu để xem danh sách chi tiết."
        actions={
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="button secondary" onClick={handleExport}>
              Tải Excel theo bộ lọc
            </button>
            <Link className="button primary" href="/my-proposals">
              Hồ sơ của tôi
            </Link>
          </div>
        }
      />
      <DashboardAnalytics />
    </>
  );
}
