"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Search
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadMyReviewAssignments, type ReviewerQueueItem } from "@/lib/proposal-evaluations-api";

function formatDate(value?: string | null) {
  if (!value) return "Không đặt hạn";
  try {
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function getDueStatus(dueDateStr?: string | null, isSubmitted = false) {
  if (isSubmitted) return { label: "Đã nộp", tone: "success" };
  if (!dueDateStr) return { label: "Không đặt hạn", tone: "neutral" };
  try {
    const due = new Date(dueDateStr);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `Quá hạn ${Math.abs(diffDays)} ngày`, tone: "danger" };
    if (diffDays <= 3) return { label: `Còn ${diffDays} ngày`, tone: "warning" };
    return { label: `Còn ${diffDays} ngày`, tone: "info" };
  } catch {
    return { label: "Không đặt hạn", tone: "neutral" };
  }
}

export function ReviewerQueuePanel() {
  const [assignments, setAssignments] = useState<ReviewerQueueItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "submitted">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await loadMyReviewAssignments();
        if (!cancelled) {
          setAssignments(data);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingAssignments = useMemo(
    () => assignments.filter((a) => a.myReviewStatus !== "submitted"),
    [assignments]
  );
  const submittedAssignments = useMemo(
    () => assignments.filter((a) => a.myReviewStatus === "submitted"),
    [assignments]
  );

  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (filterTab === "pending") list = pendingAssignments;
    else if (filterTab === "submitted") list = submittedAssignments;

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (a) =>
        a.proposal.title.toLowerCase().includes(q) ||
        (a.proposal.code && a.proposal.code.toLowerCase().includes(q)) ||
        (a.assignmentRoleLabel && a.assignmentRoleLabel.toLowerCase().includes(q))
    );
  }, [assignments, filterTab, pendingAssignments, submittedAssignments, searchQuery]);

  if (state === "loading") {
    return (
      <SectionCard title="Được mời phản biện" subtitle="Đang tải dữ liệu...">
        <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
          <Clock size={28} className="animate-spin" style={{ margin: "0 auto 12px auto" }} />
          <p>Đang tải danh sách nhiệm vụ được mời phản biện...</p>
        </div>
      </SectionCard>
    );
  }

  if (state === "error") {
    return (
      <SectionCard title="Được mời phản biện" subtitle="Có lỗi xảy ra">
        <div style={{ padding: "32px", textAlign: "center", color: "#b91c1c" }}>
          <AlertCircle size={28} style={{ margin: "0 auto 12px auto" }} />
          <p>Không thể tải danh sách hồ sơ được phân công phản biện. Vui lòng thử lại sau.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Thống kê nhanh */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
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
            <FileCheck2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#0f172a" }}>{assignments.length}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Tổng số lời mời</div>
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
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#c2410c" }}>{pendingAssignments.length}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Chờ hoàn tất đánh giá</div>
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
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#15803d" }}>{submittedAssignments.length}</div>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>Đã gửi phiếu đánh giá</div>
          </div>
        </div>
      </div>

      <SectionCard
        title="Danh sách nhiệm vụ KH&CN được mời phản biện"
        subtitle="Quản lý và thực hiện đánh giá các đề tài được phân công"
      >
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
          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "all" ? "#1e3a8a" : "#cbd5e1",
                background: filterTab === "all" ? "#1e3a8a" : "#ffffff",
                color: filterTab === "all" ? "#ffffff" : "#475569"
              }}
            >
              Tất cả ({assignments.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pending")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "pending" ? "#c2410c" : "#cbd5e1",
                background: filterTab === "pending" ? "#fff7ed" : "#ffffff",
                color: filterTab === "pending" ? "#c2410c" : "#475569"
              }}
            >
              Chờ đánh giá ({pendingAssignments.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("submitted")}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                border: "1px solid",
                borderColor: filterTab === "submitted" ? "#15803d" : "#cbd5e1",
                background: filterTab === "submitted" ? "#f0fdf4" : "#ffffff",
                color: filterTab === "submitted" ? "#15803d" : "#475569"
              }}
            >
              Đã đánh giá ({submittedAssignments.length})
            </button>
          </div>

          {/* Ô tìm kiếm */}
          <div style={{ position: "relative", minWidth: "260px" }}>
            <Search
              size={16}
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
            />
            <input
              type="text"
              placeholder="Tìm kiếm mã hoặc tên đề tài..."
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

        {filteredAssignments.length === 0 ? (
          <EmptyState
            title="Không tìm thấy nhiệm vụ nào"
            message={
              assignments.length === 0
                ? "Hiện tại bạn chưa được phân công phản biện nhiệm vụ nào. Khi ban quản lý khoa học mời phản biện, đề tài sẽ hiển thị ở đây."
                : "Không có đề tài nào phù hợp với bộ lọc hoặc tìm kiếm hiện tại."
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px", textAlign: "center" }}>STT</th>
                    <th>Nhiệm vụ KH&CN / Đề tài</th>
                    <th>Vai trò</th>
                    <th>Hạn phản biện</th>
                    <th>Trạng thái hồ sơ</th>
                    <th>Phiếu đánh giá</th>
                    <th style={{ textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment, index) => {
                    const dueInfo = getDueStatus(assignment.dueDate, assignment.myReviewStatus === "submitted");
                    const isSubmitted = assignment.myReviewStatus === "submitted";

                    return (
                      <tr key={assignment.id}>
                        <td style={{ textAlign: "center", color: "#64748b", fontWeight: "500" }}>{index + 1}</td>
                        <td>
                          <Link
                            className="record-title"
                            href={`/proposals/${assignment.proposal.id}`}
                            style={{ fontWeight: "600", color: "#1e3a8a", textDecoration: "none" }}
                          >
                            {assignment.proposal.title}
                          </Link>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                background: "#f1f5f9",
                                color: "#475569",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontWeight: "600"
                              }}
                            >
                              {assignment.proposal.code || "Chưa cấp mã"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              background:
                                assignment.assignmentRole === "reviewer"
                                  ? "#e0e7ff"
                                  : "#fef3c7",
                              color:
                                assignment.assignmentRole === "reviewer"
                                  ? "#3730a3"
                                  : "#92400e"
                            }}
                          >
                            {assignment.assignmentRoleLabel}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: "500" }}>
                              {formatDate(assignment.dueDate)}
                            </span>
                            {dueInfo.tone === "danger" && (
                              <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: "600" }}>
                                ⚠ {dueInfo.label}
                              </span>
                            )}
                            {dueInfo.tone === "warning" && (
                              <span style={{ fontSize: "11px", color: "#d97706", fontWeight: "600" }}>
                                ⏳ {dueInfo.label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={assignment.proposal.status} />
                        </td>
                        <td>
                          {isSubmitted ? (
                            <div>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  color: "#15803d"
                                }}
                              >
                                <CheckCircle2 size={14} />
                                Đã gửi
                              </span>
                              <span style={{ display: "block", fontSize: "11px", color: "#64748b" }}>
                                {formatDate(assignment.myReviewSubmittedAt)}
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#c2410c"
                              }}
                            >
                              <Clock size={14} />
                              Chờ đánh giá
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px" }}>
                            <Link
                              href={`/proposals/${assignment.proposal.id}`}
                              className="button primary"
                              style={{
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: "600",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <FileText size={14} />
                              {isSubmitted ? "Xem lại phiếu" : "Vào đánh giá"}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="mobile-list">
              {filteredAssignments.map((assignment) => {
                const isSubmitted = assignment.myReviewStatus === "submitted";
                return (
                  <article className="list-card" key={assignment.id}>
                    <div className="list-card-header">
                      <Link className="record-title" href={`/proposals/${assignment.proposal.id}`}>
                        {assignment.proposal.title}
                      </Link>
                      <StatusBadge status={assignment.proposal.status} />
                    </div>
                    <span className="record-meta">
                      Mã: {assignment.proposal.code || "Chưa cấp mã"} · {assignment.assignmentRoleLabel}
                    </span>
                    <span className="record-meta">
                      Hạn đánh giá: {formatDate(assignment.dueDate)}
                    </span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                      <span className="record-meta">
                        Phiếu: {isSubmitted ? "Đã gửi" : "Chưa gửi"}
                      </span>
                      <Link
                        href={`/proposals/${assignment.proposal.id}`}
                        className="button primary"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        {isSubmitted ? "Xem lại" : "Đánh giá"}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
