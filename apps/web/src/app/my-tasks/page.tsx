"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  Search,
  Users
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";

type ScientistTask = {
  id: string;
  code: string;
  title: string;
  level: string;
  role: string;
  period: string;
  status: "in_progress" | "under_review" | "completed" | "draft";
  statusLabel: string;
  href: string;
};

const mockTasks: ScientistTask[] = [
  {
    id: "task-1",
    code: "HVQY-2026-NC01",
    title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
    level: "Cấp Học viện",
    role: "Chủ nhiệm đề tài",
    period: "2026 - 2027",
    status: "in_progress",
    statusLabel: "Đang thực hiện",
    href: "/proposals/prop-seed-001"
  },
  {
    id: "task-2",
    code: "BQP-2025-Y04",
    title: "Đánh giá hiệu quả phác đồ can thiệp sớm ở bệnh nhân đa chấn thương tại tuyến quân y cơ sở",
    level: "Cấp Bộ Quốc phòng",
    role: "Thành viên nghiên cứu chính",
    period: "2025 - 2026",
    status: "in_progress",
    statusLabel: "Đang thực hiện",
    href: "/proposals/prop-seed-002"
  },
  {
    id: "task-3",
    code: "HVQY-2026-X08",
    title: "Nghiên cứu đặc điểm dịch tễ và đề xuất giải pháp phòng chống sốt xuất huyết Dengue",
    level: "Cấp Học viện",
    role: "Chủ nhiệm đề tài",
    period: "2026 - 2026",
    status: "under_review",
    statusLabel: "Đang xét duyệt",
    href: "/my-proposals"
  },
  {
    id: "task-4",
    code: "HVQY-2024-NC12",
    title: "Nghiên cứu chế tạo kit chẩn đoán nhanh kháng thể đặc hiệu trong vi sinh lâm sàng",
    level: "Cấp Học viện",
    role: "Thư ký khoa học",
    period: "2024 - 2025",
    status: "completed",
    statusLabel: "Đã nghiệm thu",
    href: "/my-proposals"
  }
];

export default function MyTasksPage() {
  const [filter, setFilter] = useState<"all" | "in_progress" | "under_review" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTasks = mockTasks.filter((task) => {
    if (filter !== "all" && task.status !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return task.title.toLowerCase().includes(q) || task.code.toLowerCase().includes(q) || task.role.toLowerCase().includes(q);
    }
    return true;
  });

  const inProgressCount = mockTasks.filter((t) => t.status === "in_progress").length;
  const underReviewCount = mockTasks.filter((t) => t.status === "under_review").length;
  const completedCount = mockTasks.filter((t) => t.status === "completed").length;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Nhiệm vụ" }
        ]}
      />
      <PageHeader
        eyebrow="Nhiệm vụ khoa học và công nghệ"
        title="Nhiệm vụ của tôi"
        description="Theo dõi toàn bộ các nhiệm vụ, đề tài nghiên cứu khoa học bạn đang chủ nhiệm hoặc tham gia thực hiện."
      />

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "8px",
              background: "#eff6ff",
              color: "#1d4ed8",
              display: "grid",
              placeItems: "center"
            }}
          >
            <FolderKanban size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a" }}>{mockTasks.length}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Tổng số nhiệm vụ</div>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "8px",
              background: "#f0fdf4",
              color: "#15803d",
              display: "grid",
              placeItems: "center"
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#15803d" }}>{inProgressCount}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Đang thực hiện</div>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            padding: "16px 20px",
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "8px",
              background: "#fff7ed",
              color: "#c2410c",
              display: "grid",
              placeItems: "center"
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#c2410c" }}>{underReviewCount}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Đang xét duyệt</div>
          </div>
        </div>
      </div>

      <SectionCard title="Danh sách nhiệm vụ KH&CN" subtitle="Chi tiết các đề tài và nhiệm vụ nghiên cứu">
        {/* Bộ lọc & Tìm kiếm */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            paddingBottom: "16px",
            borderBottom: "1px solid #f1f5f9"
          }}
        >
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setFilter("all")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filter === "all" ? "#1e3a8a" : "#cbd5e1",
                background: filter === "all" ? "#1e3a8a" : "#ffffff",
                color: filter === "all" ? "#ffffff" : "#475569"
              }}
            >
              Tất cả ({mockTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("in_progress")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filter === "in_progress" ? "#15803d" : "#cbd5e1",
                background: filter === "in_progress" ? "#f0fdf4" : "#ffffff",
                color: filter === "in_progress" ? "#15803d" : "#475569"
              }}
            >
              Đang thực hiện ({inProgressCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("under_review")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filter === "under_review" ? "#c2410c" : "#cbd5e1",
                background: filter === "under_review" ? "#fff7ed" : "#ffffff",
                color: filter === "under_review" ? "#c2410c" : "#475569"
              }}
            >
              Đang xét duyệt ({underReviewCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("completed")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filter === "completed" ? "#0284c7" : "#cbd5e1",
                background: filter === "completed" ? "#f0f9ff" : "#ffffff",
                color: filter === "completed" ? "#0284c7" : "#475569"
              }}
            >
              Đã nghiệm thu ({completedCount})
            </button>
          </div>

          <div style={{ position: "relative", minWidth: "260px" }}>
            <Search
              size={16}
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
            />
            <input
              type="text"
              placeholder="Tìm theo tên nhiệm vụ, mã số..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 12px 7px 34px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <EmptyState
            title="Không tìm thấy nhiệm vụ nào"
            message="Chưa có nhiệm vụ phù hợp với bộ lọc hiện tại."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "40px", textAlign: "center" }}>STT</th>
                  <th>Mã nhiệm vụ</th>
                  <th>Tên nhiệm vụ KH&CN</th>
                  <th>Cấp quản lý</th>
                  <th>Vai trò</th>
                  <th>Thời gian</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task, index) => (
                  <tr key={task.id}>
                    <td style={{ textAlign: "center", color: "#64748b" }}>{index + 1}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#1e3a8a",
                          background: "#f1f5f9",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}
                      >
                        {task.code}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: "600", color: "#0f172a" }}>{task.title}</span>
                    </td>
                    <td>{task.level}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: task.role.includes("Chủ nhiệm") ? "#1e3a8a" : "#475569"
                        }}
                      >
                        {task.role}
                      </span>
                    </td>
                    <td>{task.period}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "600",
                          background:
                            task.status === "in_progress"
                              ? "#f0fdf4"
                              : task.status === "under_review"
                              ? "#fff7ed"
                              : "#f1f5f9",
                          color:
                            task.status === "in_progress"
                              ? "#15803d"
                              : task.status === "under_review"
                              ? "#c2410c"
                              : "#475569"
                        }}
                      >
                        {task.statusLabel}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={task.href}
                        className="button"
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <span>Chi tiết</span>
                        <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
