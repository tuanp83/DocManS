"use client";

import { useState, useEffect, useMemo } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Eye, Save } from "lucide-react";

export default function StudentResearchPage() {
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const router = useRouter();
  
  // Form state
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    studentName: "",
    studentClass: "",
    supervisorId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/v1/student-research");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/student-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setOpen(false);
        fetchProjects();
        setFormData({ code: "", name: "", studentName: "", studentClass: "", supervisorId: "" });
      } else {
        alert("Có lỗi xảy ra khi tạo đề tài.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProjects = useMemo(() => {
    const term = keyword.toLowerCase().trim();
    if (!term) return projects;
    return projects.filter((p: any) => 
      (p.title || p.name || "").toLowerCase().includes(term) ||
      (p.code || "").toLowerCase().includes(term) ||
      (p.studentName || "").toLowerCase().includes(term)
    );
  }, [keyword, projects]);

  return (
    <>
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "NCKH Sinh viên" }]} />
      <PageHeader
        eyebrow="NCKH"
        title="Đề tài NCKH Sinh viên"
        description="Quản lý, giám sát và nghiệm thu đề tài cấp sinh viên."
      />
      
      <div className="grid two-column">
        <SectionCard
          title="Danh sách đề tài sinh viên"
          subtitle="Theo dõi tiến độ, trạng thái và các tài liệu liên quan đến đề tài"
        >
          <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
            <label className="filter-field">
              <span>Từ khóa</span>
              <span className="field-input plain">
                <Search size={16} aria-hidden="true" />
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Mã số, Tên đề tài, Tên sinh viên..." />
              </span>
            </label>
          </div>

          {filteredProjects.length === 0 ? (
            <EmptyState title="Chưa có đề tài nào" message="Tạo đề tài đầu tiên cho sinh viên bằng biểu mẫu bên dưới hoặc thử lại từ khóa khác." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: "240px" }}>Mã & Tên đề tài</th>
                    <th style={{ minWidth: "150px" }}>Sinh viên / Lớp</th>
                    <th style={{ minWidth: "140px" }}>Tiến độ</th>
                    <th style={{ textAlign: "center" }}>Trạng thái</th>
                    <th style={{ textAlign: "center" }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <Link className="record-title" href={`/student-research/${p.id}`}>
                          {p.name}
                        </Link>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                          <span className="record-meta" style={{ fontWeight: 700, color: "#15803d" }}>
                            {p.code}
                          </span>
                          <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "var(--surface-muted, #f1f5f9)", color: "var(--text-primary)", fontWeight: 600 }}>
                            Cấp Sinh viên
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                          {p.studentName}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          Lớp: {p.studentClass}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: p.status === "COMPLETED" ? "#16a34a" : "#0891b2" }}>
                            {p.status === "COMPLETED" ? "Đã nghiệm thu" : "Đang thực hiện"}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
                            {p.status === "COMPLETED" ? "100%" : "30%"}
                          </span>
                        </div>
                        <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: p.status === "COMPLETED" ? "100%" : "30%",
                              height: "100%",
                              background: p.status === "COMPLETED" ? "#16a34a" : "#0891b2",
                              borderRadius: "3px",
                              transition: "width 0.3s ease"
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <StatusBadge status={p.status === "COMPLETED" ? "approved" : "under_review"} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <Link className="button" href={`/student-research/${p.id}`} style={{ padding: "5px 10px", fontSize: "12px" }}>
                          <Eye size={14} aria-hidden="true" />
                          Xem
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Tạo đề tài sinh viên mới" subtitle="Nhập các thông tin cơ bản để khởi tạo đề tài mới cho sinh viên">
          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="form-section-inline">
              <div className="section-mini-heading">Thông tin đề tài</div>
              <label className="field">
                <span>Mã đề tài</span>
                <input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="VD: SV2026-01" required />
              </label>
              <label className="field">
                <span>Tên đề tài</span>
                <textarea rows={2} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nhập tên đề tài..." required />
              </label>
            </div>

            <div className="form-section-inline">
              <div className="section-mini-heading">Thông tin thực hiện</div>
              <div className="form-grid two">
                <label className="field">
                  <span>Họ tên sinh viên</span>
                  <input value={formData.studentName} onChange={(e) => setFormData({ ...formData, studentName: e.target.value })} placeholder="Nguyễn Văn A" required />
                </label>
                <label className="field">
                  <span>Lớp hành chính</span>
                  <input value={formData.studentClass} onChange={(e) => setFormData({ ...formData, studentClass: e.target.value })} placeholder="AT18A" required />
                </label>
              </div>
              <label className="field">
                <span>User ID Giảng viên hướng dẫn</span>
                <input value={formData.supervisorId} onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })} placeholder="VD: uuid..." required />
              </label>
            </div>

            <button className="button primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {isSubmitting ? "Đang tạo..." : "Khởi tạo đề tài"}
            </button>
          </form>
        </SectionCard>
      </div>
    </>
  );
}

