"use client";

import { useEffect, useState } from "react";
import { Coins, Presentation, Timer } from "lucide-react";
import { ConferenceReportPanel } from "@/components/conferences/conference-stats";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { BudgetReportPanel } from "@/components/reports/budget-report-panel";
import { ProgressReportPanel } from "@/components/reports/progress-report-panel";

type ReportTab = "budget" | "progress" | "conferences";

const TAB_TITLES: Record<ReportTab, { crumb: string; title: string; description: string }> = {
  budget: {
    crumb: "Tình hình kinh phí đề tài",
    title: "Báo cáo tình hình kinh phí đề tài",
    description: "Tổng hợp, phân tích và theo dõi tình hình phân bổ, phê duyệt và thực hiện kinh phí các đề tài nghiên cứu khoa học tại Học viện Quân y."
  },
  progress: {
    crumb: "Tình hình thực hiện & tiến độ",
    title: "Báo cáo tình hình thực hiện & tiến độ đề tài",
    description: "Theo dõi tiến độ theo thời gian thực, đo lường thời hạn còn lại, phát hiện đề tài trễ hạn và cảnh báo đề tài sắp đến hạn hoàn thành."
  },
  conferences: {
    crumb: "Hội nghị khoa học",
    title: "Báo cáo hội nghị khoa học",
    description: "Số hội nghị, tỉ lệ nhận lời, tỉ lệ nộp tóm tắt và toàn văn, báo cáo viên theo đơn vị, theo từng hội nghị và từng phiên."
  }
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("budget");
  // Mở thẳng một tab từ đường dẫn, ví dụ /reports?tab=conferences (liên kết từ dashboard).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "budget" || tab === "progress" || tab === "conferences") setActiveTab(tab);
  }, []);

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Báo cáo tổng hợp", href: "/reports" },
          { label: TAB_TITLES[activeTab].crumb }
        ]}
      />
      <div className="no-print">
        <PageHeader
          eyebrow="Báo cáo & Thống kê"
          title={TAB_TITLES[activeTab].title}
          description={TAB_TITLES[activeTab].description}
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
          <button
            type="button"
            className={`tab-btn ${activeTab === "conferences" ? "active" : ""}`}
            onClick={() => setActiveTab("conferences")}
          >
            <Presentation size={16} aria-hidden="true" />
            <span>Báo cáo Hội nghị khoa học</span>
          </button>
        </nav>
      </div>

      {activeTab === "budget" ? <BudgetReportPanel /> : activeTab === "progress" ? <ProgressReportPanel /> : <ConferenceReportPanel />}
    </>
  );
}
