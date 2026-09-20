"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";

function formatBudget(amount: number) {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)} tỷ đ`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(0)} triệu đ`;
  }
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

interface DashboardKpis {
  total: number;
  pending: number;
  approved: number;
  overdue: number;
  totalApprovedBudget: number;
  submittedThisMonth: number;
}

import { getApiBaseUrl } from "@/lib/session";

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/dashboard/stats`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.kpis) setKpis(data.kpis);
      })
      .catch(console.error);
  }, []);

  const handleExport = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/dashboard/export-proposals`, { credentials: "include" });
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
    } catch (err) {
      alert("Lỗi khi tải báo cáo Excel.");
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard" }]} />
      <PageHeader
        eyebrow="Tổng quan hệ thống"
        title="Dashboard — Quản lý Nghiên cứu Khoa học"
        description="Theo dõi tình hình đề tài, đánh giá, và quyết định phê duyệt tại Học viện Quân Y."
        actions={
          <div style={{ display: "flex", gap: "12px" }}>
            <button className="button secondary" onClick={handleExport}>
              Tải báo cáo Excel
            </button>
            <Link className="button primary" href="/my-proposals">
              Hồ sơ của tôi
            </Link>
          </div>
        }
      />

      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard
          label="Tổng đề tài"
          value={kpis ? String(kpis.total) : "—"}
          meta="Toàn bộ hệ thống"
          tone="default"
        />
        <KpiCard
          label="Chờ xử lý"
          value={kpis ? String(kpis.pending) : "—"}
          meta="Cần phản hồi"
          tone={kpis && kpis.pending > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Đã phê duyệt"
          value={kpis ? String(kpis.approved) : "—"}
          meta="Đề tài đã duyệt"
          tone="info"
        />
        <KpiCard
          label="Quá hạn"
          value={kpis ? String(kpis.overdue) : "—"}
          meta="Cần lưu ý"
          tone={kpis && kpis.overdue > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Kinh phí đã duyệt"
          value={kpis ? formatBudget(kpis.totalApprovedBudget) : "—"}
          meta="Tổng cộng"
          tone="default"
        />
        <KpiCard
          label="Nộp mới tháng này"
          value={kpis ? String(kpis.submittedThisMonth) : "—"}
          meta={new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" })}
          tone="default"
        />
      </div>

      <DashboardCharts />
    </>
  );
}
