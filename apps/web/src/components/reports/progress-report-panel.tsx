"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  PieChart,
  Printer,
  RefreshCw,
  Search,
  Timer
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadResearchProposals, type ResearchProposal } from "@/lib/research-proposals-api";
import { useSession } from "@/components/auth/session-provider";
import {
  PROPOSAL_LEVEL_LABELS,
  MILITARY_SCOPE_LABELS,
  getProposalLevelLabel,
  getProposalMilitaryScope,
  getProposalMilitaryScopeLabel
} from "@/lib/proposal-classification";

type LoadState = "loading" | "ready" | "error";

type ProgressAssessment = "on_track" | "ending_soon" | "overdue" | "not_started" | "unknown";

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
  } catch {
    return value;
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Bản nháp",
  submitted: "Đã nộp",
  supplement_requested: "Yêu cầu bổ sung",
  resubmitted: "Đã nộp lại",
  under_review: "Đang thẩm định",
  ready_for_approval: "Chờ phê duyệt",
  approved: "Đã phê duyệt",
  rejected: "Không duyệt"
};

export function ProgressReportPanel() {
  const { account } = useSession();
  const [state, setState] = useState<LoadState>("loading");
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [progressFilter, setProgressFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedMilitaryScope, setSelectedMilitaryScope] = useState("");

  async function loadData() {
    setState("loading");
    try {
      const data = await loadResearchProposals();
      setProposals(data);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Danh sách các đơn vị từ dữ liệu
  const unitOptions = useMemo(() => {
    const unitsMap = new Map<string, string>();
    (account?.organizationScopes ?? []).forEach((scope: { id: string; name: string }) => {
      unitsMap.set(scope.id, scope.name);
    });
    proposals.forEach((p) => {
      const id = p.hostOrganizationUnitId;
      const name = p.hostOrganizationUnitName || id;
      if (id && !unitsMap.has(id)) {
        unitsMap.set(id, name);
      }
    });
    return Array.from(unitsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [account?.organizationScopes, proposals]);

  // Phân tích tiến độ chi tiết của mỗi đề tài
  const enhancedProposals = useMemo(() => {
    const now = new Date();
    // Bỏ giờ phút giây để so sánh ngày chuẩn xác
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return proposals.map((proposal) => {
      const start = proposal.startDate ? new Date(proposal.startDate) : null;
      const end = proposal.endDate ? new Date(proposal.endDate) : null;

      let assessment: ProgressAssessment = "unknown";
      let remainingDays = 0;
      let totalDays = 0;
      let elapsedDays = 0;
      let progressPercent = 0;

      if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        totalDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)));
        remainingDays = Math.round((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        elapsedDays = Math.round((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));

        if (today < startDay) {
          assessment = "not_started";
          progressPercent = 0;
        } else if (remainingDays < 0) {
          assessment = "overdue";
          progressPercent = 100;
        } else if (remainingDays <= 60) {
          assessment = "ending_soon";
          progressPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
        } else {
          assessment = "on_track";
          progressPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
        }
      }

      return {
        ...proposal,
        start,
        end,
        totalDays,
        remainingDays,
        elapsedDays,
        progressPercent,
        assessment
      };
    });
  }, [proposals]);

  // Lọc dữ liệu theo điều kiện
  const filteredProposals = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return enhancedProposals.filter((p) => {
      const matchKeyword =
        !kw ||
        p.title.toLowerCase().includes(kw) ||
        (p.code && p.code.toLowerCase().includes(kw)) ||
        (p.ownerDisplayName && p.ownerDisplayName.toLowerCase().includes(kw));

      const matchUnit = !selectedUnit || p.hostOrganizationUnitId === selectedUnit;
      const matchStatus = !statusFilter || p.status === statusFilter;
      const matchProgress = !progressFilter || p.assessment === progressFilter;
      const matchLevel = !selectedLevel || p.proposalTypeCode === selectedLevel;
      const matchMilitary = !selectedMilitaryScope || getProposalMilitaryScope(p) === selectedMilitaryScope;

      return matchKeyword && matchUnit && matchStatus && matchProgress && matchLevel && matchMilitary;
    });
  }, [enhancedProposals, keyword, selectedUnit, statusFilter, progressFilter, selectedLevel, selectedMilitaryScope]);

  // Thống kê KPIs
  const metrics = useMemo(() => {
    let onTrackCount = 0;
    let endingSoonCount = 0;
    let overdueCount = 0;
    let notStartedCount = 0;
    let unknownCount = 0;

    filteredProposals.forEach((p) => {
      if (p.assessment === "on_track") onTrackCount++;
      else if (p.assessment === "ending_soon") endingSoonCount++;
      else if (p.assessment === "overdue") overdueCount++;
      else if (p.assessment === "not_started") notStartedCount++;
      else unknownCount++;
    });

    return {
      total: filteredProposals.length,
      onTrackCount,
      endingSoonCount,
      overdueCount,
      notStartedCount,
      unknownCount
    };
  }, [filteredProposals]);

  // Thống kê tiến độ theo Đơn vị chủ trì
  const unitProgressStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; onTrack: number; endingSoon: number; overdue: number }>();

    filteredProposals.forEach((p) => {
      const unitId = p.hostOrganizationUnitId || "unknown";
      const unitName = p.hostOrganizationUnitName || unitId;
      const current = map.get(unitId) ?? { name: unitName, total: 0, onTrack: 0, endingSoon: 0, overdue: 0 };

      current.total += 1;
      if (p.assessment === "on_track") current.onTrack += 1;
      else if (p.assessment === "ending_soon") current.endingSoon += 1;
      else if (p.assessment === "overdue") current.overdue += 1;

      map.set(unitId, current);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredProposals]);

  // Xuất file Excel (CSV UTF-8 BOM)
  function exportToCsv() {
    const headers = [
      "STT",
      "Mã đề tài",
      "Tên đề tài nghiên cứu",
      "Cấp đề tài",
      "Phân loại Quân sự / Dân sự",
      "Chủ nhiệm đề tài (PI)",
      "Đơn vị chủ trì",
      "Ngày bắt đầu",
      "Ngày kết thúc",
      "Trạng thái hồ sơ",
      "Tình trạng tiến độ",
      "Thời hạn còn lại / Quá hạn",
      "Tiến độ thời gian (%)"
    ];

    const rows = filteredProposals.map((p, idx) => {
      let assessLabel = "Chưa xác định";
      let timeNote = "—";

      if (p.assessment === "on_track") {
        assessLabel = "Đang thực hiện đúng hạn";
        timeNote = `Còn ${p.remainingDays} ngày`;
      } else if (p.assessment === "ending_soon") {
        assessLabel = "Sắp đến hạn kết thúc";
        timeNote = `Còn ${p.remainingDays} ngày`;
      } else if (p.assessment === "overdue") {
        assessLabel = "Chậm tiến độ / Quá hạn";
        timeNote = `Quá hạn ${Math.abs(p.remainingDays)} ngày`;
      } else if (p.assessment === "not_started") {
        assessLabel = "Chưa đến thời gian bắt đầu";
        timeNote = `Bắt đầu sau ${Math.abs(p.elapsedDays)} ngày`;
      }

      return [
        idx + 1,
        `"${(p.code || p.id).replace(/"/g, '""')}"`,
        `"${p.title.replace(/"/g, '""')}"`,
        `"${getProposalLevelLabel(p.proposalTypeCode).replace(/"/g, '""')}"`,
        `"${getProposalMilitaryScopeLabel(getProposalMilitaryScope(p)).replace(/"/g, '""')}"`,
        `"${(p.ownerDisplayName || "—").replace(/"/g, '""')}"`,
        `"${(p.hostOrganizationUnitName || p.hostOrganizationUnitId).replace(/"/g, '""')}"`,
        formatDate(p.startDate),
        formatDate(p.endDate),
        `"${(STATUS_LABELS[p.status] ?? p.status).replace(/"/g, '""')}"`,
        `"${assessLabel}"`,
        `"${timeNote}"`,
        `${p.progressPercent}%`
      ].join(",");
    });

    const summaryRow = [
      "",
      "TỔNG CỘNG",
      `"${filteredProposals.length} đề tài"`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `"Đúng hạn: ${metrics.onTrackCount} | Sắp hết hạn: ${metrics.endingSoonCount} | Quá hạn: ${metrics.overdueCount}"`,
      "",
      ""
    ].join(",");

    const csvContent = "\uFEFF" + [
      "HỌC VIỆN QUÂN Y - PHÒNG KHOA HỌC QUÂN SỰ",
      "BÁO CÁO TỔNG HỢP TÌNH HÌNH THỰC HIỆN VÀ TIẾN ĐỘ ĐỀ TÀI",
      `Ngày xuất báo cáo: ${new Date().toLocaleDateString("vi-VN")}`,
      `Người lập: ${account?.name || "Cán bộ quản lý"}`,
      "",
      headers.join(","),
      ...rows,
      summaryRow
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Bao_cao_tien_do_de_tai_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Chức năng In báo cáo
  function handlePrint() {
    window.print();
  }

  return (
    <div className="progress-report-container">
      {/* Header thanh công cụ */}
      <div className="report-action-bar no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Báo cáo Tình hình Thực hiện & Tiến độ Đề tài KH&CN
          </h2>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Theo dõi tiến độ theo thời gian thực, phát hiện trễ hạn và cảnh báo đề tài sắp đến hạn hoàn thành
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="button secondary" onClick={() => void loadData()} title="Làm mới dữ liệu">
            <RefreshCw size={15} aria-hidden="true" />
            Làm mới
          </button>
          <button type="button" className="button secondary" onClick={exportToCsv} disabled={filteredProposals.length === 0} title="Xuất dữ liệu Excel (CSV)">
            <FileSpreadsheet size={15} aria-hidden="true" />
            Xuất Excel
          </button>
          <button type="button" className="button primary" onClick={handlePrint} disabled={filteredProposals.length === 0} title="In báo cáo tiến độ hoặc lưu PDF">
            <Printer size={15} aria-hidden="true" />
            In báo cáo / PDF
          </button>
        </div>
      </div>

      {/* Mẫu tiêu đề In ấn chính thức (Chỉ hiện khi In) */}
      <div className="print-only-header" style={{ display: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div style={{ textAlign: "center", fontSize: "13px" }}>
            <p style={{ margin: "0 0 2px 0", fontWeight: 600 }}>HỌC VIỆN QUÂN Y</p>
            <p style={{ margin: 0, fontWeight: 700, textDecoration: "underline" }}>PHÒNG KHOA HỌC QUÂN SỰ</p>
          </div>
          <div style={{ textAlign: "center", fontSize: "13px" }}>
            <p style={{ margin: "0 0 2px 0", fontWeight: 700 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p style={{ margin: 0, fontWeight: 700, textDecoration: "underline" }}>Độc lập - Tự do - Hạnh phúc</p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px 0", textTransform: "uppercase" }}>
            BÁO CÁO TỔNG HỢP TÌNH HÌNH THỰC HIỆN VÀ TIẾN ĐỘ ĐỀ TÀI
          </h1>
          <p style={{ fontSize: "13px", fontStyle: "italic", margin: 0 }}>
            Hà Nội, ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {/* Khối KPI Cards Tiến độ */}
      <div className="grid four-column no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        <KpiCard
          label="Tổng số đề tài theo dõi"
          value={`${metrics.total}`}
          meta="Đề tài trong phạm vi báo cáo"
          tone="default"
        />
        <KpiCard
          label="Đang thực hiện đúng hạn"
          value={`${metrics.onTrackCount}`}
          meta="Tiến độ đảm bảo kế hoạch"
          tone="info"
        />
        <KpiCard
          label="Sắp đến hạn hoàn thành"
          value={`${metrics.endingSoonCount}`}
          meta="Còn dưới 60 ngày cần nghiệm thu"
          tone="warning"
        />
        <KpiCard
          label="Chậm tiến độ / Quá hạn"
          value={`${metrics.overdueCount}`}
          meta="Đã quá thời hạn kết thúc đăng ký"
          tone={metrics.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* Khối Phân tích Cơ cấu Tiến độ & Đơn vị */}
      <div className="grid two-column no-print" style={{ marginBottom: "20px" }}>
        {/* Phân bổ tỷ lệ tiến độ */}
        <SectionCard
          title="Tỷ lệ tình trạng tiến độ thực hiện"
          subtitle="Tỷ lệ đề tài đúng hạn, sắp đến hạn và chậm tiến độ toàn Học viện"
        >
          {metrics.total === 0 ? (
            <p className="section-copy" style={{ fontStyle: "italic" }}>Chưa có dữ liệu đề tài.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
              {/* Đúng hạn */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "var(--institutional-green, #15803d)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle2 size={15} /> Đúng hạn ({metrics.onTrackCount} đề tài)
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {Math.round((metrics.onTrackCount / metrics.total) * 100)}%
                  </span>
                </div>
                <div style={{ height: "8px", background: "var(--surface-muted, #f1f5f9)", borderRadius: "4px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(metrics.onTrackCount / metrics.total) * 100}%`,
                      background: "var(--institutional-green, #15803d)",
                      borderRadius: "4px"
                    }}
                  />
                </div>
              </div>

              {/* Sắp đến hạn */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "var(--warning, #d97706)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock3 size={15} /> Sắp đến hạn (&lt; 60 ngày) ({metrics.endingSoonCount} đề tài)
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {Math.round((metrics.endingSoonCount / metrics.total) * 100)}%
                  </span>
                </div>
                <div style={{ height: "8px", background: "var(--surface-muted, #f1f5f9)", borderRadius: "4px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(metrics.endingSoonCount / metrics.total) * 100}%`,
                      background: "var(--warning, #d97706)",
                      borderRadius: "4px"
                    }}
                  />
                </div>
              </div>

              {/* Chậm tiến độ / Quá hạn */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "var(--danger, #dc2626)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <AlertTriangle size={15} /> Chậm tiến độ / Quá hạn ({metrics.overdueCount} đề tài)
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {Math.round((metrics.overdueCount / metrics.total) * 100)}%
                  </span>
                </div>
                <div style={{ height: "8px", background: "var(--surface-muted, #f1f5f9)", borderRadius: "4px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(metrics.overdueCount / metrics.total) * 100}%`,
                      background: "var(--danger, #dc2626)",
                      borderRadius: "4px"
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Tiến độ theo đơn vị */}
        <SectionCard
          title="Tình hình thực hiện theo Đơn vị chủ trì"
          subtitle="Thống kê số lượng đề tài đúng hạn và chậm tiến độ của từng đơn vị"
        >
          {unitProgressStats.length === 0 ? (
            <p className="section-copy" style={{ fontStyle: "italic" }}>Chưa có dữ liệu đơn vị.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" }}>
              {unitProgressStats.slice(0, 5).map((unit) => (
                <div key={unit.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--surface-muted, #f8fafc)", borderRadius: "6px", fontSize: "13px" }}>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{unit.name}</span>
                    <span style={{ color: "var(--text-secondary)", marginLeft: "6px" }}>({unit.total} đề tài)</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <span style={{ padding: "2px 6px", background: "#f0fdf4", color: "#15803d", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                      {unit.onTrack} đúng hạn
                    </span>
                    {unit.endingSoon > 0 && (
                      <span style={{ padding: "2px 6px", background: "#fffbeb", color: "#b45309", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                        {unit.endingSoon} sắp hết hạn
                      </span>
                    )}
                    {unit.overdue > 0 && (
                      <span style={{ padding: "2px 6px", background: "#fef2f2", color: "#b91c1c", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                        {unit.overdue} quá hạn
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Khối Bộ lọc tiến độ */}
      <div className="section-card no-print" style={{ marginBottom: "20px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 700 }}>
          <Filter size={16} aria-hidden="true" />
          <span>BỘ LỌC TÌNH HÌNH TIẾN ĐỘ THỰC HIỆN</span>
        </div>
        <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: 0 }}>
          <div className="filter-field">
            <label htmlFor="progress-search">Tìm kiếm đề tài / Chủ nhiệm</label>
            <input
              id="progress-search"
              type="text"
              placeholder="Nhập tên đề tài, mã số hoặc chủ nhiệm..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="filter-field">
            <label htmlFor="progress-level">Cấp quản lý đề tài</label>
            <select
              id="progress-level"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="">Tất cả các cấp</option>
              <option value="national-level">Cấp Quốc gia</option>
              <option value="ministry-level">Cấp Bộ Quốc phòng</option>
              <option value="branch-level">Cấp Ngành / Cục</option>
              <option value="academy-level">Cấp Học viện</option>
              <option value="grassroots-level">Cấp Cơ sở</option>
              <option value="student-level">Sinh viên / Học viên NCKH</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="progress-military">Phân loại Quân sự / Dân sự</label>
            <select
              id="progress-military"
              value={selectedMilitaryScope}
              onChange={(e) => setSelectedMilitaryScope(e.target.value)}
            >
              <option value="">Tất cả tính chất</option>
              <option value="military">Quân sự - Quốc phòng</option>
              <option value="civilian">Ngoài quân đội (Dân sự)</option>
              <option value="dual-use">Lưỡng dụng (Quân - Dân y)</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="progress-assessment">Đánh giá tiến độ</label>
            <select
              id="progress-assessment"
              value={progressFilter}
              onChange={(e) => setProgressFilter(e.target.value)}
            >
              <option value="">Tất cả tình trạng tiến độ</option>
              <option value="on_track">Đang thực hiện đúng hạn</option>
              <option value="ending_soon">Sắp đến hạn (&lt; 60 ngày)</option>
              <option value="overdue">Chậm tiến độ / Quá hạn</option>
              <option value="not_started">Chưa đến ngày bắt đầu</option>
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="progress-unit">Đơn vị chủ trì</label>
            <select
              id="progress-unit"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
            >
              <option value="">Tất cả đơn vị</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="progress-status">Trạng thái hồ sơ</label>
            <select
              id="progress-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="approved">Đã phê duyệt (Đang thực hiện)</option>
              <option value="under_review">Đang thẩm định</option>
              <option value="ready_for_approval">Chờ phê duyệt</option>
              <option value="submitted">Đã nộp</option>
              <option value="draft">Bản nháp</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng dữ liệu chi tiết tiến độ mỗi đề tài */}
      <SectionCard
        title={`Bảng theo dõi tiến độ chi tiết (${filteredProposals.length} đề tài)`}
        subtitle="Chi tiết thời gian thực hiện, thời hạn còn lại và đánh giá tiến độ của từng đề tài"
      >
        {state === "loading" ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
            <p>Đang tổng hợp dữ liệu tiến độ thực hiện đề tài...</p>
          </div>
        ) : state === "error" ? (
          <EmptyState
            title="Lỗi tải dữ liệu tiến độ"
            message="Không thể kết nối đến máy chủ để lấy số liệu thực hiện đề tài. Vui lòng thử lại sau."
          />
        ) : filteredProposals.length === 0 ? (
          <EmptyState
            title="Không tìm thấy đề tài phù hợp"
            message="Không có đề tài nào khớp với điều kiện lọc tiến độ hiện tại. Hãy thử thay đổi bộ lọc."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: "45px", textAlign: "center" }}>STT</th>
                  <th style={{ width: "120px" }}>Mã đề tài</th>
                  <th style={{ minWidth: "240px" }}>Tên đề tài nghiên cứu</th>
                  <th style={{ width: "160px" }}>Cấp & Phân loại</th>
                  <th style={{ width: "140px" }}>Chủ nhiệm (PI)</th>
                  <th style={{ width: "150px" }}>Đơn vị chủ trì</th>
                  <th style={{ width: "105px" }}>Ngày bắt đầu</th>
                  <th style={{ width: "105px" }}>Ngày kết thúc</th>
                  <th style={{ width: "135px" }}>Thời hạn còn lại</th>
                  <th style={{ width: "155px", textAlign: "center" }}>Tình trạng tiến độ</th>
                  <th className="no-print" style={{ width: "70px", textAlign: "center" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map((p, index) => {
                  const scope = getProposalMilitaryScope(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                        {index + 1}
                      </td>
                      <td>
                        <Link className="record-title" href={`/proposals/${p.id}`}>
                          {p.code || "Chưa cấp mã"}
                        </Link>
                      </td>
                      <td>
                        <Link className="record-title" href={`/proposals/${p.id}`} style={{ fontWeight: 600 }}>
                          {p.title}
                        </Link>
                        <div style={{ marginTop: "4px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            Trạng thái: <strong>{STATUS_LABELS[p.status] ?? p.status}</strong>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
                            {getProposalLevelLabel(p.proposalTypeCode)}
                          </span>
                          <div>
                            {scope === "military" ? (
                              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#f0fdf4", color: "#166534", fontWeight: 600, border: "1px solid #bbf7d0", display: "inline-block" }}>
                                Quân sự - QP
                              </span>
                            ) : scope === "dual-use" ? (
                              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#fefce8", color: "#854d0e", fontWeight: 600, border: "1px solid #fef08a", display: "inline-block" }}>
                                Lưỡng dụng
                              </span>
                            ) : (
                              <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#eff6ff", color: "#1e40af", fontWeight: 600, border: "1px solid #bfdbfe", display: "inline-block" }}>
                                Ngoài QĐ (Dân sự)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                          {p.ownerDisplayName || "—"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "13px" }}>
                          {p.hostOrganizationUnitName || p.hostOrganizationUnitId}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
                        {formatDate(p.startDate)}
                      </td>
                      <td style={{ fontSize: "13px", whiteSpace: "nowrap", fontWeight: 600 }}>
                        {formatDate(p.endDate)}
                      </td>
                      <td>
                        {p.assessment === "on_track" ? (
                          <span style={{ color: "var(--institutional-green, #15803d)", fontWeight: 600, fontSize: "13px" }}>
                            Còn {p.remainingDays} ngày
                          </span>
                        ) : p.assessment === "ending_soon" ? (
                          <span style={{ color: "var(--warning, #d97706)", fontWeight: 700, fontSize: "13px" }}>
                            Còn {p.remainingDays} ngày
                          </span>
                        ) : p.assessment === "overdue" ? (
                          <span style={{ color: "var(--danger, #dc2626)", fontWeight: 700, fontSize: "13px" }}>
                            Quá hạn {Math.abs(p.remainingDays)} ngày
                          </span>
                        ) : p.assessment === "not_started" ? (
                          <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                            Bắt đầu sau {Math.abs(p.elapsedDays)} ngày
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "12px" }}>
                            Chưa có ngày kết thúc
                          </span>
                        )}
                        {p.totalDays > 0 && p.assessment !== "not_started" && (
                          <div style={{ height: "4px", background: "var(--surface-muted, #f1f5f9)", borderRadius: "2px", overflow: "hidden", marginTop: "4px" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${p.progressPercent}%`,
                                background: p.assessment === "overdue" ? "var(--danger, #dc2626)" : p.assessment === "ending_soon" ? "var(--warning, #d97706)" : "var(--institutional-green, #15803d)"
                              }}
                            />
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {p.assessment === "on_track" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "#f0fdf4", color: "#15803d", borderRadius: "12px", fontSize: "12px", fontWeight: 600, border: "1px solid #bbf7d0" }}>
                            <CheckCircle2 size={13} /> Đúng hạn
                          </span>
                        ) : p.assessment === "ending_soon" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "#fffbeb", color: "#b45309", borderRadius: "12px", fontSize: "12px", fontWeight: 700, border: "1px solid #fde68a" }}>
                            <Clock3 size={13} /> Sắp hết hạn
                          </span>
                        ) : p.assessment === "overdue" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", fontSize: "12px", fontWeight: 700, border: "1px solid #fecaca" }}>
                            <AlertTriangle size={13} /> Chậm tiến độ
                          </span>
                        ) : p.assessment === "not_started" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "#f8fafc", color: "#64748b", borderRadius: "12px", fontSize: "12px", fontWeight: 500, border: "1px solid #e2e8f0" }}>
                            <Clock size={13} /> Chưa khởi động
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "12px" }}>
                            Chưa xác định
                          </span>
                        )}
                      </td>
                      <td className="no-print" style={{ textAlign: "center" }}>
                        <Link className="button secondary" href={`/proposals/${p.id}`} style={{ padding: "4px 8px", fontSize: "12px" }} title="Xem chi tiết hồ sơ đề tài">
                          <Eye size={14} aria-hidden="true" />
                          Xem
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ background: "var(--surface-muted, #f8fafc)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                <tr>
                  <td colSpan={5} style={{ padding: "12px 16px", textAlign: "right", textTransform: "uppercase" }}>
                    TỔNG CỘNG ({filteredProposals.length} đề tài):
                  </td>
                  <td colSpan={5} style={{ padding: "12px 16px", fontSize: "13px" }}>
                    <span style={{ color: "#15803d", marginRight: "12px" }}>Đúng hạn: {metrics.onTrackCount}</span>
                    <span style={{ color: "#b45309", marginRight: "12px" }}>Sắp hết hạn: {metrics.endingSoonCount}</span>
                    <span style={{ color: "#b91c1c" }}>Chậm tiến độ: {metrics.overdueCount}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Phần chữ ký In ấn chính thức (Chỉ hiện khi In) */}
      <div className="print-only-signatures" style={{ display: "none", marginTop: "40px", pageBreakInside: "avoid" }}>
        <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center", fontSize: "13px" }}>
          <div style={{ width: "200px" }}>
            <p style={{ fontWeight: 700, margin: "0 0 60px 0" }}>NGƯỜI LẬP BÁO CÁO</p>
            <p style={{ margin: 0, fontWeight: 600 }}>{account?.name || "Cán bộ quản lý"}</p>
          </div>
          <div style={{ width: "220px" }}>
            <p style={{ fontWeight: 700, margin: "0 0 60px 0" }}>TRƯỞNG PHÒNG KHQS</p>
            <p style={{ margin: 0, fontWeight: 600 }}>Đại tá, PGS.TS...</p>
          </div>
          <div style={{ width: "220px" }}>
            <p style={{ fontWeight: 700, margin: "0 0 60px 0" }}>THỦ TRƯỞNG HỌC VIỆN</p>
            <p style={{ margin: 0, fontWeight: 600 }}>Trung tướng, GS.TS...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
