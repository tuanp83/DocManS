"use client";

import { useState } from "react";
import { Coins, Timer } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { BudgetReportPanel } from "@/components/reports/budget-report-panel";
import { ProgressReportPanel } from "@/components/reports/progress-report-panel";

type ReportTab = "budget" | "progress";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("budget");

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Báo cáo tổng hợp", href: "/reports" },
          { label: activeTab === "budget" ? "Tình hình kinh phí đề tài" : "Tình hình thực hiện & tiến độ" }
        ]}
      />
      <div className="no-print">
        <PageHeader
          eyebrow="Báo cáo & Thống kê"
          title={activeTab === "budget" ? "Báo cáo tình hình kinh phí đề tài" : "Báo cáo tình hình thực hiện & tiến độ đề tài"}
          description={
            activeTab === "budget"
              ? "Tổng hợp, phân tích và theo dõi tình hình phân bổ, phê duyệt và thực hiện kinh phí các đề tài nghiên cứu khoa học tại Học viện Quân y."
              : "Theo dõi tiến độ theo thời gian thực, đo lường thời hạn còn lại, phát hiện đề tài trễ hạn và cảnh báo đề tài sắp đến hạn hoàn thành."
          }
        />

        {/* Tab Navigation chuẩn phong cách STM & Lý lịch khoa học */}
        <nav className="tabs-nav" aria-label="Phân hệ Báo cáo đề tài" style={{ marginBottom: "20px" }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === "budget" ? "active" : ""}`}
            onClick={() => setActiveTab("budget")}
          >
            <Coins size={16} aria-hidden="true" />
            <span>Báo cáo Kinh phí đề tài</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "progress" ? "active" : ""}`}
            onClick={() => setActiveTab("progress")}
          >
            <Timer size={16} aria-hidden="true" />
            <span>Báo cáo Tình hình Thực hiện & Tiến độ</span>
          </button>
        </nav>
      </div>

      {activeTab === "budget" ? <BudgetReportPanel /> : <ProgressReportPanel />}
    </>
  );
}
